import { Client, handle_file } from '@gradio/client';
import type { AppConfig } from '@sap/config';

export interface MlPrediction {
  label: string;
  confidences: Array<{ label: string; confidence: number }>;
}

export class MlClient {
  constructor(private readonly config: AppConfig) {}

  async predict(image: Buffer): Promise<MlPrediction> {
    const authorization = `Basic ${Buffer.from(
      `${this.config.ML_USERNAME}:${this.config.ML_PASSWORD}`,
    ).toString('base64')}`;
    const client = await Client.connect(this.config.ML_INFERENCE_URL, {
      headers: { Authorization: authorization },
    });
    const result = await this.withTimeout(
      client.predict(this.config.ML_API_NAME, { img: handle_file(image) }),
      this.config.ML_TIMEOUT_MS,
    );
    if (!result || typeof result !== 'object' || !Array.isArray((result as { data?: unknown }).data)) {
      throw new Error('ML_INVALID_RESPONSE');
    }
    const prediction = (result as { data: unknown[] }).data[0];
    if (!this.isPrediction(prediction)) throw new Error('ML_INVALID_RESPONSE');
    return prediction;
  }

  private isPrediction(value: unknown): value is MlPrediction {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<MlPrediction>;
    return (
      typeof candidate.label === 'string' &&
      Array.isArray(candidate.confidences) &&
      candidate.confidences.every(
        (item) =>
          item &&
          typeof item.label === 'string' &&
          typeof item.confidence === 'number' &&
          item.confidence >= 0 &&
          item.confidence <= 1,
      )
    );
  }

  private async withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('ML_TIMEOUT')), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
