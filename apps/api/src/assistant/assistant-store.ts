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

  private conversationLockKey(userId: string, conversationId: string): string {
    return `sapa:conv-lock:${userId}:${conversationId}`;
  }

  private rateKey(userId: string, windowStart: number): string {
    return `sapa:rate:${userId}:${windowStart}`;
  }

  newConversationId(): string {
    return randomUUID();
  }

  /**
   * Acquire a short, fenced lease before reading transcript history or calling
   * the model. A competing turn gets a bounded 409 instead of paying for a
   * second model call with stale context. The token is checked again by every
   * write, so work that outlives this lease can never overwrite a newer turn.
   */
  async acquireConversation(userId: string, conversationId: string): Promise<string | null> {
    const redis = this.getClient();
    // Preserve socket-free unit tests; production always has a Redis client.
    if (!redis) return `test:${randomUUID()}`;
    const token = randomUUID();
    const acquired = await tryAcquireConversationLock(
      redis,
      this.conversationLockKey(userId, conversationId),
      token,
      CONVERSATION_LOCK_TTL_MS,
    );
    return acquired ? token : null;
  }

  async releaseConversation(userId: string, conversationId: string, token: string): Promise<void> {
    const redis = this.getClient();
    if (!redis) return;
    await releaseConversationLock(redis, this.conversationLockKey(userId, conversationId), token);
  }

  async renewConversation(userId: string, conversationId: string, token: string): Promise<boolean> {
    const redis = this.getClient();
    if (!redis) return true;
    return renewConversationLock(
      redis,
      this.conversationLockKey(userId, conversationId),
      token,
      CONVERSATION_LOCK_TTL_MS,
    );
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
    lockToken: string,
    allowCreate: boolean,
  ): Promise<'appended' | 'lock_lost' | 'conversation_missing'> {
    const redis = this.getClient();
    if (!redis) return 'appended';
    const result = await appendConversationTurn(
      redis,
      this.conversationKey(userId, conversationId),
      this.conversationLockKey(userId, conversationId),
      lockToken,
      userMessage,
      assistantReply,
      HISTORY_MAX_MESSAGES,
      CONVERSATION_TTL_SECONDS,
      allowCreate,
    );
    if (result === 1) return 'appended';
    if (result === -2) return 'conversation_missing';
    return 'lock_lost';
  }

  /** Delete under the same fence used by chat; distinguish a busy lock from 404. */
  async deleteConversation(
    userId: string,
    conversationId: string,
    lockToken: string,
  ): Promise<'deleted' | 'not_found' | 'lock_lost'> {
    const redis = this.getClient();
    if (!redis) return 'not_found';
    const result = await deleteConversationWithLock(
      redis,
      this.conversationKey(userId, conversationId),
      this.conversationLockKey(userId, conversationId),
      lockToken,
    );
    if (result === 1) return 'deleted';
    if (result === -1) return 'lock_lost';
    return 'not_found';
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
    const count = await incrementRateLimitCounter(redis, key, SAPA_CHAT_RATE_LIMIT.windowMs);
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

/** Long enough to cover the service's 20s model deadline plus local work. */
export const CONVERSATION_LOCK_TTL_MS = 30_000;

export const ACQUIRE_CONVERSATION_LOCK_SCRIPT = `
if redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX') then
  return 1
end
return 0
`;

export const RELEASE_CONVERSATION_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export const RENEW_CONVERSATION_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

/**
 * Fenced append. Read, append, trim, and TTL refresh are one Redis operation;
 * callers cannot commit from a transcript snapshot captured before another
 * turn. Existing conversations are never recreated after deletion/expiry.
 */
export const APPEND_CONVERSATION_TURN_SCRIPT = `
if redis.call('GET', KEYS[2]) ~= ARGV[1] then
  return -1
end
local raw = redis.call('GET', KEYS[1])
if (not raw) and ARGV[6] ~= '1' then
  return -2
end
local messages = {}
if raw then
  local ok, decoded = pcall(cjson.decode, raw)
  if ok and type(decoded) == 'table' then
    local isArray = true
    for key, _ in pairs(decoded) do
      if type(key) ~= 'number' then isArray = false; break end
    end
    if isArray then messages = decoded end
  end
end
table.insert(messages, {role = 'user', content = ARGV[2]})
table.insert(messages, {role = 'assistant', content = ARGV[3]})
local maximum = tonumber(ARGV[4])
while #messages > maximum do table.remove(messages, 1) end
redis.call('SET', KEYS[1], cjson.encode(messages), 'EX', ARGV[5])
return 1
`;

/** Delete and unlock atomically; stale work is fenced out by the missing token. */
export const DELETE_CONVERSATION_WITH_LOCK_SCRIPT = `
if redis.call('GET', KEYS[2]) ~= ARGV[1] then
  return -1
end
local removed = redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[2])
return removed
`;

export async function tryAcquireConversationLock(
  redis: Redis,
  lockKey: string,
  token: string,
  ttlMs: number,
): Promise<boolean> {
  return (await redis.eval(ACQUIRE_CONVERSATION_LOCK_SCRIPT, 1, lockKey, token, ttlMs)) === 1;
}

export async function releaseConversationLock(redis: Redis, lockKey: string, token: string): Promise<void> {
  await redis.eval(RELEASE_CONVERSATION_LOCK_SCRIPT, 1, lockKey, token);
}

export async function renewConversationLock(
  redis: Redis,
  lockKey: string,
  token: string,
  ttlMs: number,
): Promise<boolean> {
  return (await redis.eval(RENEW_CONVERSATION_LOCK_SCRIPT, 1, lockKey, token, ttlMs)) === 1;
}

export async function appendConversationTurn(
  redis: Redis,
  conversationKey: string,
  lockKey: string,
  token: string,
  userMessage: string,
  assistantReply: string,
  maxMessages: number,
  ttlSeconds: number,
  allowCreate: boolean,
): Promise<number> {
  const result = await redis.eval(
    APPEND_CONVERSATION_TURN_SCRIPT,
    2,
    conversationKey,
    lockKey,
    token,
    userMessage,
    assistantReply,
    maxMessages,
    ttlSeconds,
    allowCreate ? '1' : '0',
  );
  return Number(result);
}

export async function deleteConversationWithLock(
  redis: Redis,
  conversationKey: string,
  lockKey: string,
  token: string,
): Promise<number> {
  return Number(await redis.eval(DELETE_CONVERSATION_WITH_LOCK_SCRIPT, 2, conversationKey, lockKey, token));
}

/**
 * Increment one fixed-window counter and make sure it expires in the same
 * Redis operation. `PTTL < 0` also repairs an existing key left over from the
 * old two-command implementation after a process crash. A positive TTL is
 * never refreshed, so traffic cannot slide/extend the configured window.
 */
export const INCREMENT_RATE_LIMIT_COUNTER_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

export async function incrementRateLimitCounter(redis: Redis, key: string, ttlMs: number): Promise<number> {
  const count = await redis.eval(INCREMENT_RATE_LIMIT_COUNTER_SCRIPT, 1, key, ttlMs);
  return Number(count);
}
