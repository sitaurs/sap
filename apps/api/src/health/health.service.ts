import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { getConfig } from '@sap/config';
import { Redis } from 'ioredis';
import { createPostgresClient } from '../infrastructure/postgres.js';

export type DependencyState = 'ok' | 'unavailable';

export interface ReadinessResult {
  status: 'ok' | 'degraded';
  /** The API can safely serve its DB-backed read traffic while auxiliary services recover. */
  ready: boolean;
  dependencies: {
    database: DependencyState;
    redis: DependencyState;
    objectStorage: DependencyState;
  };
  contractVersion: string;
}

export interface RedisHealthClient {
  status: string;
  connect(): Promise<unknown>;
  ping(): Promise<string>;
  disconnect(): unknown;
}

/** A race timeout also interrupts the underlying operation when the caller can cancel it. */
export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void = () => undefined,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          try {
            onTimeout();
          } finally {
            reject(new Error('Dependency health check timed out'));
          }
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function summarizeReadiness(
  dependencies: ReadinessResult['dependencies'],
  contractVersion: string,
): ReadinessResult {
  const ready = dependencies.database === 'ok';
  const status = Object.values(dependencies).every((dependency) => dependency === 'ok') ? 'ok' : 'degraded';
  return { status, ready, dependencies, contractVersion };
}

/** Probe one bounded connection attempt; an `end` client is explicitly reconnected on a later probe. */
export async function probeRedisHealth(client: RedisHealthClient, timeoutMs = 3_000): Promise<DependencyState> {
  try {
    const ping = (async () => {
      if (client.status === 'wait' || client.status === 'end' || client.status === 'close') {
        await client.connect();
      }
      return client.ping();
    })();
    await withTimeout(ping, timeoutMs, () => { client.disconnect(); });
    return 'ok';
  } catch {
    return 'unavailable';
  }
}

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly config = getConfig();
  private readonly sql = createPostgresClient(this.config.DATABASE_URL, 2);
  private readonly redis = new Redis(this.config.REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 3_000,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    // Health probes should make one bounded connection attempt. A later probe
    // can explicitly reconnect after this client reaches `end`.
    retryStrategy: () => null,
  });
  private readonly s3 = new S3Client({
    endpoint: this.config.S3_ENDPOINT,
    region: this.config.S3_REGION,
    credentials: {
      accessKeyId: this.config.S3_ACCESS_KEY_ID,
      secretAccessKey: this.config.S3_SECRET_ACCESS_KEY,
    },
    maxAttempts: 1,
  });

  /** Process liveness must not depend on remote providers. */
  liveness(): { status: 'ok'; contractVersion: string } {
    return { status: 'ok', contractVersion: this.config.CONTRACT_VERSION };
  }

  /**
   * Probe each dependency independently and publish only a safe state, never
   * provider errors, URLs, bucket names, or credentials. DB is required for
   * safe read traffic. Redis and object storage degradation remains visible
   * without removing DB-backed reads from the load balancer.
   */
  async readiness(): Promise<ReadinessResult> {
    const [database, redis, objectStorage] = await Promise.all([
      this.probeDatabase(),
      this.probeRedis(),
      this.probeObjectStorage(),
    ]);
    return summarizeReadiness({ database, redis, objectStorage }, this.config.CONTRACT_VERSION);
  }

  /** Keep the legacy service result stable; detailed operational state is at /health/ready. */
  async check(): Promise<{ status: 'ok' | 'degraded'; dbOk: boolean; contractVersion: string }> {
    const result = await this.readiness();
    return {
      status: result.status,
      dbOk: result.dependencies.database === 'ok',
      contractVersion: result.contractVersion,
    };
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
    this.s3.destroy();
    await this.sql.end({ timeout: 1 });
  }

  private async probeDatabase(): Promise<DependencyState> {
    const deadline = Date.now() + this.config.DB_HEALTH_TIMEOUT_MS;
    const runQuery = async (timeoutMs: number): Promise<void> => {
      const query = this.sql`select 1`;
      await withTimeout(query, timeoutMs, () => { void Promise.resolve(query.cancel()).catch(() => undefined); });
    };
    try {
      const firstAttemptMs = Math.min(3_000, this.config.DB_HEALTH_TIMEOUT_MS);
      await runQuery(firstAttemptMs);
      return 'ok';
    } catch {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) return 'unavailable';
      try {
        await runQuery(remainingMs);
        return 'ok';
      } catch {
        return 'unavailable';
      }
    }
  }

  private async probeRedis(): Promise<DependencyState> {
    return probeRedisHealth(this.redis);
  }

  private async probeObjectStorage(): Promise<DependencyState> {
    const abort = new AbortController();
    try {
      await withTimeout(
        this.s3.send(new HeadBucketCommand({ Bucket: this.config.S3_BUCKET }), { abortSignal: abort.signal }),
        3_000,
        () => abort.abort(),
      );
      return 'ok';
    } catch {
      return 'unavailable';
    }
  }

  constructor() {
    // ioredis emits connection failures even when a bounded probe catches them.
    // This client exposes only generic readiness state; don't print provider errors.
    this.redis.on('error', () => undefined);
  }
}
