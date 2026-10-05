import { Inject, Injectable } from '@nestjs/common';
import { getConfig } from '@sap/config';
import { ReviewService } from '../community/review.service.js';
import { ExtensionStore, type PublicationEvidence } from '../extensions/extension.store.js';
import { DATABASE, type Database } from '../infrastructure/database.module.js';
import { IdempotencyStore, type Tx } from '../infrastructure/idempotency.store.js';
import { jakartaToday } from '../gamification/gamification.types.js';
import { ReportRepository } from '../reports/report.repository.js';
import { ActivitiesService } from '../activities/activities.service.js';
import {
  toReportView,
  type ReportRecord,
  type ReportStatus,
  type ReportView,
} from '../reports/report.types.js';
import {
  awardAction,
  isValidDuplicateTarget,
  isValidTransition,
  requiresInitialPublicSummary,
  MAX_REPORT_AWARDS_PER_DAY,
  REPORT_AWARD_DELTA,
  type AdminStatsView,
  type DuplicateCandidateView,
} from './moderation.types.js';

export interface DecideInput {
  reportId: string;
  actorId: string;
  actorScope: string;
  route: string;
  key: string;
  requestHash: string;
  requestId: string | null;
  ifMatchRevision: number;
  nextStatus: ReportStatus;
  reason: string;
  duplicateOfId: string | null;
  resolutionMediaIds: string[];
  resolutionEvidenceIds?: string[];
  publicEvidenceApprovals?: PublicationEvidence[];
  publicSummary: string | null | undefined;
  publishMediaIds: string[];
}

export type DecideFailure =
  | 'not_found'
  | 'conflict'
  | 'invalid_transition'
  | 'duplicate_target_invalid'
  | 'summary_required'
  | 'resolution_media_required'
  | 'publish_media_invalid';

export type DecideResult =
  | { ok: true; view: ReportView; replayed: boolean }
  | { ok: false; reason: DecideFailure };

class DecisionAbort extends Error {
  constructor(readonly reason: DecideFailure) { super(reason); }
}

/**
 * Duplicate-candidate criteria (HOTSPOT_RULES §5): a nearby report is offered as
 * a candidate only when it is within {@link DUPLICATE_RADIUS_METERS} AND its
 * incident time is within {@link TEMPORAL_WINDOW_MS} of the subject. Both are
 * suggestion filters, not automatic decisions — the admin still confirms.
 */
const DUPLICATE_RADIUS_METERS = 100;
const TEMPORAL_WINDOW_MS = 24 * 60 * 60 * 1_000;
const TEMPORAL_WINDOW_SECONDS = TEMPORAL_WINDOW_MS / 1_000;

@Injectable()
export class ModerationRepository {
  constructor(
    @Inject(DATABASE) private readonly sql: Database,
    private readonly idempotency: IdempotencyStore,
    private readonly reports: ReportRepository,
    private readonly extensions: ExtensionStore,
    private readonly reviews: ReviewService,
    private readonly activities: ActivitiesService,
  ) {}

