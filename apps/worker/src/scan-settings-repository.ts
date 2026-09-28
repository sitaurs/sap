import type { Sql } from 'postgres';
import type { HybridMode, ScanSettings } from './hybrid.js';

/** Safe defaults used when the row is missing or a read fails (NFR1: never block a scan). */
const DEFAULTS: ScanSettings = {
  mode: 'unknown_plus_threshold',
  confidenceThreshold: 0.6,
  visionEnabled: false,
  visionModel: 'sapa',
};

/**
 * Reads the `scan_settings` singleton with a short TTL cache so admin changes take
 * effect within a few seconds without restarting the worker (FR6), while a burst
 * of scans does not hammer the database. A read failure is swallowed: it returns
 * the last-known value (or defaults) so classification never blocks on settings.
 */
export class ScanSettingsRepository {
  private cache: ScanSettings | null = null;
  private fetchedAt = 0;

  constructor(
    private readonly sql: Sql,
    private readonly ttlMs = 5_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async get(): Promise<ScanSettings> {
    if (this.cache && this.now() - this.fetchedAt < this.ttlMs) return this.cache;
    try {
      const rows = await this.sql<
        { mode: string; confidence_threshold: string; vision_enabled: boolean; vision_model: string }[]
      >`
        SELECT mode, confidence_threshold, vision_enabled, vision_model
        FROM scan_settings WHERE id = 'singleton' LIMIT 1`;
      const row = rows[0];
      this.cache = row
        ? {
            mode: row.mode as HybridMode,
            confidenceThreshold: Number(row.confidence_threshold),
            visionEnabled: row.vision_enabled,
            visionModel: row.vision_model,
          }
        : DEFAULTS;
      this.fetchedAt = this.now();
      return this.cache;
    } catch {
      return this.cache ?? DEFAULTS;
    }
  }
}
