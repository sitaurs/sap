import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../infrastructure/database.module.js';
import type { HybridMode } from './scan-settings.types.js';

/** OpenAPI `ScanSettings` — the runtime hybrid detection configuration. */
export interface ScanSettingsView {
  mode: HybridMode;
  confidenceThreshold: number;
  visionEnabled: boolean;
  visionModel: string;
  updatedAt: string;
}

/** A partial update; only provided fields change (PUT with COALESCE semantics). */
export interface ScanSettingsPatch {
  mode?: HybridMode;
  confidenceThreshold?: number;
  visionEnabled?: boolean;
  visionModel?: string;
}

interface Row {
  mode: string;
  confidence_threshold: string;
  vision_enabled: boolean;
  vision_model: string;
  updated_at: Date;
}

const toView = (row: Row): ScanSettingsView => ({
  mode: row.mode as HybridMode,
  confidenceThreshold: Number(row.confidence_threshold),
  visionEnabled: row.vision_enabled,
  visionModel: row.vision_model,
  updatedAt: row.updated_at.toISOString(),
});

const SELECT_COLUMNS = 'mode, confidence_threshold, vision_enabled, vision_model, updated_at';

@Injectable()
export class ScanSettingsRepository {
  constructor(@Inject(DATABASE) private readonly sql: Database) {}

  /** Read the singleton, materialising it from table defaults if it does not exist yet. */
  async get(): Promise<ScanSettingsView> {
    await this.sql`INSERT INTO scan_settings (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING`;
    const rows = await this.sql<Row[]>`
      SELECT ${this.sql.unsafe(SELECT_COLUMNS)} FROM scan_settings WHERE id = 'singleton' LIMIT 1`;
    return toView(rows[0]!);
  }

  /**
   * Apply a partial update and record an audit event in one transaction. Only the
   * fields actually changed are written to `changes_redacted`; a no-op patch still
   * returns the current view but writes no audit row.
   */
  async update(
    actorId: string,
    requestId: string | null,
    patch: ScanSettingsPatch,
  ): Promise<ScanSettingsView> {
    return this.sql.begin(async (tx) => {
      await tx`INSERT INTO scan_settings (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING`;
      const before = (
        await tx<Row[]>`SELECT ${tx.unsafe(SELECT_COLUMNS)} FROM scan_settings WHERE id = 'singleton' FOR UPDATE`
      )[0]!;

      const rows = await tx<Row[]>`
        UPDATE scan_settings SET
          mode = COALESCE(${patch.mode ?? null}, mode),
          confidence_threshold = COALESCE(${patch.confidenceThreshold ?? null}, confidence_threshold),
          vision_enabled = COALESCE(${patch.visionEnabled ?? null}, vision_enabled),
          vision_model = COALESCE(${patch.visionModel ?? null}, vision_model),
          updated_at = now(),
          updated_by = ${actorId}
        WHERE id = 'singleton'
        RETURNING ${tx.unsafe(SELECT_COLUMNS)}`;
      const after = rows[0]!;

      const changes = diffChanges(before, after);
      if (Object.keys(changes).length > 0) {
        await tx`
          INSERT INTO audit_events (actor_id, action, target_type, target_id, changes_redacted, request_id)
          VALUES (${actorId}, 'scan_settings.update', 'scan_settings', 'singleton',
                  ${tx.json(changes as never)}, ${requestId})`;
      }
      return toView(after);
    });
  }
}

/** Field-level before/after diff for the audit trail (numbers normalised). */
function diffChanges(before: Row, after: Row): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (before.mode !== after.mode) changes.mode = { from: before.mode, to: after.mode };
  if (Number(before.confidence_threshold) !== Number(after.confidence_threshold)) {
    changes.confidenceThreshold = { from: Number(before.confidence_threshold), to: Number(after.confidence_threshold) };
  }
  if (before.vision_enabled !== after.vision_enabled) {
    changes.visionEnabled = { from: before.vision_enabled, to: after.vision_enabled };
  }
  if (before.vision_model !== after.vision_model) {
    changes.visionModel = { from: before.vision_model, to: after.vision_model };
  }
  return changes;
}
