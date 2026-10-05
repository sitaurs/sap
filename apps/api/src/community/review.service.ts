import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { getConfig } from '@sap/config';
import { ExtensionStore, type Actor, type Executor, type SubjectType, fail, hash, iso, requireAdmin, requireFeature } from '../extensions/extension.store.js';
import * as input from '../extensions/input.js';
import type { Tx } from '../infrastructure/idempotency.store.js';

type Row = Record<string, any>;
const types=['report','community_update','activity_result'] as const;

@Injectable()
export class ReviewService {
  constructor(private readonly store: ExtensionStore) {}

  private requireSubjectFeature(type: SubjectType): void {
    requireFeature(type==='activity_result'?'activities':'community');
  }

  dto(row: Row) {
    return {id:row.id,subjectType:row.subject_type,subjectId:row.subject_id,subjectRevision:row.subject_revision,
      reportId:row.report_id,sourceReportRevision:row.source_report_revision,snapshotHash:row.snapshot_hash,status:row.status,
      requiresHumanReview:true,result:row.result,errorCode:row.error_code,modelVersion:row.model_version,policyVersion:row.policy_version,
      createdAt:iso(row.created_at),finishedAt:iso(row.finished_at)};
  }

  async latest(type: SubjectType,id: string,tx: Executor=this.store.db) {
    const rows=await tx<Row[]>`SELECT * FROM review_runs WHERE subject_type=${type} AND subject_id=${id} ORDER BY created_at DESC,id DESC LIMIT 1`;
    return rows[0]?this.dto(rows[0]):null;
  }

  async supersede(tx: Executor,type: SubjectType,id: string): Promise<void> {
    await tx`UPDATE review_runs SET status='superseded',finished_at=coalesce(finished_at,now()),lease_expires_at=NULL WHERE subject_type=${type} AND subject_id=${id} AND status<>'superseded'`;
  }
  async supersedeReport(tx: Executor,id: string): Promise<void> {
    await tx`UPDATE review_runs SET status='superseded',finished_at=coalesce(finished_at,now()),lease_expires_at=NULL WHERE report_id=${id} AND status<>'superseded'`;
  }

