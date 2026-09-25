import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../infrastructure/database.module.js';

export type MediaPurpose = 'scan' | 'report' | 'resolution';
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
  }): Promise<MediaRecord> {
    const rows = await this.sql<MediaRow[]>`
      INSERT INTO media (owner_id, purpose, object_key, mime, size_bytes, sha256, width, height, state, expires_at)
      VALUES (
        ${input.ownerId}, ${input.purpose}, ${input.objectKey}, ${input.mime}, ${input.sizeBytes},
        ${input.sha256}, ${input.width}, ${input.height}, 'stored', ${input.expiresAt}
      )
      RETURNING ${this.sql.unsafe(COLUMNS)}`;
    return mapMedia(rows[0]!);
  }

  /** Fetch a stored object owned by `ownerId`; returns null so callers can 404 non-owners. */
  async findStoredForOwner(mediaId: string, ownerId: string): Promise<MediaRecord | null> {
    const rows = await this.sql<MediaRow[]>`
      SELECT ${this.sql.unsafe(COLUMNS)} FROM media
      WHERE id = ${mediaId} AND owner_id = ${ownerId} AND state = 'stored' AND deleted_at IS NULL
      LIMIT 1`;
    return rows[0] ? mapMedia(rows[0]) : null;
  }
}
