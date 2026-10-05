import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Sql } from 'postgres';
import type { AppConfig } from '@sap/config';
import type { ObjectStore } from './object-store.js';
import { ReviewProcessor } from './review-processor.js';
import { RenditionProcessor } from './rendition-processor.js';
import { PublicationProcessor } from './publication-processor.js';

export type ExtensionEvent = { topic: string; aggregate_id: string; payload_minimal: Record<string, unknown>; outbox_id?: string };
type OutboxRow = ExtensionEvent & { id: string; attempts: number };
const topics = ['review.requested', 'evidence.rendition.requested', 'instagram.render.requested',
  'instagram.publish.requested', 'instagram.retract.requested', 'instagram.disconnect.requested',
  'publication.source.changed', 'media.consent.changed', 'report.created', 'report.updated',
  'report.changed', 'report.decided', 'community.update.submitted', 'community.update.decided',
  'activity.changed', 'membership.changed', 'activity.result.submitted', 'activity.result.decided',
  'measurement.changed'];
type Lane = 'review' | 'render' | 'publish' | 'retract' | 'domain';
const METRICS_INTERVAL_MS = 60_000;
function lane(topic: string): Lane {
  if (topic === 'review.requested') return 'review';
  if (topic === 'evidence.rendition.requested' || topic === 'instagram.render.requested') return 'render';
  if (topic === 'instagram.publish.requested') return 'publish';
  if (topic === 'instagram.retract.requested' || topic === 'instagram.disconnect.requested') return 'retract';
  return 'domain';
}

/** SQL is the durable source. Redis holds execution tickets and can be rebuilt. */
export class ExtensionJobs {
  private readonly queues: Record<Lane, Queue>;
  private readonly workers: Worker[];
  private readonly review: ReviewProcessor;
  private readonly rendition: RenditionProcessor;
  private readonly publication: PublicationProcessor;
  private stopping = false;
  private timer: NodeJS.Timeout | undefined;
  private metricsTimer: NodeJS.Timeout | undefined;
  private active: Promise<void> | undefined;
  private lastRecovery = 0;

  constructor(private readonly sql: Sql, private readonly config: AppConfig, objects: ObjectStore, connection: Redis) {
    this.review = new ReviewProcessor(sql, config, objects);
    this.rendition = new RenditionProcessor(sql, config, objects);
    this.publication = new PublicationProcessor(sql, config, objects);
    const lanes: Lane[] = ['review', 'render', 'publish', 'retract', 'domain'];
    this.queues = Object.fromEntries(lanes.map(name => [name, new Queue(`sap-${name}`, { connection })])) as Record<Lane, Queue>;
    this.workers = lanes.map(name => {
      const worker = new Worker(`sap-${name}`, job => this.handle(job.data as ExtensionEvent), {
        connection, concurrency: name === 'publish' || name === 'retract' ? 1 : config.EXTENSION_JOB_CONCURRENCY,
      });
      worker.on('error', () => console.error('extension_worker_error', { lane: name }));
      worker.on('failed', job => console.error('extension_job_failed', { lane: name, jobId: job?.id }));
      return worker;
    });
  }