  /**
   * Apply an admin moderation decision in a single locked transaction: validate
   * the If-Match revision, the status transition, and any duplicate/resolution/
   * publish requirements; write the status event, moderation decision, audit
   * event, and outbox refresh; and award or reverse the +20 report point exactly
   * once as the report enters or leaves the verified family (PRD §7). A duplicate
   * Idempotency-Key replays the original 200 body.
   */
  async decide(input: DecideInput): Promise<DecideResult> {
    try {
    return await this.sql.begin(async (tx) => {
      const replay = await this.idempotency.reserve(tx, {
        actorScope: input.actorScope,
        route: input.route,
        key: input.key,
        requestHash: input.requestHash,
      });
      if (replay) return { ok: true, view: replay.body as ReportView, replayed: true } as const;

      if (input.nextStatus === 'duplicate' && input.duplicateOfId) {
        await tx`SELECT id FROM reports WHERE id=ANY(${[input.reportId,input.duplicateOfId]}::uuid[]) ORDER BY id FOR UPDATE`;
      }

      const cur = await tx<
        { reporter_id: string | null; status: ReportStatus; revision: number; public_summary:string|null; public_visibility:string }[]
      >`SELECT reporter_id, status, revision, public_summary, public_visibility FROM reports WHERE id = ${input.reportId} FOR UPDATE`;
      const row = cur[0];
      if (!row) throw new DecisionAbort('not_found');
      if (row.revision !== input.ifMatchRevision) throw new DecisionAbort('conflict');

      const from = row.status;
      const to = input.nextStatus;
      const summaryProvided = input.publicSummary !== undefined;
      const effectivePublicSummary = summaryProvided ? input.publicSummary ?? null : row.public_summary;
      const claimIds = input.resolutionEvidenceIds ?? [];
      let resolutionMediaIds = input.resolutionMediaIds;
      let resolutionObservedAt: Date | null = null;
      if (claimIds.length) {
        if (!getConfig().SAP_EXTENSION_ENABLED || to !== 'resolved' || resolutionMediaIds.length) throw new DecisionAbort('resolution_media_required');
        const claims = await tx<{media_id:string;observed_at:Date}[]>`SELECT ae.media_id,ae.observed_at FROM approved_resolution_evidence ae
          LEFT JOIN community_updates cu ON ae.source_type='community_update' AND cu.id=ae.source_id
          LEFT JOIN activity_results ar ON ae.source_type='activity_result' AND ar.id=ae.source_id
          JOIN reports r ON r.id=ae.report_id
          JOIN media m ON m.id=ae.media_id
          WHERE ae.id = ANY(${claimIds}::uuid[]) AND ae.report_id=${input.reportId} AND ae.status='valid'
            AND m.state='stored' AND m.deleted_at IS NULL
            AND ae.observed_at >= COALESCE(r.last_observed_at,r.occurred_at)
            AND EXISTS (SELECT 1 FROM media_publication_approvals a JOIN media_consents mc ON mc.media_id=a.media_id
              WHERE a.report_id=ae.report_id AND a.subject_type=ae.source_type AND a.subject_id=ae.source_id
                AND a.media_id=ae.media_id AND a.channel='web' AND a.approved AND 'web'=ANY(mc.channels))
            AND ((cu.status='approved' AND cu.kind='looks_clean' AND cu.revision=ae.source_revision)
              OR (ar.status='approved' AND ar.verified_outcome='complete' AND ar.revision=ae.source_revision)) FOR SHARE OF ae,m`;
        if (claims.length!==claimIds.length) throw new DecisionAbort('resolution_media_required');
        resolutionMediaIds=claims.map(c=>c.media_id);
        resolutionObservedAt=new Date(Math.max(...claims.map(c=>new Date(c.observed_at).getTime())));
      }
      if (!isValidTransition(from, to) && !(from==='verified' && to==='resolved' && claimIds.length)) throw new DecisionAbort('invalid_transition');
      const decisionObservedAt=to==='resolved'?(resolutionObservedAt??new Date()):null;
      if (requiresInitialPublicSummary(from, to) && !(input.publicSummary && input.publicSummary.trim().length > 0)) {
        throw new DecisionAbort('summary_required');
      }

      let duplicateOfId: string | null = null;
      if (to === 'duplicate') {
        if (!input.duplicateOfId) throw new DecisionAbort('duplicate_target_invalid');
        const target = await tx<{ id: string; status: ReportStatus; duplicate_of_id: string | null }[]>`
          SELECT id, status, duplicate_of_id FROM reports WHERE id = ${input.duplicateOfId} FOR UPDATE`;
        const t = target[0];
        if (!t || !isValidDuplicateTarget({ id: t.id, status: t.status, duplicateOfId: t.duplicate_of_id }, input.reportId)) {
          throw new DecisionAbort('duplicate_target_invalid');
        }
        duplicateOfId = t.id;
      }

      if (to === 'resolved' && resolutionMediaIds.length === 0) {
        throw new DecisionAbort('resolution_media_required');
      }

      if (getConfig().SAP_EXTENSION_ENABLED && (input.publicEvidenceApprovals?.length ?? 0)>0) {
        await this.extensions.approveEvidence(tx,'report',input.reportId,input.reportId,input.actorId,input.publicEvidenceApprovals!);
      }
      await tx`
        UPDATE reports SET
          status = ${to},
          duplicate_of_id = ${to === 'duplicate' ? duplicateOfId : null},
          public_summary = ${summaryProvided ? (input.publicSummary ?? null) : tx`public_summary`},
          verified_at = ${to === 'verified' ? tx`COALESCE(verified_at, now())` : tx`verified_at`},
          resolved_at = ${to === 'resolved' ? tx`now()` : tx`resolved_at`},
          ${getConfig().SAP_EXTENSION_ENABLED ? tx`public_visibility = CASE WHEN ${to} IN ('verified','in_progress','resolved') AND public_visibility <> 'withdrawn' THEN 'public' WHEN ${to} IN ('submitted','rejected','duplicate') THEN 'hidden' ELSE public_visibility END,
            public_ever = public_ever OR ${['verified','in_progress','resolved'].includes(to)},` : tx``}
          revision = revision + 1,
          updated_at = now()
        WHERE id = ${input.reportId}`;

      if (getConfig().SAP_EXTENSION_ENABLED &&
        (!['verified','in_progress','resolved'].includes(to) || row.public_visibility==='withdrawn')) {
        await this.activities.redactForReport(tx,input.reportId);
      }

      if (to === 'resolved') {
        for (let i = 0; i < resolutionMediaIds.length; i += 1) {
          await tx`
            INSERT INTO report_media (report_id, media_id, sort_order, kind)
            VALUES (${input.reportId}, ${resolutionMediaIds[i]!}, ${i}, 'resolution')
            ON CONFLICT (report_id, media_id) DO NOTHING`;
        }
      }

      if (input.publishMediaIds.length > 0) {
        const attached = await tx<{ media_id: string; object_key: string }[]>`
          SELECT rm.media_id, m.public_derivative_key AS object_key FROM report_media rm
          JOIN media m ON m.id = rm.media_id
          WHERE rm.report_id = ${input.reportId} AND rm.media_id = ANY(${input.publishMediaIds}::uuid[])
            AND m.public_derivative_key IS NOT NULL AND m.public_derivative_key <> m.object_key
            ${getConfig().SAP_EXTENSION_ENABLED ? tx`AND EXISTS (SELECT 1 FROM media_publication_approvals a JOIN media_consents c ON c.media_id=a.media_id
              WHERE a.report_id=${input.reportId} AND a.media_id=m.id AND a.channel='web' AND a.approved AND 'web'=ANY(c.channels))` : tx``}`;
        if (attached.length !== input.publishMediaIds.length) {
          throw new DecisionAbort('publish_media_invalid');
        }
        for (const a of attached) {
          await tx`UPDATE media SET public_derivative_key = ${a.object_key}, updated_at = now() WHERE id = ${a.media_id}`;
        }
      }

      await tx`
        INSERT INTO report_status_events (report_id, actor_id, from_status, to_status, reason, evidence_media_ids)
        VALUES (${input.reportId}, ${input.actorId}, ${from}, ${to}, ${input.reason},
                ${to === 'resolved' ? resolutionMediaIds : []})`;

      await tx`
        INSERT INTO moderation_decisions (report_id, actor_id, request_key, revision_before, decision_payload)
        VALUES (${input.reportId}, ${input.actorId}, ${input.key}, ${input.ifMatchRevision}, ${tx.json({
          nextStatus: to,
          duplicateOfId,
          resolutionMediaIds: input.resolutionMediaIds,
          resolutionEvidenceIds: input.resolutionEvidenceIds ?? [],
          publishMediaIds: input.publishMediaIds,
          hasPublicSummary: summaryProvided && Boolean(input.publicSummary),
          publicSummary: effectivePublicSummary,
          observedAt: decisionObservedAt?.toISOString() ?? null,
        } as never)})
        ON CONFLICT (actor_id, request_key) DO NOTHING`;

      await tx`
        INSERT INTO audit_events (actor_id, action, target_type, target_id, changes_redacted, request_id)
        VALUES (${input.actorId}, 'report.decision', 'report', ${input.reportId},
                ${tx.json({ fromStatus: from, toStatus: to, revisionBefore: input.ifMatchRevision } as never)},
                ${input.requestId})`;

      await this.applyPoints(tx, from, to, row.reporter_id, input.reportId);

      if (getConfig().SAP_EXTENSION_ENABLED) {
        await this.reviews.supersedeReport(tx, input.reportId);
        await tx`DELETE FROM area_snapshots`;
        if (duplicateOfId) {
          await tx`INSERT INTO incident_supports(report_id,user_id,supported)
            SELECT ${duplicateOfId},user_id,supported FROM incident_supports WHERE report_id=${input.reportId}
            ON CONFLICT(report_id,user_id) DO UPDATE SET supported=incident_supports.supported OR EXCLUDED.supported,updated_at=now()`;
          await tx`INSERT INTO incident_follows(report_id,user_id,following)
            SELECT ${duplicateOfId},user_id,following FROM incident_follows WHERE report_id=${input.reportId}
            ON CONFLICT(report_id,user_id) DO UPDATE SET following=incident_follows.following OR EXCLUDED.following,updated_at=now()`;
          await tx`DELETE FROM incident_supports WHERE report_id=${input.reportId}`;
          await tx`DELETE FROM incident_follows WHERE report_id=${input.reportId}`;
        }
        if (['verified','in_progress','resolved'].includes(to)) {
          const summary=await tx<{public_summary:string|null;occurred_at:Date|null}[]>`SELECT public_summary,occurred_at FROM reports WHERE id=${input.reportId}`;
          const timelineEvidenceIds=[...new Set([
            ...input.publishMediaIds,
            ...(input.publicEvidenceApprovals??[]).filter(item=>item.channels.includes('web')).map(item=>item.mediaId),
          ])];
          if (summary[0]?.public_summary) await tx`INSERT INTO public_incident_events(report_id,kind,summary,observed_at,evidence_media_ids)
            VALUES(${input.reportId},${to==='resolved'?'resolved':to==='in_progress'?'handling_started':'verified'},${summary[0].public_summary},${to==='resolved'?decisionObservedAt:summary[0].occurred_at},${to==='resolved'?resolutionMediaIds:timelineEvidenceIds})`;
        }
        await this.extensions.event(tx,'publication.source.changed',input.reportId,input.ifMatchRevision+1,{reportId:input.reportId});
      }

      await tx`
        INSERT INTO outbox_events (topic, aggregate_id, payload_minimal, dedup_key)
        VALUES ('report.decided', ${input.reportId}, ${tx.json({ reportId: input.reportId, status: to, aggregateRevision: input.ifMatchRevision + 1 } as never)},
                ${`report-decided:${input.reportId}:${input.ifMatchRevision + 1}`})
        ON CONFLICT (dedup_key) DO NOTHING`;

      const record = await this.reports.readRecord(input.reportId, tx);
      const view = toReportView(record!);
      await this.idempotency.storeResponse(tx, {
        actorScope: input.actorScope,
        route: input.route,
        key: input.key,
        statusCode: 200,
        body: view,
      });
      return { ok: true, view, replayed: false } as const;
    });
    } catch (error) {
      if (error instanceof DecisionAbort) return { ok:false,reason:error.reason };
      throw error;
    }
  }

