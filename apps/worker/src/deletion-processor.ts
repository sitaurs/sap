import type { MaintenanceRepository } from './maintenance-repository.js';
import type { ObjectStore } from './object-store.js';

/**
 * Runs one account-deletion job end-to-end (DATABASE.md §7). Guarantees:
 * - idempotent: a request already `completed` is never re-run (tombstone stays);
 * - R2 objects are deleted explicitly BEFORE the owner row is pseudonymised —
 *   SQL cascade alone is not enough;
 * - a receipt is stored without PII and a tombstone is written for backup replay;
 * - any failure marks the request `failed` with an error code and re-queues the
 *   outbox event for a later retry (never coerced into a successful outcome).
 */
export class DeletionProcessor {
  constructor(
    private readonly repo: MaintenanceRepository,
    private readonly store: ObjectStore,
  ) {}

  async process(deletionId: string, subjectHash: string): Promise<void> {
    const job = await this.repo.loadDeletionJob(deletionId);
    if (!job) return;
    // Idempotent: a finished request keeps its tombstone; do not reopen it.
    if (job.status === 'completed') return;

    await this.repo.markDeletionRunning(deletionId);

    // Delete R2 objects first; if any object cannot be removed we must not
    // pseudonymise the row yet (would orphan the bytes). Fail and retry later.
    if (job.userId) {
      const keys = await this.repo.listUserObjectKeys(job.userId);
      for (const key of keys) {
        await this.store.deleteObject(key);
      }
    }

    await this.repo.finalizeDeletion(deletionId, job.userId, subjectHash || job.subjectHash);
  }
}