  start(): void {
    void this.sql<{ready:boolean}[]>`SELECT to_regclass('public.outbox_events') IS NOT NULL AND to_regclass('public.instagram_operations') IS NOT NULL AS ready`
      .then(rows=>{if(rows[0]?.ready){void this.reportMetrics();this.metricsTimer=setInterval(()=>void this.reportMetrics(),METRICS_INTERVAL_MS);this.metricsTimer.unref();this.schedule();}})
      .catch(()=>console.error('extension_schema_unavailable'));
  }
  /** Periodic database-backed counters; payloads contain no user, report or credential data. */
  private async reportMetrics(): Promise<void> {
    try {
      const [m] = await this.sql<Record<string,unknown>[]>`
        SELECT
          (SELECT count(*)::int FROM outbox_events WHERE state='pending' AND topic=ANY(${topics}::text[])) AS outbox_pending,
          (SELECT count(*)::int FROM outbox_events WHERE state='processing' AND topic=ANY(${topics}::text[])) AS outbox_processing,
          (SELECT count(*)::int FROM outbox_events WHERE state='failed' AND topic=ANY(${topics}::text[])) AS outbox_failed,
          COALESCE((SELECT floor(extract(epoch FROM now()-min(created_at)))::int FROM outbox_events WHERE state IN ('pending','processing') AND topic=ANY(${topics}::text[])),0) AS outbox_oldest_open_seconds,
          (SELECT count(*)::int FROM review_runs WHERE status='queued') AS reviews_queued,
          (SELECT count(*)::int FROM review_runs WHERE status='running') AS reviews_running,
          (SELECT count(*)::int FROM review_runs WHERE status='failed') AS reviews_failed,
          COALESCE((SELECT floor(extract(epoch FROM now()-min(created_at)))::int FROM review_runs WHERE status='queued'),0) AS reviews_oldest_queued_seconds,
          COALESCE((SELECT sum(usage_cost_usd) FROM review_runs WHERE status='completed' AND finished_at >= (date_trunc('day',now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta')),0) AS reviews_estimated_cost_today_usd,
          COALESCE((SELECT sum(usage_input_tokens) FROM review_runs WHERE status='completed' AND finished_at >= (date_trunc('day',now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta')),0)::bigint AS reviews_input_tokens_today,
          COALESCE((SELECT sum(usage_output_tokens) FROM review_runs WHERE status='completed' AND finished_at >= (date_trunc('day',now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta')),0)::bigint AS reviews_output_tokens_today,
          (SELECT percentile_cont(0.50) WITHIN GROUP (ORDER BY extract(epoch FROM finished_at-started_at)) FROM review_runs WHERE status='completed' AND finished_at >= now()-interval '24 hours' AND started_at IS NOT NULL) AS reviews_latency_p50_seconds_24h,
          (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM finished_at-started_at)) FROM review_runs WHERE status='completed' AND finished_at >= now()-interval '24 hours' AND started_at IS NOT NULL) AS reviews_latency_p95_seconds_24h,
          (SELECT count(*)::int FROM evidence_renditions WHERE status='queued') AS renditions_queued,
          (SELECT count(*)::int FROM evidence_renditions WHERE status='failed') AS renditions_failed,
          (SELECT count(*)::int FROM reports WHERE status='submitted') AS reports_waiting_review,
          (SELECT count(*)::int FROM community_updates WHERE status IN ('submitted','needs_evidence')) AS community_updates_waiting_review,
          (SELECT count(*)::int FROM activity_results WHERE status IN ('submitted','needs_evidence')) AS activity_results_waiting_review,
          (SELECT count(*)::int FROM impact_measurements WHERE status='pending_review') AS measurements_waiting_review,
          (SELECT count(*)::int FROM activities WHERE coordinator_id IS NOT NULL AND coordinator_accepted_at IS NULL AND status NOT IN ('completed','cancelled')) AS coordinator_acceptance_pending,
          COALESCE((SELECT floor(extract(epoch FROM now()-min(created_at)))::int FROM (
            SELECT created_at FROM reports WHERE status='submitted'
            UNION ALL SELECT created_at FROM community_updates WHERE status IN ('submitted','needs_evidence')
            UNION ALL SELECT created_at FROM activity_results WHERE status IN ('submitted','needs_evidence')
            UNION ALL SELECT created_at FROM impact_measurements WHERE status='pending_review'
          ) pending_review),0) AS moderator_oldest_pending_seconds,
          (SELECT count(*)::int FROM instagram_operations WHERE status='queued') AS instagram_operations_queued,
          (SELECT count(*)::int FROM instagram_operations WHERE status='running') AS instagram_operations_running,
          (SELECT count(*)::int FROM instagram_operations WHERE status='failed') AS instagram_operations_failed,
          (SELECT count(*)::int FROM instagram_operations WHERE status='needs_action') AS instagram_operations_needs_action,
          (SELECT count(*)::int FROM instagram_operations WHERE kind='retract' AND status='queued') AS instagram_retractions_queued,
          COALESCE((SELECT floor(extract(epoch FROM now()-min(created_at)))::int FROM instagram_operations WHERE kind='retract' AND status='queued'),0) AS instagram_oldest_retraction_seconds,
          (SELECT count(*)::int FROM instagram_publication_attempts WHERE outcome='uncertain' AND created_at >= now()-interval '24 hours') AS instagram_uncertain_attempts_24h,
          (SELECT count(*)::int FROM media_cleanup_tasks WHERE status='pending') AS media_cleanup_pending,
          (SELECT count(*)::int FROM deletion_requests WHERE status IN ('queued','running','failed')) AS account_cleanup_open,
          (SELECT status FROM instagram_accounts WHERE singleton=true LIMIT 1) AS instagram_account_status`;
      console.info('sap_extension_metrics', {
        sampledAt: new Date().toISOString(),
        featureFlags: {
          extension: this.config.SAP_EXTENSION_ENABLED,
          community: this.config.SAP_COMMUNITY_ENABLED,
          activities: this.config.SAP_ACTIVITIES_ENABLED,
          hermes: this.config.SAP_HERMES_ENABLED,
          instagram: this.config.SAP_INSTAGRAM_ENABLED,
          instagramRender: this.config.SAP_INSTAGRAM_RENDER_ENABLED,
          instagramPublish: this.config.SAP_INSTAGRAM_PUBLISH_ENABLED,
          instagramDelete: this.config.META_DELETE_ENABLED,
        },
        configuration: {
          hermesTransportConfigured: Boolean(this.config.HERMES_REVIEW_URL && this.config.HERMES_REVIEW_SECRET && this.config.HERMES_MODEL_VERSION !== 'unconfigured'),
          mapProviderConfigured: Boolean(this.config.POSTER_OVERPASS_URL),
          instagramOAuthConfigured: Boolean(this.config.META_APP_ID && this.config.META_APP_SECRET && this.config.META_LOGIN_CONFIG_ID && this.config.META_GRAPH_VERSION),
        },
        queues: {
          outboxPending: m?.outbox_pending,
          outboxProcessing: m?.outbox_processing,
          outboxFailed: m?.outbox_failed,
          outboxOldestOpenSeconds: m?.outbox_oldest_open_seconds,
          reviewsQueued: m?.reviews_queued,
          reviewsRunning: m?.reviews_running,
          reviewsFailed: m?.reviews_failed,
          reviewsOldestQueuedSeconds: m?.reviews_oldest_queued_seconds,
          reviewsEstimatedCostTodayUsd: m?.reviews_estimated_cost_today_usd,
          reviewsInputTokensToday: m?.reviews_input_tokens_today,
          reviewsOutputTokensToday: m?.reviews_output_tokens_today,
          reviewsLatencyP50Seconds24h: m?.reviews_latency_p50_seconds_24h,
          reviewsLatencyP95Seconds24h: m?.reviews_latency_p95_seconds_24h,
          reportsWaitingReview: m?.reports_waiting_review,
          communityUpdatesWaitingReview: m?.community_updates_waiting_review,
          activityResultsWaitingReview: m?.activity_results_waiting_review,
          measurementsWaitingReview: m?.measurements_waiting_review,
          coordinatorAcceptancePending: m?.coordinator_acceptance_pending,
          moderatorOldestPendingSeconds: m?.moderator_oldest_pending_seconds,
          renditionsQueued: m?.renditions_queued,
          renditionsFailed: m?.renditions_failed,
          instagramOperationsQueued: m?.instagram_operations_queued,
          instagramOperationsRunning: m?.instagram_operations_running,
          instagramOperationsFailed: m?.instagram_operations_failed,
          instagramOperationsNeedsAction: m?.instagram_operations_needs_action,
          instagramRetractionsQueued: m?.instagram_retractions_queued,
          instagramOldestRetractionSeconds: m?.instagram_oldest_retraction_seconds,
          instagramUncertainAttempts24h: m?.instagram_uncertain_attempts_24h,
          mediaCleanupPending: m?.media_cleanup_pending,
          accountCleanupOpen: m?.account_cleanup_open,
        },
        instagramAccountStatus: m?.instagram_account_status ?? 'not_connected',
      });
    } catch (error) {
      console.error('sap_extension_metrics_failed', { code: 'METRICS_QUERY_FAILED' });
    }
  }
  private schedule(): void {
    if (this.stopping) return;
    this.active = this.poll().catch(() => console.error('extension_relay_failed')).finally(() => {
      if (!this.stopping) this.timer = setTimeout(() => this.schedule(), 2000);
    });
  }
  private async ticket(event: ExtensionEvent, id: string): Promise<void> {
    await this.queues[lane(event.topic)].add(event.topic, event, { jobId: id,
      attempts: this.config.EXTENSION_JOB_MAX_ATTEMPTS, backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true, removeOnFail: 1000 });
  }
  private async poll(): Promise<void> {
    for (let i = 0; i < 50 && !this.stopping; i++) {
      const owner = randomUUID();
      const row = await this.sql.begin(async tx => {
        const [event] = await tx<OutboxRow[]>`SELECT id,topic,aggregate_id,payload_minimal,attempts FROM outbox_events
          WHERE topic=ANY(${topics}::text[]) AND next_attempt_at<=now()
            AND ((${this.config.SAP_EXTENSION_ENABLED} AND (${this.config.SAP_INSTAGRAM_ENABLED} OR topic NOT IN ('instagram.render.requested','instagram.publish.requested'))) OR topic IN ('instagram.retract.requested','instagram.disconnect.requested','publication.source.changed','media.consent.changed'))
            AND (state='pending' OR (state='processing' AND lease_expires_at<now()))
          ORDER BY CASE WHEN topic IN ('instagram.retract.requested','instagram.disconnect.requested') THEN 0 ELSE 1 END,created_at,id
          FOR UPDATE SKIP LOCKED LIMIT 1`;
        if (!event) return null;
        await tx`UPDATE outbox_events SET state='processing',attempts=attempts+1,lease_owner=${owner},
          lease_expires_at=now()+${this.config.EXTENSION_JOB_LEASE_MS}*interval '1 millisecond',updated_at=now() WHERE id=${event.id}`;
        return event;
      });
      if (!row) break;
      try {
        await this.ticket({...row,outbox_id:row.id}, `${row.id}-${row.attempts}`);
        // A broker acknowledgement is only a receipt. Business processing acknowledges the outbox.
        await this.sql`UPDATE outbox_events SET last_error_code=NULL,updated_at=now()
          WHERE id=${row.id} AND lease_owner=${owner}`;
      } catch {
        await this.sql`UPDATE outbox_events SET state='pending',lease_owner=NULL,lease_expires_at=NULL,
          next_attempt_at=now()+interval '15 seconds',last_error_code='BROKER_UNAVAILABLE',updated_at=now()
          WHERE id=${row.id} AND lease_owner=${owner}`;
        break;
      }
    }
    if (Date.now() - this.lastRecovery > 30_000) { await this.recover(); this.lastRecovery = Date.now(); }
  }
  private async recover(): Promise<void> {
    // Recovery IDs include the attempt/epoch so a previously failed Redis ticket cannot suppress retry.
    const epoch = Math.floor(Date.now() / 30_000);
    if (this.config.SAP_EXTENSION_ENABLED) {
    const runs = await this.sql<{id:string;attempts:number}[]>`SELECT id,attempts FROM review_runs
      WHERE status='queued' OR (status='running' AND lease_expires_at<now()) ORDER BY created_at LIMIT 50`;
    for (const r of runs) await this.ticket({topic:'review.requested',aggregate_id:r.id,payload_minimal:{}}, `recover-${r.id}-${r.attempts}-${epoch}`);
    const renditions = await this.sql<{id:string;revision:number}[]>`SELECT id,revision FROM evidence_renditions WHERE status='queued' ORDER BY created_at LIMIT 50`;
    for (const r of renditions) await this.ticket({topic:'evidence.rendition.requested',aggregate_id:r.id,payload_minimal:{}}, `recover-${r.id}-${r.revision}-${epoch}`);
    }
    const enabled=this.config.SAP_EXTENSION_ENABLED&&this.config.SAP_INSTAGRAM_ENABLED;
    const ops = await this.sql<{id:string;kind:string;attempt_count:number}[]>`SELECT id,kind,attempt_count FROM instagram_operations
      WHERE status IN ('queued','running') AND (next_retry_at IS NULL OR next_retry_at<=now())
        AND (lease_expires_at IS NULL OR lease_expires_at<now()) AND (${enabled} OR kind IN ('retract','disconnect')) ORDER BY CASE WHEN kind='retract' THEN 0 ELSE 1 END,created_at LIMIT 50`;
    for (const op of ops) await this.ticket({topic:`instagram.${op.kind}.requested`,aggregate_id:op.id,payload_minimal:{}}, `recover-${op.id}-${op.attempt_count}-${epoch}`);
    if(!enabled)return;
    const posters = await this.sql<{id:string;content_revision:number}[]>`SELECT id,content_revision FROM instagram_posts
      WHERE rendition_status='queued' AND status IN ('draft','failed') ORDER BY created_at LIMIT 30`;
    for (const p of posters) await this.ticket({topic:'instagram.render.requested',aggregate_id:p.id,payload_minimal:{}}, `recover-${p.id}-${p.content_revision}-${epoch}`);
  }

