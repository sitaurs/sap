import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { AppConfig } from '@sap/config';

/** Reads normalized media bytes back from R2 for inference (worker side). */
export class ObjectStore {
  private client: S3Client | null = null;

  constructor(private readonly config: AppConfig) {}

  async getObject(key: string): Promise<Buffer> {
    const client = this.getClient();
    const response = await client.send(
      new GetObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key }),
    );
    const body = response.Body;
    if (!body) throw new Error('empty object body');
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
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