  /** Only the server builds snapshots. Exact GPS, identity, credentials and object keys are excluded. */
  async snapshot(tx: Executor,type: SubjectType,id: string,expected: number) {
    let row: Row | undefined;
    // Discover the parent without holding a child lock, then always lock parent first.
    // Report moderation and child decisions use the same ordering.
    const parents=type==='report'?[{report_id:id}]:type==='community_update'?
      await tx<Row[]>`SELECT report_id FROM community_updates WHERE id=${id}`:
      await tx<Row[]>`SELECT report_id FROM activity_results WHERE id=${id}`;
    if(!parents[0]) fail(404,'NOT_FOUND');
    const reportId=parents[0].report_id;
    const reports=await tx<Row[]>`SELECT id,revision,status,h3_cell,category_id,description,occurred_at,public_summary,scan_id,public_visibility,duplicate_of_id FROM reports WHERE id=${reportId} FOR UPDATE`;
    const report=reports[0]; if(!report) fail(404,'NOT_FOUND');
    if(type==='report') row=(await tx<Row[]>`SELECT * FROM reports WHERE id=${id}`)[0];
    else if(type==='community_update') row=(await tx<Row[]>`SELECT * FROM community_updates WHERE id=${id} FOR UPDATE`)[0];
    else row=(await tx<Row[]>`SELECT * FROM activity_results WHERE id=${id} FOR UPDATE`)[0];
    if(!row || (type!=='report' && row.report_id!==reportId)) fail(404,'NOT_FOUND');
    input.checkRevision(row.revision,expected);
    let evidence: Row[];
    if(type==='report') evidence=await tx<Row[]>`SELECT m.id,m.sha256,m.mime,m.width,m.height FROM report_media rm JOIN media m ON m.id=rm.media_id
      WHERE rm.report_id=${id} AND m.state='stored' AND m.deleted_at IS NULL ORDER BY rm.sort_order,m.id`;
    else evidence=await tx<Row[]>`SELECT m.id,m.sha256,m.mime,m.width,m.height FROM evidence_links el JOIN media m ON m.id=el.media_id
      WHERE el.subject_type=${type} AND el.subject_id=${id} AND m.state='stored' AND m.deleted_at IS NULL ORDER BY el.created_at,m.id`;
    // Prior approved public references for activity before photos are also bound by the source report.
    if(type==='activity_result' && Array.isArray(row.data?.beforePublicEvidenceIds) && row.data.beforePublicEvidenceIds.length) {
      const referenced=await tx<Row[]>`SELECT m.id,m.sha256,m.mime,m.width,m.height FROM media_publication_approvals a
        JOIN media m ON m.id=a.media_id JOIN evidence_renditions er ON er.id=a.rendition_id JOIN media_consents mc ON mc.media_id=m.id
        WHERE a.id=ANY(${row.data.beforePublicEvidenceIds}::uuid[]) AND a.report_id=${reportId} AND a.channel='web' AND a.approved
          AND er.status='ready' AND m.state='stored' AND m.deleted_at IS NULL AND 'web'=ANY(mc.channels)`;
      evidence=[...evidence,...referenced.filter(r=>!evidence.some(e=>e.id===r.id))];
    }
    if(evidence.length>9) fail(422,'EVIDENCE_INVALID');
    const scans=report.scan_id?await tx<Row[]>`SELECT status,outcome,category_id,predictions,provider_revision FROM scans WHERE id=${report.scan_id}`:[];
    const candidates=type==='report'?await tx<Row[]>`SELECT id,category_id,occurred_at,public_summary FROM reports WHERE id<>${id}
      AND h3_cell=${report.h3_cell} AND status IN ('verified','in_progress','resolved') AND public_visibility='public'
      AND duplicate_of_id IS NULL AND abs(extract(epoch from (occurred_at-${report.occurred_at}::timestamptz)))<=604800 ORDER BY occurred_at DESC,id DESC LIMIT 5`:[];
    const subject=type==='report'?{description:row.description,occurredAt:iso(row.occurred_at),categoryId:row.category_id,status:row.status}:
      type==='community_update'?{kind:row.kind,description:row.description,observedAt:iso(row.observed_at),correctionField:row.correction_field,status:row.status}:
      {observedAt:iso(row.observed_at),claimedOutcome:row.claimed_outcome,status:row.status,result:row.data};
    const snapshot={schemaVersion:'sap-evidence-snapshot-v1',subjectType:type,subjectId:id,subjectRevision:row.revision,
      sourceReportId:reportId,sourceReportRevision:report.revision,
      source:{status:report.status,publicVisibility:report.public_visibility,cellId:report.h3_cell,categoryId:report.category_id,description:report.description,
        occurredAt:iso(report.occurred_at),publicSummary:report.public_summary},subject,
      evidence:evidence.map(e=>({mediaId:e.id,sha256:e.sha256,mime:e.mime,width:e.width,height:e.height})),scan:scans[0]??null,
      duplicateCandidates:candidates.map(c=>({id:c.id,categoryId:c.category_id,occurredAt:iso(c.occurred_at),summary:c.public_summary}))};
    return {reportId,reportRevision:report.revision,snapshot,snapshotHash:hash(snapshot)};
  }

  /** Automatic callers don't block the human path when AI is disabled. Explicit reruns use a new IK intent. */
  async enqueue(tx: Tx,type: SubjectType,id: string,expected: number,explicit=false) {
    const config=getConfig();
    if(!config.SAP_EXTENSION_ENABLED||!config.SAP_HERMES_ENABLED) { if(explicit) fail(503,'FEATURE_UNAVAILABLE'); return null; }
    const payload=await this.snapshot(tx,type,id,expected);
    // A durable automatic intent survives relay replay, Redis loss and prior failure.
    // Explicit admin reruns intentionally create a new intent under their own IK.
    if(!explicit) {
      const existing=await tx<Row[]>`SELECT * FROM review_runs WHERE subject_type=${type} AND subject_id=${id}
        AND subject_revision=${expected} AND source_report_revision=${payload.reportRevision} AND snapshot_hash=${payload.snapshotHash}
        AND model_version=${config.HERMES_MODEL_VERSION} AND policy_version=${config.HERMES_POLICY_VERSION}
        ORDER BY created_at DESC,id DESC LIMIT 1`;
      if(existing[0]) return this.dto(existing[0]);
    }
    const runId=randomUUID();
    await tx`INSERT INTO review_runs(id,subject_type,subject_id,subject_revision,report_id,source_report_revision,snapshot_hash,snapshot,model_version,policy_version)
      VALUES(${runId},${type},${id},${expected},${payload.reportId},${payload.reportRevision},${payload.snapshotHash},${tx.json(payload.snapshot as never)},${config.HERMES_MODEL_VERSION},${config.HERMES_POLICY_VERSION})`;
    await this.store.event(tx,'review.requested',runId,1,{subjectType:type,subjectId:id});
    return this.dto((await tx<Row[]>`SELECT * FROM review_runs WHERE id=${runId}`)[0]!);
  }