  private async handle(event: ExtensionEvent): Promise<void> {
    await this.execute(event);
    if (event.outbox_id) await this.sql`UPDATE outbox_events SET state='delivered',lease_owner=NULL,
      lease_expires_at=NULL,last_error_code=NULL,updated_at=now() WHERE id=${event.outbox_id}`;
  }
  private async execute(event: ExtensionEvent): Promise<void> {
    const maintenance=new Set(['instagram.retract.requested','instagram.disconnect.requested','publication.source.changed','media.consent.changed']);
    if (!this.config.SAP_EXTENSION_ENABLED && !maintenance.has(event.topic)) return;
    if (!this.config.SAP_INSTAGRAM_ENABLED && (event.topic==='instagram.render.requested'||event.topic==='instagram.publish.requested')) return;
    if (event.topic === 'review.requested') return this.review.process(event);
    if (event.topic === 'evidence.rendition.requested') return this.rendition.process(event);
    if (event.topic.startsWith('instagram.')) return this.publication.process(event);
    if (event.topic === 'publication.source.changed' || event.topic === 'media.consent.changed' || event.topic === 'report.changed') {
      await this.publication.process({...event, topic: event.topic === 'report.changed' ? 'publication.source.changed' : event.topic});
    }
    if (!this.config.SAP_EXTENSION_ENABLED) return;
    await this.domain(event);
  }