  /**
   * Award or reverse the report point as eligibility changes. Awards +20 the
   * first time a report enters the verified family (capped at 3/day, deduped by
   * event key); reverses it with a compensating entry on the original award day
   * when the report leaves the family. Same-status decisions do neither.
   */
  private async applyPoints(
    tx: Tx,
    from: ReportStatus,
    to: ReportStatus,
    reporterId: string | null,
    reportId: string,
  ): Promise<void> {
    if (!reporterId) return;
    const action = awardAction(from, to);
    if (action === 'award') {
      const day = jakartaToday();
      await tx`INSERT INTO user_daily_activity (user_id, activity_day) VALUES (${reporterId}, ${day}) ON CONFLICT DO NOTHING`;
      const activity = await tx<{ report_award_count: number }[]>`
        SELECT report_award_count FROM user_daily_activity
        WHERE user_id = ${reporterId} AND activity_day = ${day} FOR UPDATE`;
      if ((activity[0]?.report_award_count ?? 0) >= MAX_REPORT_AWARDS_PER_DAY) return;
      const inserted = await tx<{ id: string }[]>`
        INSERT INTO point_ledger (user_id, event_key, source_type, source_id, delta, reason, activity_day)
        VALUES (${reporterId}, ${`report:${reportId}`}, 'report', ${reportId}, ${REPORT_AWARD_DELTA}, 'report_verified', ${day})
        ON CONFLICT (event_key) DO NOTHING RETURNING id`;
      if (inserted.length > 0) {
        await tx`UPDATE user_daily_activity
          SET report_award_count = report_award_count + 1, net_points = net_points + ${REPORT_AWARD_DELTA}, updated_at = now()
          WHERE user_id = ${reporterId} AND activity_day = ${day}`;
      }
    } else if (action === 'reverse') {
      const award = await tx<{ activity_day: string }[]>`
        SELECT to_char(activity_day, 'YYYY-MM-DD') AS activity_day FROM point_ledger
        WHERE event_key = ${`report:${reportId}`} AND delta > 0 LIMIT 1`;
      const awardDay = award[0]?.activity_day;
      if (!awardDay) return;
      const inserted = await tx<{ id: string }[]>`
        INSERT INTO point_ledger (user_id, event_key, source_type, source_id, delta, reason, activity_day)
        VALUES (${reporterId}, ${`report:${reportId}:reversal`}, 'report_reversal', ${reportId}, ${-REPORT_AWARD_DELTA}, 'report_verification_reversed', ${awardDay})
        ON CONFLICT (event_key) DO NOTHING RETURNING id`;
      if (inserted.length > 0) {
        await tx`UPDATE user_daily_activity
          SET report_award_count = GREATEST(report_award_count - 1, 0), net_points = net_points - ${REPORT_AWARD_DELTA}, updated_at = now()
          WHERE user_id = ${reporterId} AND activity_day = ${awardDay}`;
      }
    }
  }

