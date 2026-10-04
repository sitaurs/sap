import type { ScanDelivery, ScanRepository } from './scan-repository.js';

export const SCAN_JOB = 'scan.process';

export interface ScanQueuePublisher {
  getJob(jobId: string): Promise<ScanQueueJob | undefined | null>;
  add(
    name: string,
    data: { scanId: string },
    options: { jobId: string; removeOnComplete: boolean; removeOnFail: boolean },
  ): Promise<unknown>;
}

export interface ScanQueueJob {
  getState(): Promise<string>;
}

export interface ScanOutboxRepository {
  claimOutboxBatch(limit?: number): Promise<ScanDelivery[]>;
  markOutboxEnqueued(delivery: ScanDelivery): Promise<void>;
  advanceOutboxGeneration(delivery: ScanDelivery): Promise<ScanDelivery | null>;
  releaseOutbox(delivery: ScanDelivery, delayMs?: number): Promise<void>;
}

export interface ScanOutboxLogger {
  error(message: string, context: Record<string, unknown>): void;
}

/**
 * Deliver one durable batch into BullMQ. Before adding, inspect the deterministic
 * job id: live queued/active jobs are only deferred, terminal jobs get a fresh
 * fenced generation, and missing jobs are safely re-added with the same id. This
 * also closes the ambiguous crash window where Redis accepted a job but the
 * relay died before marking the outbox row enqueued.
 */
export async function drainScanOutboxOnce(
  repo: Pick<ScanRepository, 'claimOutboxBatch' | 'markOutboxEnqueued' | 'advanceOutboxGeneration' | 'releaseOutbox'> | ScanOutboxRepository,
  queue: ScanQueuePublisher,
  logger: ScanOutboxLogger,
  batchSize?: number,
): Promise<number> {
  const deliveries = await repo.claimOutboxBatch(batchSize);
  for (const delivery of deliveries) {
    let reservedDelivery = delivery;
    try {
      const existing = await queue.getJob(jobId(delivery));
      const state = existing ? await existing.getState() : 'missing';
      const isTerminal = state === 'failed' || state === 'completed';
      const activeProcessingExpired = state === 'active' && delivery.scanStatus === 'processing';

      if (isTerminal || activeProcessingExpired) {
        const replacement = await repo.advanceOutboxGeneration(delivery);
        if (!replacement) continue;
        reservedDelivery = replacement;
      } else if (existing && state !== 'unknown') {
        // waiting, delayed, paused, active-for-a-queued-scan, and other BullMQ
        // non-terminal states already represent the durable delivery.
        await repo.markOutboxEnqueued(delivery);
        continue;
      }

      await queue.add(
        SCAN_JOB,
        { scanId: reservedDelivery.scanId },
        {
          jobId: jobId(reservedDelivery),
          removeOnComplete: true,
          removeOnFail: false,
        },
      );
      // A fast worker may already have marked this outbox row processed; the
      // repository conditionally updates only the matching dispatch reservation.
      await repo.markOutboxEnqueued(reservedDelivery);
    } catch (error) {
      try {
        await repo.releaseOutbox(reservedDelivery);
      } catch (releaseError) {
        logger.error('scan_outbox_release_error', {
          scanId: delivery.scanId,
          generation: reservedDelivery.generation,
          message: releaseError instanceof Error ? releaseError.message : 'unknown',
        });
      }
      logger.error('scan_outbox_enqueue_error', {
        scanId: delivery.scanId,
        generation: reservedDelivery.generation,
        message: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
  return deliveries.length;
}

function jobId(delivery: ScanDelivery): string {
  return `scan-${delivery.scanId}-${delivery.generation}`;
}
