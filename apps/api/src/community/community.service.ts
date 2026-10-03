import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { getConfig } from '@sap/config';
import { ObjectStorageService } from '../media/object-storage.service.js';
import { ExtensionStore, type Actor, type Executor, type PublicationEvidence, type SubjectType, fail, iso, permission, requireAdmin, requireFeature, requireVerified } from '../extensions/extension.store.js';
import * as input from '../extensions/input.js';
import { RateLimitException } from '../platform/http/rate-limit.js';
import { ReviewService } from './review.service.js';
import type { Tx } from '../infrastructure/idempotency.store.js';

type Row = Record<string, any>;
const eligibleStatuses = ['verified', 'in_progress', 'resolved'];
const updateKinds = ['still_present', 'reduced', 'looks_clean', 'information_wrong'] as const;
const updateStates = ['submitted', 'needs_evidence', 'approved', 'rejected'] as const;

@Injectable()
export class CommunityService {
  constructor(private readonly store: ExtensionStore, private readonly objects: ObjectStorageService, private readonly reviews: ReviewService) {}

  private enabled(): void { requireFeature('community'); }

  /** Public predicates are reapplied before every projection; never serialize owner Report DTOs. */
  async publicReport(id: string, tx: Executor = this.store.db, lock = false): Promise<Row> {
    const initial = (await tx<Row[]>`SELECT * FROM reports WHERE id=${id}`)[0];
    if (!initial) fail(404, 'NOT_FOUND');
    let report = initial;
    let locked: Row[] = [];
    if (lock) {
      const ids = initial.status === 'duplicate' && initial.duplicate_of_id ? [id, initial.duplicate_of_id] : [id];
      // Moderation locks duplicate/canonical pairs in UUID order as well.
      locked = await tx<Row[]>`SELECT * FROM reports WHERE id=ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
      report = locked.find(row => row.id === id)!;
      if (!report) fail(404, 'NOT_FOUND');
      if (report.status === 'duplicate' && report.duplicate_of_id && !locked.some(row => row.id === report.duplicate_of_id)) fail(409, 'REVISION_CONFLICT');
    }
    if (!report) fail(404, 'NOT_FOUND');
    if (report.status === 'duplicate' && report.duplicate_of_id) {
      const candidates = lock ? locked.filter(row => row.id === report.duplicate_of_id) : await tx<Row[]>`SELECT * FROM reports WHERE id=${report.duplicate_of_id}`;
      const candidate = candidates[0];
      if (candidate && candidate.public_visibility === 'public' && eligibleStatuses.includes(candidate.status) && !candidate.duplicate_of_id) {
        return { ...candidate, redirected_from: report.id };
      }
      if (report.public_ever) fail(410, 'INCIDENT_WITHDRAWN');
      fail(404, 'NOT_FOUND');
    }
    if (report.public_visibility !== 'public' || !eligibleStatuses.includes(report.status) || report.duplicate_of_id) {
      if (report.public_ever) fail(410, 'INCIDENT_WITHDRAWN');
      fail(404, 'NOT_FOUND');
    }
    return report;
  }

  async publicEvidence(reportId: string, mediaIds?: string[], tx: Executor = this.store.db): Promise<unknown[]> {
    const filter = mediaIds === undefined ? tx`` : tx`AND m.id=ANY(${mediaIds}::uuid[])`;
    const rows = await tx<Row[]>`SELECT a.id,a.media_id,er.object_key,are.observed_at FROM media_publication_approvals a
      JOIN reports r ON r.id=a.report_id JOIN media m ON m.id=a.media_id
      JOIN evidence_renditions er ON er.id=a.rendition_id JOIN media_consents mc ON mc.media_id=m.id
      LEFT JOIN LATERAL (SELECT observed_at FROM approved_resolution_evidence WHERE media_id=m.id AND report_id=r.id AND status='valid' ORDER BY approved_at DESC LIMIT 1) are ON true
      WHERE a.report_id=${reportId} AND a.channel='web' AND a.approved AND r.public_visibility='public'
        AND r.status IN ('verified','in_progress','resolved') AND r.duplicate_of_id IS NULL
        AND er.status='ready' AND er.object_key IS NOT NULL AND m.state='stored' AND m.deleted_at IS NULL
        AND er.subject_type=a.subject_type AND er.subject_id=a.subject_id AND er.media_id=m.id
        AND (
          (a.subject_type='report' AND a.subject_id=r.id AND EXISTS(SELECT 1 FROM report_media rm WHERE rm.report_id=r.id AND rm.media_id=m.id))
          OR (a.subject_type='community_update' AND EXISTS(SELECT 1 FROM community_updates cu JOIN evidence_links el ON el.subject_id=cu.id
            AND el.subject_type='community_update' AND el.media_id=m.id WHERE cu.id=a.subject_id AND cu.report_id=r.id AND cu.status='approved'))
          OR (a.subject_type='activity_result' AND EXISTS(SELECT 1 FROM activity_results ar JOIN evidence_links el ON el.subject_id=ar.id
            AND el.subject_type='activity_result' AND el.media_id=m.id WHERE ar.id=a.subject_id AND ar.report_id=r.id AND ar.status='approved'))
        )
        AND 'web'=ANY(mc.channels) ${filter} ORDER BY a.updated_at,a.id`;
    return Promise.all(rows.map(async row => {
      const signed = await this.objects.createSignedGetUrl(row.object_key);
      return { id: row.id, url: signed.url, expiresAt: signed.expiresAt.toISOString(), observedAt: iso(row.observed_at ?? null), caption: 'Bukti yang disetujui SAP' };
    }));
  }

  async incident(id: string): Promise<unknown> {
    this.enabled(); const report = await this.publicReport(id);
    if (report.redirected_from) return { kind: 'redirect', canonicalId: report.id, canonicalPath: `/incidents/${report.id}` };
    const counts = await this.store.db<Row[]>`SELECT count(*)::integer AS count FROM incident_supports s JOIN users u ON u.id=s.user_id
      WHERE s.report_id=${report.id} AND s.supported AND u.deleted_at IS NULL`;
    const activities = await this.store.db<Row[]>`SELECT id FROM activities WHERE report_id=${report.id} AND status<>'draft' AND public_ever ORDER BY created_at DESC`;
    return { kind: 'incident', id: report.id, sourceRevision: report.revision,
      title: report.public_summary || 'Kejadian lingkungan', summary: report.public_summary || '', status: report.status,
      categoryId: report.category_id, area: { cellId: report.h3_cell, label: `Area ${report.h3_cell}` },
      occurredAt: iso(report.occurred_at ?? report.created_at), lastObservedAt: iso(report.last_observed_at), updatedAt: iso(report.updated_at),
      evidence: await this.publicEvidence(report.id), supportCount: counts[0]?.count ?? 0, supportClosed: report.status === 'resolved',
      relatedActivityIds: activities.map(row => row.id), canonicalPath: `/incidents/${report.id}` };
  }

  async timeline(id: string, query: Record<string, unknown>): Promise<unknown> {
    this.enabled(); const report = await this.publicReport(id); const page = this.store.cursor(query, { type: 'incident_timeline', id: report.id });
    const after = page.boundary ? this.store.db`AND (created_at,id)<(${page.boundary.at}::timestamptz,${page.boundary.id}::uuid)` : this.store.db``;
    const rows = await this.store.db<Row[]>`SELECT * FROM public_incident_events WHERE report_id=${report.id} ${after} ORDER BY created_at DESC,id DESC LIMIT ${page.limit + 1}`;
    const chosen = rows.slice(0, page.limit);
    return { items: await Promise.all(chosen.map(async row => ({ id: row.id, kind: row.kind, occurredAt: iso(row.created_at), observedAt: iso(row.observed_at), summary: row.summary,
      evidence: await this.publicEvidence(report.id, row.evidence_media_ids) }))), nextCursor: rows.length > page.limit ? page.encode(chosen[chosen.length - 1] as {id:string;created_at:Date}) : null };
  }

  async viewer(id: string, actor: Actor): Promise<unknown> {
    this.enabled(); const report = await this.publicReport(id);
    const rows = await this.store.db<Row[]>`SELECT
      coalesce((SELECT supported FROM incident_supports WHERE report_id=${report.id} AND user_id=${actor.id}),false) AS supported,
      coalesce((SELECT following FROM incident_follows WHERE report_id=${report.id} AND user_id=${actor.id}),false) AS following`;
    return { incidentId: report.id, supported: rows[0]?.supported ?? false, following: rows[0]?.following ?? false,
      actions: { support: permission(actor.emailVerified && report.status !== 'resolved', actor.emailVerified ? 'SUPPORT_CLOSED' : 'EMAIL_NOT_VERIFIED'),
        update: permission(actor.emailVerified, 'EMAIL_NOT_VERIFIED'), follow: permission(true, 'INCIDENT_WITHDRAWN') } };
  }

  async support(id: string, actor: Actor, body: unknown): Promise<unknown> {
    this.enabled(); requireVerified(actor); const supported = input.bool(input.object(body, ['supported']).supported);
    return this.store.db.begin(async tx => {
      await this.rateLimit(tx, actor.id, 'support', 60);
      let report = await this.publicReport(id, tx, true);
      // Lock the canonical itself as well when a duplicate alias was supplied.
      if (report.redirected_from) report = await this.publicReport(report.id, tx, true);
      if (report.status === 'resolved') fail(409, 'SUPPORT_CLOSED');
      await tx`INSERT INTO incident_supports(report_id,user_id,supported) VALUES(${report.id},${actor.id},${supported})
        ON CONFLICT(report_id,user_id) DO UPDATE SET supported=EXCLUDED.supported,updated_at=now()`;
      const rows = await tx<Row[]>`SELECT count(*)::integer AS count FROM incident_supports s JOIN users u ON u.id=s.user_id WHERE s.report_id=${report.id} AND s.supported AND u.deleted_at IS NULL`;
      return { incidentId: report.id, supported, supportCount: rows[0]?.count ?? 0, supportClosed: false };
    });
  }

  async follow(id: string, actor: Actor, body: unknown): Promise<unknown> {
    this.enabled(); const following = input.bool(input.object(body, ['following']).following);
    return this.store.db.begin(async tx => {
      await this.rateLimit(tx, actor.id, 'follow', 60);
      let canonical = id;
      if (following) canonical = (await this.publicReport(id, tx, true)).id;
      else {
        // A private relationship permits unfollow, never a private incident projection.
        const rows = await tx<Row[]>`SELECT f.report_id FROM incident_follows f WHERE f.user_id=${actor.id} AND f.report_id=${id} FOR UPDATE`;
        if (!rows.length) {
          const aliases = await tx<Row[]>`SELECT f.report_id FROM incident_follows f JOIN reports r ON r.duplicate_of_id=f.report_id WHERE f.user_id=${actor.id} AND r.id=${id}`;
          canonical = aliases[0]?.report_id ?? id;
        }
        await tx`UPDATE incident_follows SET following=false,updated_at=now() WHERE report_id=${canonical} AND user_id=${actor.id}`;
        return { incidentId: canonical, following: false };
      }
      await tx`INSERT INTO incident_follows(report_id,user_id,following) VALUES(${canonical},${actor.id},true)
        ON CONFLICT(report_id,user_id) DO UPDATE SET following=true,updated_at=now()`;
      return { incidentId: canonical, following: true };
    });
  }

  async followed(actor: Actor, query: Record<string, unknown>): Promise<unknown> {
    this.enabled(); const page = this.store.cursor(query, { type: 'followed', user: actor.id });
    const after = page.boundary ? this.store.db`AND (f.created_at,f.report_id)<(${page.boundary.at}::timestamptz,${page.boundary.id}::uuid)` : this.store.db``;
    const rows = await this.store.db<Row[]>`SELECT r.*,f.created_at AS followed_at FROM incident_follows f JOIN reports r ON r.id=f.report_id WHERE f.user_id=${actor.id} AND f.following ${after}
      ORDER BY f.created_at DESC,f.report_id DESC LIMIT ${page.limit+1}`;
    const chosen = rows.slice(0,page.limit);
    return { items: chosen.map(row => {
      const publicAvailable = row.public_visibility==='public' && eligibleStatuses.includes(row.status) && !row.duplicate_of_id;
      return { incidentId: row.id, title: publicAvailable ? row.public_summary : null, status: publicAvailable ? row.status : null,
        availability: publicAvailable ? 'public' : 'withdrawn', canonicalPath: `/incidents/${row.id}`, lastEventAt: publicAvailable ? iso(row.updated_at) : null };
    }), nextCursor: rows.length>page.limit ? page.encode({id:chosen[chosen.length-1]!.id,created_at:chosen[chosen.length-1]!.followed_at}) : null };
  }

  private updateInput(body: unknown) {
    const data=input.object(body,['kind','observedAt','description','mediaIds','correctionField']);
    const kind=input.enumeration(data.kind,updateKinds); const correctionField=data.correctionField === null ? null : input.enumeration(data.correctionField,['location','category','time','photo','other'] as const);
    if ((kind==='information_wrong') !== (correctionField!==null)) fail(400,'VALIDATION_ERROR');
    return {kind,observedAt:input.date(data.observedAt),description:input.text(data.description,10,1000),mediaIds:input.ids(data.mediaIds),correctionField};
  }

  async createUpdate(id: string, actor: Actor, body: unknown, key: string): Promise<unknown> {
    this.enabled(); requireVerified(actor); const data=this.updateInput(body);
    return this.store.mutate(actor,`incident:${id}:update`,key,data,async tx=>{
      const report=await this.publicReport(id,tx,true); await this.rateLimit(tx,actor.id,'community_update',10);
      await this.assertNoPending(tx,actor.id,report.id,data.kind);
      const updateId=randomUUID();
      await tx`INSERT INTO community_updates(id,report_id,author_id,kind,observed_at,description,correction_field)
        VALUES(${updateId},${report.id},${actor.id},${data.kind},${data.observedAt},${data.description},${data.correctionField})`;
      await this.store.attachMedia(tx,actor.id,'community_update',updateId,data.mediaIds,'community');
      await this.reviews.enqueue(tx,'community_update',updateId,1);
      await this.store.event(tx,'community.update.submitted',updateId,1,{reportId:report.id,authorId:actor.id});
      return this.updateDto(updateId,tx);
    },201);
  }

  async patchUpdate(id: string, actor: Actor, expected: number, body: unknown): Promise<unknown> {
    this.enabled(); requireVerified(actor); const data=this.updateInput(body);
    return this.store.db.begin(async tx=>{
      const reportIds=await tx<Row[]>`SELECT report_id FROM community_updates WHERE id=${id} AND author_id=${actor.id}`;
      if(!reportIds[0]) fail(404,'NOT_FOUND');
      const report=await this.publicReport(reportIds[0].report_id,tx,true);
      const row=await this.authorUpdate(id,actor,tx,true); input.checkRevision(row.revision,expected);
      if(!['submitted','needs_evidence'].includes(row.status)) fail(409,'INVALID_TRANSITION');
      await this.assertNoPending(tx,actor.id,report.id,data.kind,id);
      await tx`DELETE FROM evidence_links WHERE subject_type='community_update' AND subject_id=${id}`;
      await this.store.attachMedia(tx,actor.id,'community_update',id,data.mediaIds,'community');
      await tx`UPDATE community_updates SET kind=${data.kind},observed_at=${data.observedAt},description=${data.description},correction_field=${data.correctionField},
        status='submitted',requested_evidence='[]',decision_reason=NULL,revision=revision+1,updated_at=now() WHERE id=${id}`;
      await this.reviews.supersede(tx,'community_update',id);
      await this.reviews.enqueue(tx,'community_update',id,row.revision+1);
      await this.store.event(tx,'community.update.submitted',id,row.revision+1,{reportId:report.id,authorId:actor.id});
      return this.updateDto(id,tx);
    });
  }

  private async assertNoPending(tx: Executor, authorId: string, reportId: string, kind: string, exclude: string|null=null): Promise<void> {
    const rows=await tx<Row[]>`SELECT id FROM community_updates WHERE author_id=${authorId} AND report_id=${reportId} AND kind=${kind}
      AND status IN ('submitted','needs_evidence') AND (${exclude}::uuid IS NULL OR id<>${exclude}::uuid)`;
    if(rows[0]) fail(409,'PENDING_UPDATE_EXISTS',`Lengkapi pembaruan milik Anda: ${rows[0].id}`);
  }

  private async authorUpdate(id: string, actor: Actor, tx: Executor=this.store.db, lock=false): Promise<Row> {
    const rows=lock ? await tx<Row[]>`SELECT * FROM community_updates WHERE id=${id} FOR UPDATE` : await tx<Row[]>`SELECT * FROM community_updates WHERE id=${id}`;
    const row=rows[0]; if(!row || (row.author_id!==actor.id && actor.role!=='admin')) fail(404,'NOT_FOUND'); return row;
  }

  async getUpdate(id: string, actor: Actor, admin=false): Promise<unknown> {
    this.enabled(); if(admin) requireAdmin(actor); await this.authorUpdate(id,actor);
    const dto=await this.updateDto(id);
    return admin ? {...dto,latestReview:await this.reviews.latest('community_update',id)} : dto;
  }

  async myUpdates(actor: Actor, query: Record<string, unknown>): Promise<unknown> {
    this.enabled(); const status=query.status===undefined ? null : input.enumeration(query.status,updateStates);
    const page=this.store.cursor(query,{type:'my_updates',user:actor.id,status});
    const after=page.boundary ? this.store.db`AND (created_at,id)<(${page.boundary.at}::timestamptz,${page.boundary.id}::uuid)` : this.store.db``;
    const rows=await this.store.db<Row[]>`SELECT id,created_at FROM community_updates WHERE author_id=${actor.id} AND (${status}::text IS NULL OR status=${status}) ${after}
      ORDER BY created_at DESC,id DESC LIMIT ${page.limit+1}`;
    const chosen=rows.slice(0,page.limit);
    return {items:await Promise.all(chosen.map(row=>this.updateDto(row.id))),nextCursor:rows.length>page.limit?page.encode(chosen[chosen.length-1] as {id:string;created_at:Date}):null};
  }

  async updateDto(id: string, tx: Executor=this.store.db) {
    const rows=await tx<Row[]>`SELECT * FROM community_updates WHERE id=${id}`; const row=rows[0]; if(!row) fail(404,'NOT_FOUND');
    const media=await tx<Row[]>`SELECT media_id FROM evidence_links WHERE subject_type='community_update' AND subject_id=${id} ORDER BY created_at,media_id`;
    const claims=await tx<Row[]>`SELECT * FROM approved_resolution_evidence WHERE source_type='community_update' AND source_id=${id} ORDER BY approved_at,id`;
    return {id:row.id,reportId:row.report_id,revision:row.revision,kind:row.kind,observedAt:iso(row.observed_at),description:row.description,
      mediaIds:media.map(m=>m.media_id),correctionField:row.correction_field,status:row.status,publicSummary:row.public_summary,
      requestedEvidence:row.requested_evidence,decisionReason:row.decision_reason,approvedResolutionEvidence:claims.map(this.claimDto),createdAt:iso(row.created_at),updatedAt:iso(row.updated_at)};
  }

  claimDto(row: Row) { return {id:row.id,reportId:row.report_id,sourceType:row.source_type,sourceId:row.source_id,sourceRevision:row.source_revision,
    mediaId:row.media_id,approvedAt:iso(row.approved_at),observedAt:iso(row.observed_at),status:row.status}; }

  async decideUpdate(id: string, actor: Actor, expected: number, body: unknown, key: string): Promise<unknown> {
    this.enabled(); requireAdmin(actor); const data=input.object(body,['action','reason','publicSummary','publicEvidenceApprovals','requestedEvidence']);
    const action=input.enumeration(data.action,['approve','request_evidence','reject'] as const); const reason=input.text(data.reason,5,1000);
    const summary=data.publicSummary===null ? null : input.text(data.publicSummary,1,500);
    const requested=input.strings(data.requestedEvidence,action==='request_evidence'?1:0,action==='request_evidence'?3:0);
    const approvals=this.approvals(data.publicEvidenceApprovals,action==='approve'?3:0);
    if ((action==='approve' && summary===null) || (action!=='approve' && summary!==null)) fail(400,'VALIDATION_ERROR');
    return this.store.mutate(actor,`community_update:${id}:decision`,key,{expected,...data},async tx=>{
      const subjects=await tx<Row[]>`SELECT report_id FROM community_updates WHERE id=${id}`; if(!subjects[0]) fail(404,'NOT_FOUND');
      const reports=await tx<Row[]>`SELECT * FROM reports WHERE id=${subjects[0].report_id} FOR UPDATE`; const report=reports[0]!;
      const rows=await tx<Row[]>`SELECT * FROM community_updates WHERE id=${id} FOR UPDATE`; const row=rows[0]!; input.checkRevision(row.revision,expected);
      if(row.status!=='submitted') fail(409,'INVALID_TRANSITION');
      if(action==='approve' && (report.public_visibility!=='public' || !eligibleStatuses.includes(report.status) || report.duplicate_of_id)) fail(409,'SOURCE_NOT_PUBLIC');
      await this.store.approveEvidence(tx,'community_update',id,report.id,actor.id,approvals);
      const target=action==='approve'?'approved':action==='reject'?'rejected':'needs_evidence'; const nextRevision=row.revision+1;
      await tx`UPDATE community_updates SET status=${target},public_summary=${summary},requested_evidence=${tx.json(requested)},decision_reason=${reason},revision=${nextRevision},updated_at=now() WHERE id=${id}`;
      await this.reviews.supersede(tx,'community_update',id);
      if(action==='approve') {
        const approvedIds=approvals.filter(a=>a.channels.includes('web')).map(a=>a.mediaId);
        await tx`INSERT INTO public_incident_events(report_id,kind,summary,observed_at,evidence_media_ids)
          VALUES(${report.id},${row.kind==='information_wrong'?'correction':'condition_updated'},${summary!},${row.observed_at},${approvedIds}::uuid[])`;
        const isCondition=row.kind!=='information_wrong';
        await tx`UPDATE reports SET last_observed_at=CASE WHEN ${isCondition} AND (last_observed_at IS NULL OR last_observed_at<${row.observed_at}::timestamptz) THEN ${row.observed_at}::timestamptz ELSE last_observed_at END,
          revision=revision+1,updated_at=now() WHERE id=${report.id}`;
        // A later accepted condition makes older cleanup claims ineligible for new resolutions.
        if(isCondition) await tx`UPDATE approved_resolution_evidence SET status='revoked' WHERE report_id=${report.id}
          AND status='valid' AND observed_at<${row.observed_at}::timestamptz`;
        // Historical "looks clean" observations cannot prove cleanup after a newer observation.
        if(row.kind==='looks_clean' && new Date(row.observed_at).getTime()>=new Date(report.occurred_at ?? report.created_at).getTime()
          && (!report.last_observed_at || new Date(row.observed_at).getTime()>=new Date(report.last_observed_at).getTime())) for(const approval of approvals.filter(a=>a.channels.includes('web'))) {
          await tx`INSERT INTO approved_resolution_evidence(report_id,source_type,source_id,source_revision,media_id,observed_at)
            VALUES(${report.id},'community_update',${id},${nextRevision},${approval.mediaId},${row.observed_at}) ON CONFLICT DO NOTHING`;
        }
        await this.reviews.supersedeReport(tx,report.id);
        await tx`DELETE FROM area_snapshots`;
        await this.store.event(tx,'report.changed',report.id,report.revision+1,{reason:'community_update_approved',subjectId:id});
        await this.store.event(tx,'publication.source.changed',report.id,report.revision+1,{reason:'community_update_approved',subjectId:id});
      }
      await this.store.audit(tx,actor.id,`community_update.${action}`,'community_update',id,{revisionBefore:row.revision,revisionAfter:nextRevision,status:target});
      await this.store.event(tx,'community.update.decided',id,nextRevision,{reportId:report.id,authorId:row.author_id,status:target});
      return this.updateDto(id,tx);
    });
  }

  private approvals(value: unknown, max: number): PublicationEvidence[] {
    if(!Array.isArray(value)||value.length>max) fail(400,'VALIDATION_ERROR');
    const result=value.map(v=>{const row=input.object(v,['mediaId','renditionId','channels']); const channels=input.strings(row.channels,1,2,9).map(c=>input.enumeration(c,['web','instagram'] as const));
      if(new Set(channels).size!==channels.length) fail(400,'VALIDATION_ERROR');
      return {mediaId:input.uuid(row.mediaId),renditionId:input.uuid(row.renditionId),channels};});
    if(new Set(result.map(r=>r.mediaId)).size!==result.length) fail(400,'VALIDATION_ERROR'); return result;
  }

  async lifecycle(id: string, actor: Actor, db: Executor=this.store.db): Promise<unknown> {
    requireFeature('evidence'); requireAdmin(actor); const rows=await db<Row[]>`SELECT * FROM reports WHERE id=${id}`; const report=rows[0]; if(!report) fail(404,'NOT_FOUND');
    const claims=await db<Row[]>`SELECT * FROM approved_resolution_evidence WHERE report_id=${id} ORDER BY approved_at,id`;
    const assets=await db<Row[]>`SELECT a.media_id,a.rendition_id,a.subject_type,a.subject_id,array_agg(a.channel ORDER BY a.channel) AS channels
      FROM media_publication_approvals a JOIN evidence_renditions er ON er.id=a.rendition_id JOIN media_consents mc ON mc.media_id=a.media_id JOIN media m ON m.id=a.media_id
      WHERE a.report_id=${id} AND a.approved AND er.status='ready' AND m.state='stored' AND m.deleted_at IS NULL AND a.channel=ANY(mc.channels)
        AND er.object_key IS NOT NULL AND er.media_id=a.media_id AND er.subject_type=a.subject_type AND er.subject_id=a.subject_id
        AND (
          (a.subject_type='report' AND a.subject_id=${id} AND EXISTS(SELECT 1 FROM report_media rm WHERE rm.report_id=${id} AND rm.media_id=m.id))
          OR (a.subject_type='community_update' AND EXISTS(SELECT 1 FROM community_updates cu JOIN evidence_links el ON el.subject_id=cu.id
            AND el.subject_type='community_update' AND el.media_id=m.id WHERE cu.id=a.subject_id AND cu.report_id=${id} AND cu.status='approved'))
          OR (a.subject_type='activity_result' AND EXISTS(SELECT 1 FROM activity_results ar JOIN evidence_links el ON el.subject_id=ar.id
            AND el.subject_type='activity_result' AND el.media_id=m.id WHERE ar.id=a.subject_id AND ar.report_id=${id} AND ar.status='approved'))
        )
      GROUP BY a.media_id,a.rendition_id,a.subject_type,a.subject_id ORDER BY a.media_id`;
    const milestones=await db<Row[]>`SELECT id,observed_at,public_summary,verified_outcome FROM activity_results WHERE report_id=${id} AND status='approved' ORDER BY approved_at,id`;
    const resolution=await db<Row[]>`SELECT id,created_at AS occurred_at FROM moderation_decisions WHERE report_id=${id}
      AND decision_payload->>'nextStatus'='resolved' ORDER BY created_at,id`;
    const publicAvailable=report.public_visibility==='public'&&eligibleStatuses.includes(report.status)&&!report.duplicate_of_id;
    const hasInstagram=assets.some(a=>(a.channels as string[]).includes('instagram'));
    const instagramEnabled=getConfig().SAP_INSTAGRAM_ENABLED;
    return {reportId:id,sourceRevision:report.revision,publicVisibility:report.public_visibility,instagramAllowed:report.instagram_allowed,
      latestReview:await this.reviews.latest('report',id,db),approvedResolutionEvidence:claims.map(this.claimDto),
      publicationAssets:assets.map(a=>({mediaId:a.media_id,renditionId:a.rendition_id,channels:a.channels,sourceType:a.subject_type,sourceId:a.subject_id})),
      publicationMilestones:[...milestones.map(m=>({id:m.id,type:'activity_result',observedAt:iso(m.observed_at),outcome:m.verified_outcome,summary:m.public_summary})),
        ...resolution.map(m=>({id:m.id,type:'report_resolution',observedAt:iso(m.occurred_at),outcome:'complete',summary:report.public_summary||'Penanganan selesai'}))],
      actions:{moderate:permission(true,'FORBIDDEN'),withdraw:permission(publicAvailable,'SOURCE_NOT_PUBLIC'),restore:permission(report.public_visibility==='withdrawn','INVALID_TRANSITION'),
        createInstagramDraft:permission(instagramEnabled&&publicAvailable&&Boolean(report.public_summary)&&report.instagram_allowed&&hasInstagram,
          !instagramEnabled?'FEATURE_UNAVAILABLE':!publicAvailable||!report.public_summary?'SOURCE_NOT_PUBLIC':!report.instagram_allowed?'INSTAGRAM_WITHDRAWN':'INSTAGRAM_EVIDENCE_REQUIRED')} };
  }

  /** Transactional account-based limits; an IP is never treated as a unique person. */
  private async rateLimit(tx: Tx, actorId: string, action: string, max: number): Promise<void> {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`community-rate:${actorId}:${action}`},0))`;
    const rows=await tx<Row[]>`SELECT count(*)::integer AS n FROM audit_events WHERE actor_id=${actorId} AND action=${`community.rate.${action}`} AND created_at>now()-interval '1 minute'`;
    if((rows[0]?.n??0)>=max) throw new RateLimitException(60);
    await this.store.audit(tx,actorId,`community.rate.${action}`,'user',actorId,{});
  }
}
