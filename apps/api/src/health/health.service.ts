import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { getConfig } from '@sap/config';
import { Redis } from 'ioredis';
import { createPostgresClient } from '../infrastructure/postgres.js';

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly config = getConfig();
  private readonly sql = createPostgresClient(this.config.DATABASE_URL, 2);
  private readonly redis = new Redis(this.config.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
  });
  private readonly s3 = new S3Client({
    endpoint: this.config.S3_ENDPOINT,
    region: this.config.S3_REGION,
    credentials: {
      accessKeyId: this.config.S3_ACCESS_KEY_ID,
      secretAccessKey: this.config.S3_SECRET_ACCESS_KEY,
    },
  });

  /**
   * Readiness is DB-gated (DEPLOYMENT.md §7: "DB gagal → readiness 503"). The DB
   * is the critical dependency; Redis/R2 being unreachable degrades scans/uploads
   * but the API can still serve reads, so that reports `degraded` at HTTP 200.
   */
  async check(): Promise<{ status: 'ok' | 'degraded'; dbOk: boolean; contractVersion: '1.0.0' }> {
    const [db, redis, s3] = await Promise.allSettled([
      this.checkDb(),
      this.withTimeout(this.pingRedis(), 3_000),
      this.withTimeout(this.s3.send(new HeadBucketCommand({ Bucket: this.config.S3_BUCKET })), 3_000),
    ]);
    const dbOk = db.status === 'fulfilled';
    const auxiliaryOk = redis.status === 'fulfilled' && s3.status === 'fulfilled';
    const status = dbOk && auxiliaryOk ? 'ok' : 'degraded';
    return { status, dbOk, contractVersion: this.config.CONTRACT_VERSION } as const;
  }

  /**
   * Probe the DB with a fast timeout first so a warm instance answers quickly;
   * on failure (typically a Neon scale-to-zero cold start) retry once with the
   * full {@link AppConfig.DB_HEALTH_TIMEOUT_MS} budget before letting readiness
   * fall to 503. This removes the spurious first-request 503 after idle without
   * masking a genuine outage.
   */
  private async checkDb(): Promise<void> {
    try {
      await this.withTimeout(this.sql`select 1`, 3_000);
    } catch {
      await this.withTimeout(this.sql`select 1`, this.config.DB_HEALTH_TIMEOUT_MS);
    }
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.sql.end(), this.redis.quit()]);
  }

  private async pingRedis() {
    if (this.redis.status === 'wait') await this.redis.connect();
    return this.redis.ping();
  }

  private async withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Dependency health check timed out')), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