  /** Keyset page over all reports (admin view), (created_at, id) descending. */
  async listReports(limit: number, cursor: string | null, status: ReportStatus | null): Promise<ReportRecord[]> {
    const rows = await this.sql<{ id: string }[]>`
      SELECT id FROM reports
      WHERE TRUE
        ${status ? this.sql`AND status = ${status}` : this.sql``}
        ${cursor ? this.sql`AND (created_at, id) < (SELECT created_at, id FROM reports WHERE id = ${cursor})` : this.sql``}
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}`;
    const records = await Promise.all(rows.map((r) => this.reports.readRecord(r.id)));
    return records.filter((r): r is ReportRecord => r !== null);
  }

  /**
   * Suggest possible canonical duplicates for a report: other reports within
   * {@link DUPLICATE_RADIUS_METERS} (PostGIS geography/ST_DWithin) AND within
   * {@link TEMPORAL_WINDOW_MS} of the subject's occurredAt (HOTSPOT_RULES §5),
   * ranked by distance, annotated with proximity/same-cell/temporal reason
   * codes. Returns null when the subject report does not exist.
   */
  async listDuplicateCandidates(reportId: string): Promise<DuplicateCandidateView[] | null> {
    const subject = await this.sql<{ h3_cell: string; occurred_at: Date }[]>`
      SELECT h3_cell, occurred_at FROM reports WHERE id = ${reportId} LIMIT 1`;
    const s = subject[0];
    if (!s) return null;
    const rows = await this.sql<
      { id: string; status: ReportStatus; distance_meters: number; occurred_at: Date; h3_cell: string }[]
    >`
      SELECT r.id, r.status, r.occurred_at, r.h3_cell,
             ST_Distance(r.location, subject.location) AS distance_meters
      FROM reports r
      CROSS JOIN (SELECT location, occurred_at FROM reports WHERE id = ${reportId}) AS subject
      WHERE r.id <> ${reportId}
        AND r.status <> 'duplicate'
        AND ST_DWithin(r.location, subject.location, ${DUPLICATE_RADIUS_METERS})
        AND ABS(EXTRACT(EPOCH FROM (r.occurred_at - subject.occurred_at))) <= ${TEMPORAL_WINDOW_SECONDS}
      ORDER BY distance_meters ASC, r.id ASC
      LIMIT 50`;
    return rows.map((r) => {
      const reasonCodes = ['proximity'];
      if (r.h3_cell === s.h3_cell) reasonCodes.push('same_h3_cell');
      if (Math.abs(r.occurred_at.getTime() - s.occurred_at.getTime()) <= TEMPORAL_WINDOW_MS) {
        reasonCodes.push('temporal_proximity');
      }
      return {
        reportId: r.id,
        status: r.status,
        distanceMeters: Number(r.distance_meters),
        occurredAt: r.occurred_at.toISOString(),
        reasonCodes,
      };
    });
  }

  /** Aggregate report counts by status plus the oldest still-pending (submitted) report. */
  async adminStats(): Promise<AdminStatsView> {
    const rows = await this.sql<
      { submitted: string; verified: string; in_progress: string; resolved: string; oldest_pending: Date | null }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE status = 'submitted') AS submitted,
        COUNT(*) FILTER (WHERE status = 'verified') AS verified,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
        COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
        MIN(created_at) FILTER (WHERE status = 'submitted') AS oldest_pending
      FROM reports`;
    const r = rows[0]!;
    return {
      submittedReports: Number(r.submitted),
      verifiedReports: Number(r.verified),
      inProgressReports: Number(r.in_progress),
      resolvedReports: Number(r.resolved),
      oldestPendingAt: r.oldest_pending ? r.oldest_pending.toISOString() : null,
    };
  }
}
