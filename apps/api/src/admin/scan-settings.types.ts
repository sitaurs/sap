/** The four hybrid detection strategies (HYBRID_SCAN_DETECTION.md FR1). */
export const HYBRID_MODES = ['full_ml', 'unknown_only', 'unknown_plus_threshold', 'full_llm'] as const;
export type HybridMode = (typeof HYBRID_MODES)[number];