  async request(actor: Actor,body: unknown,key: string) {
    requireFeature('hermes'); requireAdmin(actor); const data=input.object(body,['subjectType','subjectId','subjectRevision']);
    const type=input.enumeration(data.subjectType,types),id=input.uuid(data.subjectId),revision=input.integer(data.subjectRevision);this.requireSubjectFeature(type);
    return this.store.mutate(actor,'review.request',key,{type,id,revision},async tx=>{
      const result=await this.enqueue(tx,type,id,revision,true);
      await this.store.audit(tx,actor.id,'review.requested',type,id,{subjectRevision:revision,reviewId:result?.id}); return result;
    },202);
  }

  async get(actor: Actor,id: string) {
    requireAdmin(actor); const rows=await this.store.db<Row[]>`SELECT * FROM review_runs WHERE id=${id}`;
    if(!rows[0]) fail(404,'NOT_FOUND');this.requireSubjectFeature(rows[0].subject_type);return this.dto(rows[0]);
  }

  async list(actor: Actor,query: Record<string,unknown>,reportId?: string) {
    requireAdmin(actor);
    const type=reportId?'report':input.enumeration(query.subjectType,types),id=reportId??input.uuid(query.subjectId);
    this.requireSubjectFeature(type);
    // Verify the subject exists, independently of whether it has any AI runs.
    const exists=type==='report'?await this.store.db`SELECT id FROM reports WHERE id=${id}`:
      type==='community_update'?await this.store.db`SELECT id FROM community_updates WHERE id=${id}`:await this.store.db`SELECT id FROM activity_results WHERE id=${id}`;
    if(!exists.length) fail(404,'NOT_FOUND');
    const page=this.store.cursor(query,{type:'reviews',subjectType:type,subjectId:id});
    const after=page.boundary?this.store.db`AND (created_at,id)<(${page.boundary.at}::timestamptz,${page.boundary.id}::uuid)`:this.store.db``;
    const rows=await this.store.db<Row[]>`SELECT * FROM review_runs WHERE subject_type=${type} AND subject_id=${id} ${after} ORDER BY created_at DESC,id DESC LIMIT ${page.limit+1}`;
    const chosen=rows.slice(0,page.limit); return {items:chosen.map(r=>this.dto(r)),nextCursor:rows.length>page.limit?page.encode(chosen[chosen.length-1] as {id:string;created_at:Date}):null};
  }

