import { createHash, randomUUID } from 'node:crypto';
import type { Sql, TransactionSql } from 'postgres';

type Executor = Sql | TransactionSql;
type SchemaReadiness = { extensions: boolean; leases: boolean; posterLedger: boolean; posterReservations: boolean; mfa: boolean };
export interface DeletionJob { deletionId: string; userId: string | null; subjectHash: string; status: string }
export interface DeletionClaim { outboxId: string; leaseOwner?: string }
export interface DeletionOutboxEvent extends DeletionClaim { deletionId: string; subjectHash: string }
export interface SweepResult { orphanMedia: number; idempotencyKeys: number; areaSnapshots: number; tombstones: number }
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
export const DELETED_DISPLAY_NAME = 'Pengguna Dihapus';
const DELETION_LEASE_SECONDS = 15 * 60;
const INVALID_APPROVAL = { status: 'invalidated', contentRevision: null, sourceRevision: null, renditionId: null, approvedAt: null };

/** Cleanup is driven by installed schema, including after feature flags are rolled back. */
export class MaintenanceRepository {
  constructor(private readonly sql: Sql) {}

  private async readiness(db: Executor = this.sql): Promise<SchemaReadiness> {
    const [row] = await db<SchemaReadiness[]>`SELECT to_regclass('media_cleanup_tasks') IS NOT NULL AS extensions,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='outbox_events' AND column_name='lease_owner' AND table_schema=current_schema()) AS leases,
      to_regclass('instagram_rendition_objects') IS NOT NULL AS "posterLedger",
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='instagram_rendition_objects' AND column_name='reservation_expires_at' AND table_schema=current_schema()) AS "posterReservations",
      to_regclass('mfa_factors') IS NOT NULL AS mfa`;
    return row ?? { extensions: false, leases: false, posterLedger: false, posterReservations:false, mfa: false };
  }

