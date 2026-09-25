import type { DeletionProcessor } from './deletion-processor.js';
import type { MaintenanceRepository, SweepResult } from './maintenance-repository.js';
import type { ObjectStore } from './object-store.js';

const RETRY_BACKOFF_MS = 60_000;

/**
 * Drains one pending `account.deletion.requested` outbox event, if any, and runs
 * its deletion job. Returns true when an event was handled (so the caller can
 * poll again immediately) or false when the queue was empty. A failure marks the
 * request failed and re-queues the event with a backoff — never lost, never
 * double-completed.
 */
export async function drainOneDeletion(
  repo: MaintenanceRepository,
  processor: DeletionProcessor,
): Promise<boolean> {
  const event = await repo.claimDeletionEvent();
  if (!event) return false;
  try {
    await processor.process(event.deletionId, event.subjectHash);
    await repo.markOutboxDelivered(event.outboxId);
  } catch (error) {
    await repo.markDeletionFailed(event.deletionId, 'DELETION_FAILED');
    await repo.markOutboxRetry(event.outboxId, RETRY_BACKOFF_MS);
    console.error('deletion_failed', {
      deletionId: event.deletionId,
      message: error instanceof Error ? error.message : 'unknown',
    });
  }
  return true;
}

/**
 * Retention sweep: remove orphan-media R2 objects first, then delete expired
 * idempotency keys / area snapshots / tombstones and mark the orphan rows
 * deleted. R2 removal precedes the DB mutation for the same reason the deletion
 * job does it (bytes must never outlive their row).
 */
export async function runSweep(repo: MaintenanceRepository, store: ObjectStore): Promise<SweepResult> {
  const orphans = await repo.listOrphanMediaKeys();
  for (const orphan of orphans) {
    await store.deleteObject(orphan.objectKey);
  }
  return repo.sweepExpired();
}
