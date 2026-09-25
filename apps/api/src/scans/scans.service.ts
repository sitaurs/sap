import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { MediaRepository } from '../media/media.repository.js';
import { evaluateRateLimit, RateLimitException, SCAN_RATE_LIMIT } from '../platform/http/rate-limit.js';
import { ScanRepository } from './scan.repository.js';
import { ScanQueueService } from './scan-queue.service.js';
import { toScanView, type ScanView } from './scan.types.js';

export const SCANS_ROUTE = 'POST /scans';
export const DEFAULT_SCAN_PAGE = 20;

export interface ScanPageView {
  items: ScanView[];
  nextCursor: string | null;
}

@Injectable()
export class ScansService {
  constructor(
    private readonly scans: ScanRepository,
    private readonly media: MediaRepository,
    private readonly queue: ScanQueueService,
  ) {}

  async createScan(userId: string, input: { mediaId: string }, idempotencyKey: string): Promise<ScanView> {
    await this.enforceRateLimit(userId);

    // Ownership gate: unknown or someone else's media is indistinguishable -> 404.
    const media = await this.media.findStoredForOwner(input.mediaId, userId);
    if (!media) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Media tidak ditemukan.' });
    }

    const requestHash = createHash('sha256').update(JSON.stringify({ mediaId: input.mediaId })).digest('hex');
    const { view, replayed } = await this.scans.createQueuedIdempotent({
      userId,
      mediaId: input.mediaId,
      actorScope: `user:${userId}`,
      route: SCANS_ROUTE,
      key: idempotencyKey,
      requestHash,
      toView: toScanView,
    });

    // Enqueue only for a fresh reservation; a replayed create must not double-queue.
    if (!replayed) await this.queue.enqueueScan(view.id);
    return view;
  }

  async getScan(userId: string, scanId: string): Promise<ScanView> {
    const record = await this.scans.findByIdForOwner(scanId, userId);
    if (!record) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Scan tidak ditemukan.' });
    }
    return toScanView(record);
  }

  async listScans(userId: string, limit: number | undefined, cursor: string | undefined): Promise<ScanPageView> {
    const pageSize = limit ?? DEFAULT_SCAN_PAGE;
    // Fetch one extra row to determine whether another page exists.
    const records = await this.scans.listByOwner(userId, pageSize + 1, cursor ?? null);
    const page = records.slice(0, pageSize);
    const nextCursor = records.length > pageSize ? page[page.length - 1]!.id : null;
    return { items: page.map(toScanView), nextCursor };
  }

  /** Baseline: 10 scans/hour/account (TECH_SPEC §). 429 + Retry-After when exceeded. */
  private async enforceRateLimit(userId: string): Promise<void> {
    const now = Date.now();
    const state = await this.scans.countRecentForUser(userId, new Date(now - SCAN_RATE_LIMIT.windowMs));
    const decision = evaluateRateLimit(state, SCAN_RATE_LIMIT, now);
    if (!decision.allowed) throw new RateLimitException(decision.retryAfterSeconds);
  }
}
