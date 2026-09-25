import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { TransactionSql } from 'postgres';
import { DATABASE, type Database } from './database.module.js';

/** Transaction handle passed into idempotency helpers (from `sql.begin`). */
export type Tx = TransactionSql;

/** Default replay window for idempotent mutations (API_SPEC §: "selama 24 jam"). */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

export interface IdempotencyReplay {
  statusCode: number;
  body: unknown;
}

/**
 * Shared helper for `Idempotency-Key` handling on create mutations (createScan,
 * createReport, ...). All methods take an explicit transaction handle so the
 * reservation, the domain write, and the stored response commit atomically —
 * there is never a persisted "reserved but no response" state visible to a
 * concurrent replay.
 *
 * Contract (API_SPEC): same key + same canonical payload replays the original
 * response; same key + different payload -> 409 IDEMPOTENCY_CONFLICT.
 */
@Injectable()
export class IdempotencyStore {
  constructor(@Inject(DATABASE) private readonly sql: Database) {}

  get db(): Database {
    return this.sql;
  }

  /**
   * Reserve the key inside `tx`. Returns null when the caller owns a fresh
   * reservation (must proceed and then call {@link storeResponse}), or an
   * {@link IdempotencyReplay} when a prior identical request already completed.
   */
  async reserve(
    tx: Tx,
    input: { actorScope: string; route: string; key: string; requestHash: string; ttlMs?: number },
  ): Promise<IdempotencyReplay | null> {
    const expiresAt = new Date(Date.now() + (input.ttlMs ?? IDEMPOTENCY_TTL_MS));
    const inserted = await tx<{ key: string }[]>`
      INSERT INTO idempotency_keys (actor_scope, route, key, request_hash, expires_at)
      VALUES (${input.actorScope}, ${input.route}, ${input.key}, ${input.requestHash}, ${expiresAt})
      ON CONFLICT (actor_scope, route, key) DO NOTHING
      RETURNING key`;
    if (inserted.length > 0) return null;

    const existing = await tx<{ request_hash: string; status_code: number | null; response_json: unknown }[]>`
      SELECT request_hash, status_code, response_json FROM idempotency_keys
      WHERE actor_scope = ${input.actorScope} AND route = ${input.route} AND key = ${input.key}
      LIMIT 1`;
    const row = existing[0];
    if (!row || row.request_hash !== input.requestHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Idempotency-Key sudah dipakai untuk permintaan yang berbeda.',
      });
    }
    return { statusCode: row.status_code ?? 200, body: row.response_json };
  }

  /** Persist the canonical response for a reservation created in this `tx`. */
  async storeResponse(
    tx: Tx,
    input: { actorScope: string; route: string; key: string; statusCode: number; body: unknown },
  ): Promise<void> {
    await tx`
      UPDATE idempotency_keys
      SET status_code = ${input.statusCode}, response_json = ${this.sql.json(input.body as never)}
      WHERE actor_scope = ${input.actorScope} AND route = ${input.route} AND key = ${input.key}`;
  }
}
