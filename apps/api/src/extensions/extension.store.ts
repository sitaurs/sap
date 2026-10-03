import { Inject, Injectable, HttpException } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { getConfig } from '@sap/config';
import { DATABASE, type Database } from '../infrastructure/database.module.js';
import { IdempotencyStore, type Tx } from '../infrastructure/idempotency.store.js';
import type { AuthenticatedUser } from '../platform/http/request-context.js';

export type Actor = AuthenticatedUser;
export type Executor = Database | Tx;
export type SubjectType = 'report' | 'community_update' | 'activity_result';
export type PublicationEvidence = { mediaId: string; renditionId: string; channels: ('web'|'instagram')[] };
export function fail(status: number, code: string, message = 'Permintaan tidak dapat diproses.'): never {
  throw new HttpException({ code, message }, status);
}
export function requireVerified(actor: Actor): void {
  if (!actor.emailVerified) fail(403, 'EMAIL_NOT_VERIFIED', 'Verifikasi email diperlukan.');
}
export function requireAdmin(actor: Actor): void {
  if (actor.role !== 'admin') fail(403, 'FORBIDDEN');
}
export function requireFeature(feature: 'community'|'activities'|'instagram'|'hermes'|'evidence'): void {
  const config = getConfig();
  const enabled = feature === 'evidence' || (feature === 'community' ? config.SAP_COMMUNITY_ENABLED :
    feature === 'activities' ? config.SAP_ACTIVITIES_ENABLED : feature === 'hermes' ? config.SAP_HERMES_ENABLED : config.SAP_INSTAGRAM_ENABLED);
  if (!config.SAP_EXTENSION_ENABLED || !enabled) fail(503,'FEATURE_UNAVAILABLE','Fitur belum diaktifkan.');
}
export function permission(allowed: boolean, reasonCode: string): { allowed: boolean; reasonCode: string|null } {
  return { allowed, reasonCode: allowed ? null : reasonCode };
}
export function iso(value: Date|string|null): string|null { return value === null ? null : new Date(value).toISOString(); }
export function hash(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => JSON.stringify(k)+':'+canonical(v)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}

@Injectable()
export class ExtensionStore {
  constructor(@Inject(DATABASE) readonly db: Database, private readonly idempotency: IdempotencyStore) {}

