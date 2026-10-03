import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../infrastructure/database.module.js';
import { fail } from '../extensions/extension.store.js';

export type MediaPurpose = 'scan' | 'report' | 'resolution' | 'avatar' | 'community' | 'activity_evidence';
export type MediaMime = 'image/jpeg' | 'image/png' | 'image/webp';

/** Domain view of a stored media object (matches the OpenAPI `Media` schema). */
export interface MediaRecord {
  id: string;
  ownerId: string;
  purpose: MediaPurpose;
  objectKey: string;
  mime: MediaMime;
  sizeBytes: number;
  expiresAt: Date | null;
}

interface MediaRow {
  id: string;
  owner_id: string;
  purpose: MediaPurpose;
  object_key: string;
  mime: MediaMime;
  size_bytes: string; // bigint arrives as string over the wire
  expires_at: Date | null;
}

function mapMedia(row: MediaRow): MediaRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    purpose: row.purpose,
    objectKey: row.object_key,
    mime: row.mime,
    sizeBytes: Number(row.size_bytes),
    expiresAt: row.expires_at,
  };
}

const COLUMNS = 'id, owner_id, purpose, object_key, mime, size_bytes, expires_at';

@Injectable()
export class MediaRepository {
  constructor(@Inject(DATABASE) private readonly sql: Database) {}

  /** Persist a fully processed object as `stored`. `expiresAt` is the orphan TTL. */
  async createStored(input: {
    ownerId: string;
    purpose: MediaPurpose;
    objectKey: string;
    mime: MediaMime;
    sizeBytes: number;
    sha256: string;
    width: number;
    height: number;
    expiresAt: Date;
  }, state: 'pending'|'stored' = 'stored'): Promise<MediaRecord> {
    return this.sql.begin(async tx=>{
    const owner=await tx`SELECT id FROM users WHERE id=${input.ownerId} AND deleted_at IS NULL FOR SHARE`;
    if(!owner.length) fail(403,'ACCOUNT_INACTIVE','Akun tidak aktif.');
    const rows = await tx<MediaRow[]>`
      INSERT INTO media (owner_id, purpose, object_key, mime, size_bytes, sha256, width, height, state, expires_at)
      VALUES (
        ${input.ownerId}, ${input.purpose}, ${input.objectKey}, ${input.mime}, ${input.sizeBytes},
        ${input.sha256}, ${input.width}, ${input.height}, ${state}, ${input.expiresAt}
      )
      RETURNING ${tx.unsafe(COLUMNS)}`;
    return mapMedia(rows[0]!);
    }) as Promise<MediaRecord>;
  }

  async markStored(id:string,ownerId:string):Promise<MediaRecord|null> {
    return this.sql.begin(async tx=>{
      const owner=await tx`SELECT id FROM users WHERE id=${ownerId} AND deleted_at IS NULL FOR SHARE`;
      if(!owner.length)return null;
      const rows=await tx<MediaRow[]>`UPDATE media SET state='stored',updated_at=now()
        WHERE id=${id} AND owner_id=${ownerId} AND state='pending' AND deleted_at IS NULL RETURNING ${tx.unsafe(COLUMNS)}`;
      return rows[0]?mapMedia(rows[0]):null;
    }) as Promise<MediaRecord|null>;
  }

  async scheduleObjectCleanup(objectKey:string,mediaId:string):Promise<void> {
    const [schema]=await this.sql<{ready:boolean}[]>`SELECT to_regclass('media_cleanup_tasks') IS NOT NULL AS ready`;
    if(schema?.ready)await this.sql`INSERT INTO media_cleanup_tasks(object_key,media_id) VALUES(${objectKey},${mediaId})
      ON CONFLICT(object_key) DO UPDATE SET status='pending',revision=media_cleanup_tasks.revision+1,completed_at=NULL`;
    else await this.sql`UPDATE media SET expires_at=now(),updated_at=now() WHERE id=${mediaId}`;
  }

  /** Fetch a stored object owned by `ownerId`; returns null so callers can 404 non-owners. */
  async findStoredForOwner(mediaId: string, ownerId: string): Promise<MediaRecord | null> {
    const rows = await this.sql<MediaRow[]>`
      SELECT ${this.sql.unsafe(COLUMNS)} FROM media
      WHERE id = ${mediaId} AND owner_id = ${ownerId} AND state = 'stored' AND deleted_at IS NULL
      LIMIT 1`;
    return rows[0] ? mapMedia(rows[0]) : null;
  }

  /**
   * Clear the orphan TTL so a freshly uploaded object survives cleanup once it is
   * attached to something durable (e.g. an avatar). Scoped to the owner.
   */
  async clearExpiry(mediaId: string, ownerId: string): Promise<void> {
    await this.sql`
      UPDATE media SET expires_at = NULL, updated_at = now()
      WHERE id = ${mediaId} AND owner_id = ${ownerId} AND deleted_at IS NULL`;
  }

  /**
   * Re-arm the orphan TTL on an object that is no longer referenced (e.g. an
   * avatar that was just replaced), so the cleanup job reclaims it.
   */
  async scheduleExpiry(mediaId: string, ownerId: string, expiresAt: Date): Promise<void> {
    await this.sql`
      UPDATE media SET expires_at = ${expiresAt}, updated_at = now()
      WHERE id = ${mediaId} AND owner_id = ${ownerId} AND deleted_at IS NULL`;
  }
}