  private async domain(event: ExtensionEvent): Promise<void> {
    const reportId = String(event.payload_minimal.reportId ?? (event.topic.startsWith('report.') || event.topic === 'publication.source.changed' ? event.aggregate_id : ''));
    if (!/^[0-9a-f-]{36}$/i.test(reportId)) return;
    await this.sql.begin(async tx => {
      const [report] = await tx<{status:string;public_visibility:string;revision:number}[]>`SELECT status,public_visibility,revision FROM reports WHERE id=${reportId} FOR UPDATE`;
      if (!report) return;
      if (['report.changed','report.decided','publication.source.changed','media.consent.changed'].includes(event.topic)) await tx`DELETE FROM area_snapshots`;
      const withdrawn = report.public_visibility !== 'public';
      if (withdrawn) {
        const held = await tx<{id:string;revision:number}[]>`UPDATE activities SET prior_state=CASE WHEN status<>'on_hold' THEN status ELSE prior_state END,
          status='on_hold',hold_reason='Sumber kejadian sedang ditinjau.',revision=revision+1,updated_at=now()
          WHERE report_id=${reportId} AND public_ever AND status NOT IN ('completed','cancelled')
            AND (status<>'on_hold' OR hold_reason IS DISTINCT FROM 'Sumber kejadian sedang ditinjau.')
          RETURNING id,revision`;
        await tx`UPDATE notifications SET title='Informasi kejadian diperbarui',message='Informasi sumber kejadian sedang ditinjau.'
          WHERE target_path=${`/incidents/${reportId}`}`;
        for (const activity of held) {
          const eventKey=`activity:${activity.id}:${activity.revision}`;
          await tx`UPDATE notifications SET title='Informasi kegiatan diperbarui',
            message='Sumber kejadian sedang ditinjau. Informasi kegiatan sementara dibatasi.',target_path=${`/activities/${activity.id}`}
            WHERE target_path IN (${`/activities/${activity.id}`},${`/activities/${activity.id}/manage`})`;
          await tx`INSERT INTO notifications(user_id,event_key,type,title,message,target_path)
            SELECT recipients.user_id,${eventKey},'activity_changed','Informasi kegiatan diperbarui',
              'Sumber kejadian sedang ditinjau. Informasi kegiatan sementara dibatasi.',${`/activities/${activity.id}`}
            FROM (
              SELECT user_id FROM activity_memberships WHERE activity_id=${activity.id} AND status IN ('requested','accepted','waitlisted')
              UNION SELECT coordinator_id AS user_id FROM activities WHERE id=${activity.id} AND coordinator_id IS NOT NULL
            ) recipients JOIN users u ON u.id=recipients.user_id AND u.deleted_at IS NULL
            ON CONFLICT(user_id,event_key,type) DO NOTHING`;
          await tx`INSERT INTO outbox_events(topic,aggregate_id,payload_minimal,dedup_key)
            VALUES('activity.changed',${activity.id},${tx.json({reportId,aggregateRevision:activity.revision})},${`activity.changed:${activity.id}:${activity.revision}`})
            ON CONFLICT(dedup_key) DO NOTHING`;
        }
        const relatedActivities = await tx<{id:string}[]>`SELECT id FROM activities WHERE report_id=${reportId} AND public_ever`;
        for (const activity of relatedActivities) {
          await tx`UPDATE notifications SET title='Informasi kegiatan diperbarui',
            message='Sumber kejadian sedang ditinjau. Informasi kegiatan sementara dibatasi.',target_path=${`/activities/${activity.id}`}
            WHERE target_path IN (${`/activities/${activity.id}`},${`/activities/${activity.id}/manage`})`;
        }
      }
      const consentChannels=Array.isArray(event.payload_minimal.channels)?event.payload_minimal.channels.map(String):null;
      const publicEvidenceChanged=typeof event.payload_minimal.mediaId==='string' &&
        (event.payload_minimal.channel==='web' || (event.payload_minimal.channel===undefined && (!consentChannels || consentChannels.includes('web'))));
      const publicConsentChanged=event.payload_minimal.reason==='consent_revoked' &&
        (!consentChannels || consentChannels.includes('web'));
      const sourceWithdrew = event.payload_minimal.withdrawn === true && event.payload_minimal.scope !== 'instagram';
      const sourceRestored = event.payload_minimal.restored === true && event.payload_minimal.scope !== 'instagram';
      const publicationChanged = event.topic === 'publication.source.changed' &&
        (sourceWithdrew || sourceRestored || publicConsentChanged || publicEvidenceChanged);
      if (event.topic === 'report.decided' || event.topic === 'report.changed' || publicationChanged) {
        const eventRevision=Number(event.payload_minimal.aggregateRevision);
        const sourceRevision=Number.isSafeInteger(eventRevision)&&eventRevision>0?eventRevision:report.revision;
        const newlyResolved=event.topic==='report.decided'&&event.payload_minimal.status==='resolved'&&report.status==='resolved'&&sourceRevision===report.revision;
        const type = withdrawn ? 'incident_withdrawn' : newlyResolved ? 'incident_resolved' : 'incident_updated';
        const notice=type==='incident_withdrawn'
          ? {title:'Informasi kejadian ditarik',message:'Informasi ini tidak lagi tersedia untuk publik.'}
          : type==='incident_resolved'
            ? {title:'Kejadian telah ditangani',message:'Buka SAP untuk melihat perkembangan penanganan kejadian.'}
            : {title:'Perkembangan kejadian',message:'Buka SAP untuk melihat informasi terbaru yang tersedia.'};
        await tx`INSERT INTO notifications(user_id,event_key,type,title,message,target_path)
          SELECT f.user_id,${`report:${reportId}:${sourceRevision}`},${type},${notice.title},${notice.message},${`/incidents/${reportId}`}
          FROM incident_follows f JOIN users u ON u.id=f.user_id WHERE f.report_id=${reportId} AND f.following AND u.deleted_at IS NULL
          ON CONFLICT(user_id,event_key,type) DO NOTHING`;
      }
      if (event.topic === 'community.update.decided') {
        const status=String(event.payload_minimal.status ?? '');
        const notice=status==='needs_evidence'
          ? {title:'Bukti tambahan diperlukan',message:'Tambahkan bukti yang diminta pada pembaruan kondisi Anda.'}
          : status==='approved'
            ? {title:'Pembaruan Anda disetujui',message:'Pembaruan kondisi Anda telah disetujui dan dipublikasikan.'}
            : status==='rejected'
              ? {title:'Pembaruan Anda belum disetujui',message:'Lihat alasan keputusan pada pembaruan kondisi Anda.'}
              : null;
        if (notice) await tx`INSERT INTO notifications(user_id,event_key,type,title,message,target_path)
          SELECT id,${`update:${event.aggregate_id}:${event.payload_minimal.aggregateRevision}`},'community_update_decided',
            ${notice.title},${notice.message},${`/community-updates/${event.aggregate_id}`}
          FROM users WHERE id=${String(event.payload_minimal.authorId)} AND deleted_at IS NULL
          ON CONFLICT(user_id,event_key,type) DO NOTHING`;
      }
    });
  }
  async close(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    await this.active;
    await Promise.all(this.workers.map(worker => worker.close()));
    await Promise.all(Object.values(this.queues).map(queue => queue.close()));
  }
}
