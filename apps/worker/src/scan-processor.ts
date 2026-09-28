import { resolveClassification } from './hybrid.js';
import { classifyError, mapPrediction, type AdapterResult, type MlAdapter } from './ml-adapter.js';
import type { ObjectStore } from './object-store.js';
import type { ScanRepository } from './scan-repository.js';
import type { ScanSettingsRepository } from './scan-settings-repository.js';
import type { VisionClient } from './vision-client.js';

/**
 * Executes one scan job end-to-end. Guarantees:
 * - a scan already terminal (or unknown) is never reopened (late-result safety);
 * - only media in `stored` state is inferred;
 * - any provider failure is recorded as a domain errorCode, never coerced into a
 *   successful outcome.
 *
 * When a settings repository (and vision client) are supplied, classification
 * follows the hybrid policy (HYBRID_SCAN_DETECTION.md): a low-confidence or
 * unknown ML result may be escalated to a vision LLM. Without them it falls back
 * to plain ML classification.
 */
export class ScanProcessor {
  constructor(
    private readonly repo: ScanRepository,
    private readonly store: ObjectStore,
    private readonly adapter: MlAdapter,
    private readonly visionClient?: VisionClient,
    private readonly settingsRepo?: ScanSettingsRepository,
  ) {}

  async process(scanId: string): Promise<void> {
    const context = await this.repo.loadContext(scanId);
    if (!context) return;
    if (context.status === 'succeeded' || context.status === 'failed') return;
    if (context.mediaState !== 'stored') {
      await this.repo.completeFailed(scanId, 'MEDIA_INVALID');
      return;
    }

    // Claim the job; if it is not queued anymore another worker owns it.
    const claimed = await this.repo.markProcessing(scanId);
    if (!claimed) return;

    let bytes: Buffer;
    try {
      bytes = await this.store.getObject(context.objectKey);
    } catch {
      await this.repo.completeFailed(scanId, 'MEDIA_INVALID');
      return;
    }

    try {
      const result = await this.classify(bytes);
      await this.repo.completeSucceeded(scanId, context.userId, context.sha256, result);
    } catch (error) {
      await this.repo.completeFailed(scanId, classifyError(error));
    }
  }

  /** Apply the hybrid policy when configured, else plain ML classification. */
  private async classify(bytes: Buffer): Promise<AdapterResult> {
    if (!this.settingsRepo) return this.adapter.classify(bytes);
    const settings = await this.settingsRepo.get();
    return resolveClassification(
      settings,
      () => this.adapter.classify(bytes),
      async (model) => {
        if (!this.visionClient) throw new Error('ML_UNAVAILABLE: vision client not wired');
        return { ...mapPrediction(await this.visionClient.classify(bytes, model)), providerRevision: null };
      },
    );
  }
}
