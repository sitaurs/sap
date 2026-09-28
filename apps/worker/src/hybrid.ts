import type { AdapterResult } from './ml-adapter.js';

/** The four hybrid detection strategies (HYBRID_SCAN_DETECTION.md FR1). */
export type HybridMode = 'full_ml' | 'unknown_only' | 'unknown_plus_threshold' | 'full_llm';

/** Runtime scan settings, read from the `scan_settings` singleton row. */
export interface ScanSettings {
  mode: HybridMode;
  confidenceThreshold: number;
  visionEnabled: boolean;
  visionModel: string;
}

/** Top-1 confidence of an ML result (0 when there is no prediction). */
const topScore = (result: AdapterResult): number => result.predictions[0]?.score ?? 0;

/**
 * Decide whether the ML result is weak enough to warrant a vision-LLM second
 * opinion, given the configured mode. `full_ml` never escalates; `full_llm` is
 * handled before this function (ML is skipped entirely) so it also returns false.
 */
export function shouldUseVision(settings: ScanSettings, ml: AdapterResult): boolean {
  switch (settings.mode) {
    case 'unknown_only':
      return ml.outcome === 'unknown';
    case 'unknown_plus_threshold':
      return (
        ml.outcome === 'unknown' ||
        (ml.outcome === 'classified' && topScore(ml) < settings.confidenceThreshold)
      );
    default:
      return false;
  }
}

/**
 * Resolve the final classification for one image under the hybrid policy.
 *
 * Invariants (HYBRID_SCAN_DETECTION.md NFR1): a vision failure NEVER fails the
 * scan — it always falls back to the ML result (or a fresh ML call in full_llm
 * mode). The source is recorded in `providerRevision`:
 *   - `llm:<model>`         vision produced the answer
 *   - `llm_failed:<model>`  vision was attempted but ML answered instead
 *   - unchanged             plain ML (no vision involved)
 */
export async function resolveClassification(
  settings: ScanSettings,
  runMl: () => Promise<AdapterResult>,
  runVision: (model: string) => Promise<AdapterResult>,
): Promise<AdapterResult> {
  const tryVision = async (mlFallback: AdapterResult | null): Promise<AdapterResult> => {
    try {
      const vision = await runVision(settings.visionModel);
      return { ...vision, providerRevision: `llm:${settings.visionModel}` };
    } catch {
      const fallback = mlFallback ?? (await runMl());
      return { ...fallback, providerRevision: `llm_failed:${settings.visionModel}` };
    }
  };

  if (settings.mode === 'full_llm') {
    if (!settings.visionEnabled) return runMl();
    return tryVision(null);
  }

  const ml = await runMl();
  if (!settings.visionEnabled || !shouldUseVision(settings, ml)) return ml;
  return tryVision(ml);
}
