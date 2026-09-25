import { classifyError, type MlAdapter } from './ml-adapter.js';
import type { ObjectStore } from './object-store.js';
import type { ScanRepository } from './scan-repository.js';

/**
 * Executes one scan job end-to-end. Guarantees:
 * - a scan already terminal (or unknown) is never reopened (late-result safety);
 * - only media in `stored` state is inferred;
 * - any provider failure is recorded as a domain errorCode, never coerced into a
 *   successful outcome.
 */
export class ScanProcessor {
  constructor(
    private readonly repo: ScanRepository,
    private readonly store: ObjectStore,
    private readonly adapter: MlAdapter,
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
      const result = await this.adapter.classify(bytes);
      await this.repo.completeSucceeded(scanId, context.userId, context.sha256, result);
    } catch (error) {
      await this.repo.completeFailed(scanId, classifyError(error));
    }
  }
}
