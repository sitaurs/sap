import { Injectable } from '@nestjs/common';
import { getConfig } from '@sap/config';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Baseline lifetime for a signed read URL (TECH_SPEC §5: "signed read URL pendek, ~5 menit"). */
export const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Cloudflare R2 access via the S3-compatible API. Objects are always private;
 * clients never touch R2 directly — reads go through short-lived presigned URLs
 * minted here. The S3 client is created lazily so importing this provider does
 * not require valid credentials or a network connection (keeps offline checks green).
 */
@Injectable()
export class ObjectStorageService {
  private readonly config = getConfig();
  private client: S3Client | null = null;

  async putObject(input: { key: string; body: Buffer; contentType: string; sha256: string }): Promise<void> {
    const client = this.getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: this.config.S3_BUCKET,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ChecksumSHA256: Buffer.from(input.sha256, 'hex').toString('base64'),
      }),
    );
  }

  async createSignedGetUrl(key: string, ttlSeconds: number = SIGNED_URL_TTL_SECONDS): Promise<{ url: string; expiresAt: Date }> {
    const client = this.getClient();
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key }), {
      expiresIn: ttlSeconds,
    });
    return { url, expiresAt: new Date(Date.now() + ttlSeconds * 1_000) };
  }

  private getClient(): S3Client {
    if (this.client) return this.client;
    this.client = new S3Client({
      region: this.config.S3_REGION,
      endpoint: this.config.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.S3_ACCESS_KEY_ID,
        secretAccessKey: this.config.S3_SECRET_ACCESS_KEY,
      },
    });
    return this.client;
  }
}