  async queue(actor: Actor,query: Record<string,unknown>) {
    requireAdmin(actor); const type=query.type===undefined?'all':input.enumeration(query.type,['all',...types] as const);
    const config=getConfig();
    if(type==='all'){
      requireFeature('evidence');if(!config.SAP_COMMUNITY_ENABLED&&!config.SAP_ACTIVITIES_ENABLED)fail(503,'FEATURE_UNAVAILABLE','Fitur belum diaktifkan.');
    }else this.requireSubjectFeature(type);
    const page=this.store.cursor(query,{type:'review_queue',subjectType:type});
    const after=page.boundary?this.store.db`AND (q.created_at,q.id)<(${page.boundary.at}::timestamptz,${page.boundary.id}::uuid)`:this.store.db``;
    const rows=await this.store.db<Row[]>`SELECT q.*,to_jsonb(rr) AS review FROM (
      SELECT 'report'::text AS subject_type,id,revision, id AS report_id,'Laporan perlu ditinjau'::text AS title,created_at,'pending'::text AS review_state FROM reports WHERE ${config.SAP_COMMUNITY_ENABLED} AND status='submitted'
      UNION ALL SELECT 'report',r.id,r.revision,r.id,'Resolusi perlu ditinjau',r.updated_at,'pending'
        FROM reports r JOIN LATERAL (SELECT decision_payload FROM moderation_decisions WHERE report_id=r.id
          AND decision_payload->>'nextStatus'='resolved' ORDER BY created_at DESC,id DESC LIMIT 1) decision ON true
        WHERE ${config.SAP_COMMUNITY_ENABLED} AND r.status='resolved' AND (
          EXISTS(SELECT 1 FROM jsonb_array_elements_text(COALESCE(decision.decision_payload->'resolutionEvidenceIds','[]'::jsonb)) AS selected(claim_id)
            WHERE NOT EXISTS(SELECT 1 FROM approved_resolution_evidence ae JOIN media m ON m.id=ae.media_id
              LEFT JOIN community_updates cu ON ae.source_type='community_update' AND cu.id=ae.source_id
              LEFT JOIN activity_results ar ON ae.source_type='activity_result' AND ar.id=ae.source_id
              WHERE ae.id=selected.claim_id::uuid AND ae.report_id=r.id AND ae.status='valid' AND m.state='stored' AND m.deleted_at IS NULL
                AND ae.observed_at>=COALESCE(r.last_observed_at,r.occurred_at)
                AND EXISTS(SELECT 1 FROM media_publication_approvals a JOIN media_consents mc ON mc.media_id=a.media_id
                  WHERE a.report_id=ae.report_id AND a.subject_type=ae.source_type AND a.subject_id=ae.source_id
                    AND a.media_id=ae.media_id AND a.channel='web' AND a.approved AND 'web'=ANY(mc.channels))
                AND ((cu.status='approved' AND cu.kind='looks_clean' AND cu.revision=ae.source_revision)
                  OR (ar.status='approved' AND ar.verified_outcome='complete' AND ar.revision=ae.source_revision))))
          OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(COALESCE(decision.decision_payload->'resolutionMediaIds','[]'::jsonb)) AS selected(media_id)
            WHERE NOT EXISTS(SELECT 1 FROM report_media rm JOIN media m ON m.id=rm.media_id
              WHERE rm.report_id=r.id AND rm.media_id=selected.media_id::uuid AND m.state='stored' AND m.deleted_at IS NULL))
        )
      UNION ALL SELECT 'community_update',id,revision,report_id,'Pembaruan kondisi',created_at,CASE WHEN status='needs_evidence' THEN 'needs_evidence' ELSE 'pending' END FROM community_updates WHERE ${config.SAP_COMMUNITY_ENABLED} AND status IN ('submitted','needs_evidence')
      UNION ALL SELECT 'activity_result',id,revision,report_id,'Hasil kegiatan',created_at,CASE WHEN status='needs_evidence' THEN 'needs_evidence' ELSE 'pending' END FROM activity_results WHERE ${config.SAP_ACTIVITIES_ENABLED} AND status IN ('submitted','needs_evidence')
      ) q LEFT JOIN LATERAL (SELECT * FROM review_runs WHERE subject_type=q.subject_type AND subject_id=q.id ORDER BY created_at DESC,id DESC LIMIT 1) rr ON true
      WHERE (${type}='all' OR q.subject_type=${type}) ${after} ORDER BY q.created_at DESC,q.id DESC LIMIT ${page.limit+1}`;
    const chosen=rows.slice(0,page.limit);
    return {items:chosen.map(r=>({subjectType:r.subject_type,subjectId:r.id,subjectRevision:r.revision,reportId:r.report_id,title:r.title,submittedAt:iso(r.created_at),reviewState:r.review_state,
      latestReview:r.review?this.dto(r.review):null})),nextCursor:rows.length>page.limit?page.encode(chosen[chosen.length-1] as {id:string;created_at:Date}):null};
  }
}
