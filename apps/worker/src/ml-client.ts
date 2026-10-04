import { Client, handle_file } from '@gradio/client';
import type { AppConfig } from '@sap/config';

export interface MlPrediction {
  label: string;
  confidences: Array<{ label: string; confidence: number }>;
}

type ConnectedGradioClient = Pick<Client, 'predict' | 'close'>;
type GradioConnect = (appReference: string, options: { headers: Record<string, string> }) => Promise<ConnectedGradioClient>;

export class MlClient {
  constructor(
    private readonly config: AppConfig,
    private readonly connect: GradioConnect = (appReference, options) => Client.connect(appReference, options),
  ) {}

  async predict(image: Buffer): Promise<MlPrediction> {
    const authorization = `Basic ${Buffer.from(
      `${this.config.ML_USERNAME}:${this.config.ML_PASSWORD}`,
    ).toString('base64')}`;
    let client: ConnectedGradioClient | undefined;
    let finished = false;
    let clientClosed = false;
    const closeClient = () => {
      if (client && !clientClosed) {
        clientClosed = true;
        this.close(client);
      }
    };
    // `@gradio/client` does not expose an AbortSignal for connect(). Apply one
    // deadline to both connection setup and inference, close the stream on
    // timeout, and close a client if connection setup finishes later.
    const clientPromise = this.connect(this.config.ML_INFERENCE_URL, {
      headers: { Authorization: authorization },
    }).then((connected) => {
      client = connected;
      if (finished) {
        closeClient();
        throw new Error('ML_TIMEOUT');
      }
      return connected;
    });

    try {
      const result = await this.withTimeout(
        clientPromise.then((connected) => connected.predict(this.config.ML_API_NAME, { img: handle_file(image) })),
        this.config.ML_TIMEOUT_MS,
        () => {
          finished = true;
          closeClient();
        },
      );
      if (!result || typeof result !== 'object' || !Array.isArray((result as { data?: unknown }).data)) {
        throw new Error('ML_INVALID_RESPONSE');
      }
      const prediction = (result as { data: unknown[] }).data[0];
      if (!this.isPrediction(prediction)) throw new Error('ML_INVALID_RESPONSE');
      return prediction;
    } finally {
      finished = true;
      closeClient();
    }
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

  private async withTimeout<T>(operation: Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            onTimeout();
            reject(new Error('ML_TIMEOUT'));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private close(client: ConnectedGradioClient): void {
    try {
      client.close();
    } catch {
      // Cleanup must not replace the inference result or its domain error.
    }
  }
}
