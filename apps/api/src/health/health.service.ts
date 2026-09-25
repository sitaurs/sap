import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { getConfig } from '@sap/config';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
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

  async check() {
    const checks = await Promise.allSettled([
      this.withTimeout(this.sql`select 1`, 3_000),
      this.withTimeout(this.pingRedis(), 3_000),
      this.withTimeout(this.s3.send(new HeadBucketCommand({ Bucket: this.config.S3_BUCKET })), 3_000),
    ]);
    const status = checks.every((item) => item.status === 'fulfilled') ? 'ok' : 'degraded';
    return {
      data: { status, contractVersion: this.config.CONTRACT_VERSION },
      meta: { requestId: randomUUID() },
    };
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