  async mutate<T>(actor: Actor, route: string, key: string, payload: unknown, work: (tx: Tx) => Promise<T>, status = 200): Promise<T> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key ?? '')) fail(400, 'VALIDATION_ERROR', 'Idempotency-Key UUID diperlukan.');
    const result = await this.db.begin(async tx => {
      const reservation = { actorScope: `user:${actor.id}`, route, key, requestHash: hash(payload) };
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.id}:${route}:${key}`}, 0))`;
      const replay = await this.idempotency.reserve(tx, reservation);
      if (replay) return replay.body as T;
      const body = await work(tx);
      await this.idempotency.storeResponse(tx, { ...reservation, statusCode: status, body });
      return body;
    });
    return result as T;
  }

  async event(tx: Tx, topic: string, aggregateId: string, revision: number, payload: Record<string, unknown> = {}): Promise<void> {
    await tx`INSERT INTO outbox_events(topic, aggregate_id, payload_minimal, dedup_key)
      VALUES(${topic}, ${aggregateId}, ${tx.json({ ...payload, aggregateRevision: revision } as never)}, ${`${topic}:${aggregateId}:${revision}`})
      ON CONFLICT(dedup_key) DO NOTHING`;
  }

  async audit(tx: Tx, actorId: string, action: string, type: string, id: string, changes: unknown): Promise<void> {
    await tx`INSERT INTO audit_events(actor_id, action, target_type, target_id, changes_redacted)
      VALUES(${actorId}, ${action}, ${type}, ${id}, ${tx.json(changes as never)})`;
  }

  async attachMedia(tx: Tx, actorId: string, subjectType: SubjectType, subjectId: string, mediaIds: string[], purpose: string): Promise<void> {
    if (mediaIds.length === 0) return;
    const rows = await tx<{ id: string }[]>`SELECT id FROM media WHERE id = ANY(${mediaIds}::uuid[])
      AND owner_id = ${actorId} AND purpose = ${purpose} AND state = 'stored' AND deleted_at IS NULL ORDER BY id FOR UPDATE`;
    if (rows.length !== new Set(mediaIds).size) fail(422, 'EVIDENCE_INVALID', 'Bukti harus dimiliki pengunggah dan sesuai tujuan.');
    for (const id of mediaIds) await tx`INSERT INTO evidence_links(subject_type, subject_id, media_id)
      VALUES(${subjectType}, ${subjectId}, ${id}) ON CONFLICT DO NOTHING`;
    await tx`UPDATE media SET expires_at = NULL WHERE id = ANY(${mediaIds}::uuid[])`;
  }

  async approveEvidence(tx: Tx, subjectType: SubjectType, subjectId: string, reportId: string, actorId: string, inputs: PublicationEvidence[]): Promise<void> {
    if (new Set(inputs.map(input => input.mediaId)).size !== inputs.length) fail(400, 'VALIDATION_ERROR');
    const mediaIds = inputs.map(input => input.mediaId);
    if (mediaIds.length) await tx`SELECT id FROM media WHERE id=ANY(${mediaIds}::uuid[]) ORDER BY id FOR UPDATE`;
    for (const input of inputs) {
      if (input.channels.length === 0 || new Set(input.channels).size !== input.channels.length || input.channels.some(channel => !['web','instagram'].includes(channel))) fail(400,'VALIDATION_ERROR');
      const attached = subjectType === 'report' ? await tx`SELECT media_id FROM report_media WHERE report_id=${subjectId} AND media_id=${input.mediaId}` :
        await tx`SELECT media_id FROM evidence_links WHERE subject_type=${subjectType} AND subject_id=${subjectId} AND media_id=${input.mediaId}`;
      if (!attached.length) fail(422,'EVIDENCE_INVALID','Bukti tidak lagi terlampir pada subjek.');
      const rows = await tx<{ id: string; object_key: string }[]>`SELECT er.id, er.object_key FROM evidence_renditions er
        JOIN media m ON m.id = er.media_id
        WHERE er.id = ${input.renditionId} AND er.media_id = ${input.mediaId} AND er.status = 'ready'
          AND er.subject_type = ${subjectType} AND er.subject_id = ${subjectId}
          AND m.state = 'stored' AND m.deleted_at IS NULL FOR SHARE OF m, er`;
      if (!rows[0]) fail(422, 'EVIDENCE_INVALID', 'Rendition bukti belum siap atau tidak sesuai subjek.');
      for (const channel of input.channels) {
        const grants = await tx`SELECT media_id FROM media_consents WHERE media_id = ${input.mediaId} AND ${channel} = ANY(channels) FOR SHARE`;
        if (!grants.length) fail(422, 'EVIDENCE_INVALID', 'Persetujuan pemilik foto untuk kanal ini belum tersedia.');
        await tx`INSERT INTO media_publication_approvals(report_id,subject_type,subject_id,media_id,rendition_id,channel,actor_id,approved)
          VALUES(${reportId},${subjectType},${subjectId},${input.mediaId},${input.renditionId},${channel},${actorId},true)
          ON CONFLICT(report_id,media_id,channel) DO UPDATE SET rendition_id=EXCLUDED.rendition_id,
            subject_type=EXCLUDED.subject_type,subject_id=EXCLUDED.subject_id,actor_id=EXCLUDED.actor_id,approved=true,updated_at=now()`;
        if (channel === 'web') await tx`UPDATE media SET public_derivative_key = ${rows[0].object_key} WHERE id = ${input.mediaId}`;
      }
    }
  }

  cursor(query: Record<string, unknown>, scope: unknown): { limit: number; boundary: { id: string; at: string }|null; encode: (row: {id:string;created_at:Date|string})=>string } {
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) fail(400, 'VALIDATION_ERROR');
    const scopeHash = hash(scope);
    const sign = (s: string) => createHmac('sha256', getConfig().SESSION_SECRET).update(s).digest('base64url');
    let boundary: { id: string; at: string }|null = null;
    if (query.cursor !== undefined) {
      try {
        if (typeof query.cursor !== 'string' || query.cursor.length > 1024) throw new Error();
        const [encoded,signature] = query.cursor.split('.');
        if (!encoded || sign(encoded) !== signature) throw new Error();
        const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as { id:string;at:string;scope:string };
        if (decoded.scope !== scopeHash || !/^[0-9a-f-]{36}$/i.test(decoded.id) || !Number.isFinite(Date.parse(decoded.at))) throw new Error();
        boundary = { id:decoded.id, at:decoded.at };
      } catch { fail(400, 'INVALID_CURSOR'); }
    }
    return { limit, boundary, encode: row => {
      const encoded = Buffer.from(JSON.stringify({ id:row.id,at:iso(row.created_at),scope:scopeHash })).toString('base64url');
      return `${encoded}.${sign(encoded)}`;
    } };
  }
}
