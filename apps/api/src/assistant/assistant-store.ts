import { Injectable, Logger } from '@nestjs/common';
import { getConfig, type AppConfig } from '@sap/config';
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { evaluateRateLimit, SAPA_CHAT_RATE_LIMIT } from '../platform/http/rate-limit.js';
import { CONVERSATION_TTL_SECONDS, HISTORY_MAX_MESSAGES, type ChatMessage } from './assistant.types.js';

/**
 * Redis-backed conversation memory + per-account rate limiter for SAPA. This is
 * the ONLY place SAPA transcripts live — they are never written to Postgres and
 * expire after 30 minutes of inactivity. The Redis connection is created lazily
 * on first use and skipped entirely in `test`, matching ScanQueueService, so
 * offline unit tests open no socket.
 *
 * Keys are namespaced by userId so a conversationId belonging to another account
 * can never resolve — ownership is enforced by the key, not a stored field.
 */
@Injectable()
export class AssistantStore {
  private readonly logger = new Logger(AssistantStore.name);
  private readonly config: AppConfig = getConfig();
  private client: Redis | null = null;

  private conversationKey(userId: string, conversationId: string): string {
    return `sapa:conv:${userId}:${conversationId}`;
  }

  private rateKey(userId: string, windowStart: number): string {
    return `sapa:rate:${userId}:${windowStart}`;
  }

  newConversationId(): string {
    return randomUUID();
  }

  /** Fetch stored turns for a conversation, or null when it does not exist. */
  async getConversation(userId: string, conversationId: string): Promise<ChatMessage[] | null> {
    const redis = this.getClient();
    if (!redis) return null;
    const raw = await redis.get(this.conversationKey(userId, conversationId));
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
    } catch {
      return [];
    }
  }

  /**
   * Append the user turn and assistant reply, keep only the most recent
   * HISTORY_MAX_MESSAGES turns, and refresh the 30-minute TTL. Creating a new
   * conversation is just an append to an absent key.
   */
  async appendTurn(
    userId: string,
    conversationId: string,
    userMessage: string,
    assistantReply: string,
    existing: ChatMessage[] | null,
  ): Promise<void> {
    const redis = this.getClient();
    if (!redis) return;
    const history = existing ?? [];
    const combined: ChatMessage[] = [
      ...history,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: assistantReply },
    ];
    const next = combined.slice(-HISTORY_MAX_MESSAGES);
    await redis.set(
      this.conversationKey(userId, conversationId),
      JSON.stringify(next),
      'EX',
      CONVERSATION_TTL_SECONDS,
    );
  }

  /** Delete a conversation. Returns true when a transcript was actually removed. */
  async deleteConversation(userId: string, conversationId: string): Promise<boolean> {
    const redis = this.getClient();
    if (!redis) return false;
    const removed = await redis.del(this.conversationKey(userId, conversationId));
    return removed > 0;
  }

  /**
   * Per-account, per-minute quota using a fixed window counter. Returns the same
   * decision shape as evaluateRateLimit so the service can raise 429 + Retry-After.
   */
  async checkRateLimit(userId: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const redis = this.getClient();
    if (!redis) return { allowed: true, retryAfterSeconds: 0 };
    const now = Date.now();
    const windowStart = Math.floor(now / SAPA_CHAT_RATE_LIMIT.windowMs) * SAPA_CHAT_RATE_LIMIT.windowMs;
    const key = this.rateKey(userId, windowStart);
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pexpire(key, SAPA_CHAT_RATE_LIMIT.windowMs);
    }
    // Evaluate against the count *before* this request to mirror sliding helpers.
    return evaluateRateLimit({ count: count - 1, oldestAt: new Date(windowStart) }, SAPA_CHAT_RATE_LIMIT, now);
  }

  private getClient(): Redis | null {
    if (this.config.NODE_ENV === 'test') return null;
    if (this.client) return this.client;
    this.client = new Redis(this.config.REDIS_URL, { maxRetriesPerRequest: null });
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) await this.client.quit();
  }
}