  async claimDeletionEvent(): Promise<DeletionOutboxEvent | null> {
    return this.sql.begin(async tx => {
      const schema = await this.readiness(tx);
      const stale = schema.leases
        ? tx`OR (state='processing' AND (lease_expires_at<now() OR (lease_expires_at IS NULL AND updated_at<now()-interval '15 minutes')))`
        : tx`OR (state='processing' AND updated_at<now()-interval '15 minutes')`;
      const [row] = await tx<{id:string;aggregate_id:string;payload_minimal:{subjectHash?:string}}[]>`SELECT id,aggregate_id,payload_minimal FROM outbox_events
        WHERE topic='account.deletion.requested' AND next_attempt_at<=now() AND (state='pending' ${stale})
        ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!row) return null;
      if (schema.leases) {
        const owner = randomUUID();
        await tx`UPDATE outbox_events SET state='processing',attempts=attempts+1,lease_owner=${owner},lease_expires_at=now()+${DELETION_LEASE_SECONDS}*interval '1 second',updated_at=now() WHERE id=${row.id}`;
        return { outboxId:row.id,deletionId:row.aggregate_id,subjectHash:row.payload_minimal?.subjectHash??'',leaseOwner:owner };
      }
      await tx`UPDATE outbox_events SET state='processing',attempts=attempts+1,updated_at=now() WHERE id=${row.id}`;
      return {outboxId:row.id,deletionId:row.aggregate_id,subjectHash:row.payload_minimal?.subjectHash??''};
    });
  }

  async heartbeatDeletion(claim: DeletionClaim): Promise<void> {
    if (claim.leaseOwner) {
      const rows = await this.sql`UPDATE outbox_events SET lease_expires_at=now()+${DELETION_LEASE_SECONDS}*interval '1 second',updated_at=now()
        WHERE id=${claim.outboxId} AND lease_owner=${claim.leaseOwner} AND state='processing' RETURNING id`;
      if (!rows.length) throw new Error('DELETION_LEASE_LOST');
    } else {
      await this.sql`UPDATE outbox_events SET updated_at=now() WHERE id=${claim.outboxId} AND state='processing'`;
    }
  }
  private async fence(tx: TransactionSql, claim?: DeletionClaim): Promise<void> {
    if (!claim?.leaseOwner) return;
    const rows = await tx`SELECT id FROM outbox_events WHERE id=${claim.outboxId} AND lease_owner=${claim.leaseOwner} AND state='processing' FOR UPDATE`;
    if (!rows.length) throw new Error('DELETION_LEASE_LOST');
  }
  async markOutboxDelivered(outboxId:string,leaseOwner?:string):Promise<void> {
    if (leaseOwner) await this.sql`UPDATE outbox_events SET state='delivered',lease_owner=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=${outboxId} AND lease_owner=${leaseOwner}`;
    else await this.sql`UPDATE outbox_events SET state='delivered',updated_at=now() WHERE id=${outboxId}`;
  }
  async markOutboxRetry(outboxId:string,delayMs:number,leaseOwner?:string):Promise<void> {
    if (leaseOwner) await this.sql`UPDATE outbox_events SET state='pending',lease_owner=NULL,lease_expires_at=NULL,next_attempt_at=now()+make_interval(secs=>${delayMs/1000}),updated_at=now() WHERE id=${outboxId} AND lease_owner=${leaseOwner}`;
    else await this.sql`UPDATE outbox_events SET state='pending',next_attempt_at=now()+make_interval(secs=>${delayMs/1000}),updated_at=now() WHERE id=${outboxId}`;
  }
  async loadDeletionJob(id:string):Promise<DeletionJob|null> {
    const [r]=await this.sql<{id:string;user_id:string|null;subject_hash:string;status:string}[]>`SELECT id,user_id,subject_hash,status FROM deletion_requests WHERE id=${id}`;
    return r?{deletionId:r.id,userId:r.user_id,subjectHash:r.subject_hash,status:r.status}:null;
  }
  async markDeletionRunning(id:string):Promise<void> {await this.sql`UPDATE deletion_requests SET status='running' WHERE id=${id} AND status<>'completed'`;}
  async markDeletionFailed(id:string,code:string):Promise<void> {await this.sql`UPDATE deletion_requests SET status='failed',last_error_code=${code} WHERE id=${id} AND status<>'completed'`;}

  /** Persist invalidation and external cleanup intents before any object is removed. */
  async prepareDeletion(deletionId:string,userId:string|null,claim?:DeletionClaim):Promise<void> {
    const schema=await this.readiness();
    if (!schema.extensions || !userId) return;
    await this.sql.begin(async tx => {
      await this.fence(tx,claim);
      const [request]=await tx<{extension_prepared_at:Date|null;status:string}[]>`SELECT extension_prepared_at,status FROM deletion_requests WHERE id=${deletionId} FOR UPDATE`;
      if (!request || request.status==='completed' || request.extension_prepared_at) return;
      // Parent locks precede activities, source rows and media; this matches moderation.
      const changed=await tx<{id:string}[]>`SELECT DISTINCT r.id FROM reports r WHERE r.reporter_id=${userId}
        OR r.id IN (SELECT report_id FROM report_media rm JOIN media m ON m.id=rm.media_id WHERE m.owner_id=${userId})
        OR r.id IN (SELECT report_id FROM media_publication_approvals a JOIN media m ON m.id=a.media_id WHERE m.owner_id=${userId})
        OR r.id IN (SELECT report_id FROM community_updates WHERE author_id=${userId})
        OR r.id IN (SELECT report_id FROM activity_results WHERE author_id=${userId})
        OR r.id IN (SELECT report_id FROM activities WHERE coordinator_id=${userId})`;
      const changedIds=changed.map(r=>r.id);
       const parents=await tx<{id:string}[]>`SELECT id FROM reports WHERE id=ANY(${changedIds}::uuid[])
         OR id IN (SELECT a.report_id FROM activities a JOIN activity_memberships am ON am.activity_id=a.id WHERE am.user_id=${userId})
         OR id IN (SELECT report_id FROM incident_supports WHERE user_id=${userId})
         OR id IN (SELECT report_id FROM incident_follows WHERE user_id=${userId}) ORDER BY id FOR UPDATE`;
      const parentIds=parents.map(r=>r.id);
      await tx`SELECT id FROM activities WHERE report_id=ANY(${parentIds}::uuid[]) ORDER BY id FOR UPDATE`;
      const owned=await tx<{id:string;object_key:string;public_derivative_key:string|null}[]>`SELECT id,object_key,public_derivative_key FROM media WHERE owner_id=${userId} ORDER BY id FOR UPDATE`;
      const mediaIds=owned.map(m=>m.id);
      await this.queueOwnedObjects(tx,userId,schema.posterLedger);
      await tx`UPDATE media SET state='deleted',deleted_at=coalesce(deleted_at,now()),public_derivative_key=NULL,expires_at=NULL,updated_at=now() WHERE owner_id=${userId}`;
      await tx`UPDATE media_consents SET channels='{}',revision=revision+1,updated_at=now() WHERE media_id=ANY(${mediaIds}::uuid[]) AND cardinality(channels)>0`;
      await tx`UPDATE media_publication_approvals SET approved=false,updated_at=now() WHERE media_id=ANY(${mediaIds}::uuid[]) AND approved`;
      await tx`UPDATE approved_resolution_evidence SET status='revoked' WHERE media_id=ANY(${mediaIds}::uuid[]) AND status='valid'`;
      await tx`UPDATE approved_resolution_evidence SET status='revoked' WHERE status='valid' AND
        (source_type='community_update' AND source_id IN (SELECT id FROM community_updates WHERE author_id=${userId})
         OR source_type='activity_result' AND source_id IN (SELECT id FROM activity_results WHERE author_id=${userId}))`;
      await tx`UPDATE evidence_renditions SET status='failed',revision=revision+1,updated_at=now() WHERE media_id=ANY(${mediaIds}::uuid[]) AND status<>'failed'`;
      const posts=await tx<{id:string;account_id:string;published_at:Date|null;provider_media_id:string|null;status:string}[]>`SELECT id,account_id,published_at,provider_media_id,status FROM instagram_posts
        WHERE (media_id=ANY(${mediaIds}::uuid[]) OR report_id=ANY(${changedIds}::uuid[])) AND status NOT IN ('cancelled','retracted') ORDER BY id FOR UPDATE`;
      for (const post of posts) await this.retractForDeletion(tx,post);
      const redacted={schemaVersion:'sap-evidence-snapshot-redacted-v1',redacted:true};
      const snapshotHash=createHash('sha256').update(JSON.stringify({redacted:true,schemaVersion:redacted.schemaVersion})).digest('hex');
      await tx`UPDATE review_runs SET status='superseded',snapshot=${tx.json(redacted)},snapshot_hash=${snapshotHash},result=NULL,error_code=NULL,finished_at=coalesce(finished_at,now()),lease_expires_at=NULL
        WHERE report_id=ANY(${changedIds}::uuid[])`;
      await tx`UPDATE reports SET reporter_id=NULL,description=NULL,updated_at=now() WHERE reporter_id=${userId}`;
      await tx`UPDATE community_updates SET description='Kontribusi pribadi dianonimkan setelah penghapusan akun.',requested_evidence='[]',decision_reason=NULL,revision=revision+1,updated_at=now() WHERE author_id=${userId}`;
      await tx`UPDATE activity_results SET data=(CASE WHEN data->'measurement' IS NOT NULL AND data->'measurement'<>'null'::jsonb THEN jsonb_set(data,'{measurement,sourceReference}',to_jsonb('Pengukuran anonim'::text)) ELSE data END)-'description'||jsonb_build_object('description','Kontribusi pribadi dianonimkan setelah penghapusan akun.'),requested_evidence='{}',decision_reason=NULL,revision=revision+1,updated_at=now() WHERE author_id=${userId}`;
      await tx`UPDATE impact_measurements SET source_reference='Pengukuran-'||id::text,decision_reason=NULL,updated_at=now() WHERE created_by=${userId}`;
      await tx`UPDATE activity_memberships am SET user_id=NULL,reason=NULL,
        status=CASE WHEN am.status IN ('requested','waitlisted') OR (am.status='accepted' AND a.status IN ('draft','registration_open','registration_closed') OR am.status='accepted' AND a.status='on_hold' AND a.prior_state IN ('draft','registration_open','registration_closed')) THEN 'cancelled' ELSE am.status END,
        attendance=CASE WHEN a.status IN ('draft','registration_open','registration_closed') OR a.status='on_hold' AND a.prior_state IN ('draft','registration_open','registration_closed') THEN 'unknown' ELSE am.attendance END,
        revision=am.revision+1,updated_at=now() FROM activities a WHERE am.activity_id=a.id AND am.user_id=${userId}`;
      await tx`UPDATE activities SET coordinator_id=NULL,coordinator_accepted_at=NULL,publish_display_name=false,
        prior_state=CASE WHEN status NOT IN ('completed','cancelled','on_hold') THEN status ELSE prior_state END,
        status=CASE WHEN status IN ('completed','cancelled') THEN status ELSE 'on_hold' END,
        hold_reason=CASE WHEN status IN ('completed','cancelled') THEN hold_reason ELSE 'Koordinator menghapus akun; menunggu penugasan baru.' END,
        data=data||jsonb_build_object('coordinatorId',NULL,'title','Kegiatan SAP','description','Informasi kegiatan dipelihara oleh SAP setelah perubahan koordinator.','meetingPoint',NULL,'equipment','[]'::jsonb,'accessibilityNotes','','wasteHandoverPlan','Rencana penanganan memerlukan konfirmasi koordinator pengganti.'),
        revision=revision+1,updated_at=now() WHERE coordinator_id=${userId}`;
      await tx`DELETE FROM incident_supports WHERE user_id=${userId}`;
      await tx`DELETE FROM incident_follows WHERE user_id=${userId}`;
      await tx`DELETE FROM notifications WHERE user_id=${userId}`;
      await tx`DELETE FROM report_notification_emails WHERE user_id=${userId}`;
      await tx`DELETE FROM report_assignments WHERE assignee_id=${userId}`;
      await tx`DELETE FROM instagram_oauth_states WHERE user_id=${userId}`;
      await tx`DELETE FROM sessions WHERE user_id=${userId}`;
      await tx`DELETE FROM auth_challenges WHERE user_id=${userId}`;
      if (schema.mfa) {
        await tx`DELETE FROM mfa_preauth_challenges WHERE user_id=${userId}`;
        await tx`DELETE FROM mfa_recovery_codes WHERE user_id=${userId}`;
        await tx`DELETE FROM mfa_factors WHERE user_id=${userId}`;
        await tx`DELETE FROM mfa_login_limits WHERE user_id=${userId}`;
      }
      await tx`UPDATE report_status_events SET actor_id=NULL,reason=NULL WHERE actor_id=${userId}`;
      await tx`UPDATE moderation_decisions SET decision_payload=decision_payload-'reason' WHERE actor_id=${userId}`;
      await tx`UPDATE audit_events SET actor_id=NULL,changes_redacted=jsonb_build_object('actorDeleted',true) WHERE actor_id=${userId}`;
      await tx`UPDATE users SET display_name=${DELETED_DISPLAY_NAME},password_hash=NULL,email_normalized=${`deleted+${userId}@deleted.invalid`},email_verified_at=NULL,avatar_media_id=NULL,impact_identity=gen_random_uuid(),deleted_at=coalesce(deleted_at,now()),updated_at=now() WHERE id=${userId}`;
      const sources=await tx<{id:string;revision:number}[]>`UPDATE reports SET revision=revision+1,updated_at=now() WHERE id=ANY(${changedIds}::uuid[]) RETURNING id,revision`;
      for (const report of sources) await tx`INSERT INTO outbox_events(topic,aggregate_id,payload_minimal,dedup_key) VALUES('publication.source.changed',${report.id},${tx.json({aggregateRevision:report.revision,reason:'account_deleted',suppressAutomaticDraft:true})},${`publication.source.changed:${report.id}:${report.revision}`}) ON CONFLICT DO NOTHING`;
      await tx`DELETE FROM area_snapshots`;
      await tx`UPDATE deletion_requests SET extension_prepared_at=now() WHERE id=${deletionId}`;
    });
  }

  private async retractForDeletion(tx:TransactionSql,post:{id:string;account_id:string;published_at:Date|null;provider_media_id:string|null;status:string}):Promise<void> {
    const [existing]=await tx<{id:string;status:string}[]>`SELECT id,status FROM instagram_operations WHERE post_id=${post.id} AND kind='retract' AND status NOT IN ('succeeded','cancelled') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`;
    const [publish]=await tx<{id:string}[]>`SELECT id FROM instagram_operations WHERE post_id=${post.id} AND kind='publish' AND (status='running' OR stage IN ('publish_requested','uncertain','published')) LIMIT 1`;
    const harmless=!post.published_at&&!post.provider_media_id&&!publish&&['draft','failed'].includes(post.status);
    let operation=existing;
    if (!operation) [operation]=await tx<{id:string;status:string}[]>`INSERT INTO instagram_operations(post_id,account_id,kind,status,stage,channels,message)
      VALUES(${post.id},${post.account_id},'retract',${harmless?'succeeded':'queued'},${harmless?'not_created':'queued'},${tx.json({sap:'unaffected',instagram:harmless?'not_created':'pending'})},'Penarikan setelah penghapusan akun pemilik bukti.') RETURNING id,status`;
    if (!operation) throw new Error('DELETION_RETRACTION_MISSING');
    await tx`UPDATE instagram_operations SET status='cancelled',message='Bukti pemilik dihapus.',updated_at=now() WHERE post_id=${post.id} AND kind='publish' AND status='queued' AND stage NOT IN ('publish_requested','uncertain','published')`;
    await tx`UPDATE instagram_posts SET status=${harmless?'cancelled':'retracting'},approval=${tx.json(INVALID_APPROVAL)},last_operation_id=${operation.id},revision=revision+1,updated_at=now() WHERE id=${post.id}`;
    if (!existing&&!harmless) await tx`INSERT INTO outbox_events(topic,aggregate_id,payload_minimal,dedup_key) VALUES('instagram.retract.requested',${operation.id},${tx.json({aggregateRevision:1})},${`instagram.retract.requested:${operation.id}:1`}) ON CONFLICT DO NOTHING`;
  }

  private async queueOwnedObjects(tx:TransactionSql,userId:string,posterLedger:boolean):Promise<void> {
    await tx`INSERT INTO media_cleanup_tasks(object_key,media_id)
      SELECT object_key,id FROM media WHERE owner_id=${userId}
      UNION SELECT public_derivative_key,id FROM media WHERE owner_id=${userId} AND public_derivative_key IS NOT NULL
      UNION SELECT er.object_key,er.media_id FROM evidence_renditions er JOIN media m ON m.id=er.media_id WHERE m.owner_id=${userId} AND er.object_key IS NOT NULL
      UNION SELECT p.rendition_object_key,p.media_id FROM instagram_posts p JOIN media m ON m.id=p.media_id WHERE m.owner_id=${userId} AND p.rendition_object_key IS NOT NULL
      ON CONFLICT(object_key) DO UPDATE SET status='pending',completed_at=NULL,revision=media_cleanup_tasks.revision+1`;
    if (posterLedger) await tx`INSERT INTO media_cleanup_tasks(object_key,media_id) SELECT ro.object_key,p.media_id FROM instagram_rendition_objects ro JOIN instagram_posts p ON p.id=ro.post_id JOIN media m ON m.id=p.media_id WHERE m.owner_id=${userId} ON CONFLICT(object_key) DO UPDATE SET status='pending',completed_at=NULL,revision=media_cleanup_tasks.revision+1`;
  }

  async listUserObjectKeys(userId:string):Promise<string[]> {
    const schema=await this.readiness();
    if (schema.extensions) {
      // Include later tracked writes even when the prepare transaction already committed.
      await this.sql.begin(tx=>this.queueOwnedObjects(tx,userId,schema.posterLedger));
      const rows=await this.sql<{object_key:string}[]>`SELECT t.object_key FROM media_cleanup_tasks t JOIN media m ON m.id=t.media_id WHERE m.owner_id=${userId} AND t.status='pending' ORDER BY t.object_key`;
      return rows.map(r=>r.object_key);
    }
    const rows=await this.sql<{object_key:string;public_derivative_key:string|null}[]>`SELECT object_key,public_derivative_key FROM media WHERE owner_id=${userId} AND state<>'deleted'`;
    return [...new Set(rows.flatMap(r=>r.public_derivative_key?[r.object_key,r.public_derivative_key]:[r.object_key]))];
  }
  async cleanupObjectRevision(objectKey:string):Promise<number|undefined> {
    if (!(await this.readiness()).extensions) return undefined;
    const [task]=await this.sql<{revision:number}[]>`SELECT revision FROM media_cleanup_tasks WHERE object_key=${objectKey} AND status='pending'`;
    return task?.revision;
  }
  async completeCleanupObject(objectKey:string,revision?:number):Promise<void> {
    if ((await this.readiness()).extensions&&revision!==undefined) await this.sql`UPDATE media_cleanup_tasks SET status='completed',completed_at=now() WHERE object_key=${objectKey} AND revision=${revision}`;
  }

  async finalizeDeletion(deletionId:string,userId:string|null,subjectHash:string,claim?:DeletionClaim):Promise<void> {
    await this.sql.begin(async tx=>{
      await this.fence(tx,claim);
      const schema=await this.readiness(tx);
      if (schema.extensions&&userId) {
        const [pending]=await tx`SELECT t.object_key FROM media_cleanup_tasks t JOIN media m ON m.id=t.media_id WHERE m.owner_id=${userId} AND t.status='pending' LIMIT 1`;
        if (pending) throw new Error('DELETION_OBJECTS_PENDING');
      }
      if (userId) {
        await tx`DELETE FROM report_notification_emails WHERE user_id=${userId}`;
        await tx`DELETE FROM report_assignments WHERE assignee_id=${userId}`;
        await tx`UPDATE media SET state='deleted',deleted_at=coalesce(deleted_at,now()),public_derivative_key=NULL,updated_at=now() WHERE owner_id=${userId} AND state<>'deleted'`;
        await tx`UPDATE reports SET reporter_id=NULL,updated_at=now() WHERE reporter_id=${userId}`;
        await tx`UPDATE users SET display_name=${DELETED_DISPLAY_NAME},password_hash=NULL,email_normalized=${`deleted+${userId}@deleted.invalid`},email_verified_at=NULL,deleted_at=coalesce(deleted_at,now()),updated_at=now() WHERE id=${userId}`;
      }
      // This receipt records local deletion; provider operations retain independent pending/needs_action state.
      await tx`UPDATE deletion_requests SET status='completed',completed_at=now(),last_error_code=NULL WHERE id=${deletionId} AND status<>'completed'`;
      await tx`INSERT INTO deletion_tombstones(subject_hash,completed_at,expires_at) VALUES(${subjectHash},now(),now()+${`${TOMBSTONE_TTL_MS/1000} seconds`}::interval) ON CONFLICT(subject_hash) DO UPDATE SET completed_at=EXCLUDED.completed_at,expires_at=EXCLUDED.expires_at`;
    });
  }

  private unreferenced(db:Executor,extensions:boolean) {
    const extended=extensions?db`AND NOT EXISTS(SELECT 1 FROM evidence_links el WHERE el.media_id=m.id)
      AND NOT EXISTS(SELECT 1 FROM measurement_media mm WHERE mm.media_id=m.id)
      AND NOT EXISTS(SELECT 1 FROM evidence_renditions er WHERE er.media_id=m.id)
      AND NOT EXISTS(SELECT 1 FROM instagram_posts p WHERE p.media_id=m.id AND p.status NOT IN ('cancelled','retracted'))`:db``;
    return db`NOT EXISTS(SELECT 1 FROM report_media rm WHERE rm.media_id=m.id) AND NOT EXISTS(SELECT 1 FROM scans s WHERE s.media_id=m.id)
      AND NOT EXISTS(SELECT 1 FROM users u WHERE u.avatar_media_id=m.id AND u.deleted_at IS NULL) ${extended}`;
  }

  async listOrphanMediaKeys():Promise<{id:string;objectKey:string;revision?:number}[]> {
    const schema=await this.readiness();
    if (!schema.extensions) {
      const rows=await this.sql<{id:string;object_key:string}[]>`SELECT m.id,m.object_key FROM media m WHERE m.state IN ('stored','pending') AND m.expires_at IS NOT NULL AND m.expires_at<now() AND ${this.unreferenced(this.sql,false)}`;
      return rows.map(r=>({id:r.id,objectKey:r.object_key}));
    }
    return this.sql.begin(async tx=>{
      if (schema.posterLedger&&schema.posterReservations) await tx`INSERT INTO media_cleanup_tasks(object_key,media_id)
        SELECT ro.object_key,p.media_id FROM instagram_rendition_objects ro JOIN instagram_posts p ON p.id=ro.post_id
        WHERE ro.reservation_expires_at<now() AND ro.object_key IS DISTINCT FROM p.rendition_object_key
        ON CONFLICT(object_key) DO NOTHING`;
      await tx`UPDATE media m SET expires_at=now()+interval '1 day',updated_at=now() WHERE m.state IN ('stored','pending') AND m.expires_at IS NULL AND m.created_at<now()-interval '1 day' AND ${this.unreferenced(tx,true)}`;
      const rows=await tx<{id:string;object_key:string;public_derivative_key:string|null}[]>`SELECT m.id,m.object_key,m.public_derivative_key FROM media m
        WHERE m.state IN ('stored','pending') AND m.expires_at IS NOT NULL AND m.expires_at<now() AND ${this.unreferenced(tx,true)} ORDER BY m.id FOR UPDATE SKIP LOCKED LIMIT 100`;
      for (const m of rows) {
        await tx`INSERT INTO media_cleanup_tasks(object_key,media_id) VALUES(${m.object_key},${m.id}) ON CONFLICT(object_key) DO UPDATE SET status='pending',completed_at=NULL,revision=media_cleanup_tasks.revision+1`;
        if (m.public_derivative_key) await tx`INSERT INTO media_cleanup_tasks(object_key,media_id) VALUES(${m.public_derivative_key},${m.id}) ON CONFLICT(object_key) DO UPDATE SET status='pending',completed_at=NULL,revision=media_cleanup_tasks.revision+1`;
        await tx`UPDATE media SET state='deleted',deleted_at=now(),public_derivative_key=NULL,updated_at=now() WHERE id=${m.id}`;
      }
      const tasks=await tx<{media_id:string|null;object_key:string;revision:number}[]>`SELECT media_id,object_key,revision FROM media_cleanup_tasks WHERE status='pending' ORDER BY created_at,object_key LIMIT 500`;
      return tasks.map(r=>({id:r.media_id??r.object_key,objectKey:r.object_key,revision:r.revision}));
    });
  }

  async sweepExpired():Promise<SweepResult> {
    const idem=await this.sql`DELETE FROM idempotency_keys WHERE expires_at<now()`;
    const snaps=await this.sql`DELETE FROM area_snapshots WHERE expires_at<now()`;
    const tombs=await this.sql`DELETE FROM deletion_tombstones WHERE expires_at<now()`;
    let orphanMedia=0;
    if (!(await this.readiness()).extensions) {
      const result=await this.sql`UPDATE media m SET state='deleted',deleted_at=now(),updated_at=now()
        WHERE m.state IN ('stored','pending') AND m.expires_at IS NOT NULL AND m.expires_at<now() AND ${this.unreferenced(this.sql,false)}`;
      orphanMedia=result.count;
    }
    return {orphanMedia,idempotencyKeys:idem.count,areaSnapshots:snaps.count,tombstones:tombs.count};
  }
}
