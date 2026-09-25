import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { getConfig } from '@sap/config';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

/** BullMQ queue + job names shared with the worker (apps/worker). */
export const JOBS_QUEUE = 'sap-jobs';
export const SCAN_JOB = 'scan.process';

/**
 * Producer for scan-processing jobs. The BullMQ queue (and its Redis
 * connection) is created lazily on first enqueue and never in `test`, so unit
 * tests and offline `npm run check` neither open a socket nor require a live
 * Redis. `jobId = scanId` makes re-enqueue of the same scan a no-op at the
 * queue level, complementing the DB idempotency reservation.
 */
@Injectable()
export class ScanQueueService {
  private readonly logger = new Logger(ScanQueueService.name);
  private readonly config = getConfig();
  private queue: Queue | null = null;
  private connection: Redis | null = null;

  async enqueueScan(scanId: string): Promise<void> {
    if (this.config.NODE_ENV === 'test') return;
    try {
      const queue = this.getQueue();
      await queue.add(SCAN_JOB, { scanId }, { jobId: scanId, removeOnComplete: true, removeOnFail: false });
    } catch (error) {
      this.logger.error(`failed to enqueue scan ${scanId}: ${(error as Error).message}`);
      throw new ServiceUnavailableException({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'Antrean pemrosesan tidak tersedia.',
      });
    }
  }

  private getQueue(): Queue {
    if (this.queue) return this.queue;
    this.connection = new Redis(this.config.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue(JOBS_QUEUE, { connection: this.connection });
    return this.queue;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) await this.queue.close();
    if (this.connection) await this.connection.quit();
  }
}
