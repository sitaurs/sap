import type { AppConfig } from '@sap/config';
import { CATEGORY_IDS } from './ml-adapter.js';
import type { MlPrediction } from './ml-client.js';

const CATEGORY_LIST = CATEGORY_IDS.join(', ');

const SYSTEM_PROMPT = `You are a waste-image classifier for a recycling app. Look at the image and
classify the single most prominent waste item into EXACTLY ONE of these labels:
${CATEGORY_LIST}, no_waste, unknown.
Rules: use "no_waste" if the image shows no discernible waste item; use "unknown" if the item is
ambiguous or not covered by the labels. Reply with ONLY a JSON object of the form
{"category": "<label>", "confidence": <number 0..1>}. No prose, no markdown.`;

const USER_TEXT = 'Classify the waste item in this image.';

/** Recognise the container format from the leading magic bytes. */
function sniffMime(image: Buffer): string | null {
  if (image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) return 'image/jpeg';
  if (image.length >= 8 && image[0] === 0x89 && image[1] === 0x50 && image[2] === 0x4e && image[3] === 0x47) return 'image/png';
  if (
    image.length >= 12 &&
    image.toString('ascii', 0, 4) === 'RIFF' &&
    image.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * OpenAI-compatible vision adapter for hybrid scan detection. Sends the image
 * inline (data URL) to `POST {SAPA_LLM_BASE_URL}/chat/completions` with a Bearer
 * key and a hard timeout, and parses the model's JSON into an {@link MlPrediction}
 * so the existing `mapPrediction` can validate the label against the taxonomy.
 *
 * Security: the Authorization header and the image bytes are NEVER logged.
 * Errors are thrown with ML_* prefixes so `classifyError` maps them to domain codes.
 */
export class VisionClient {
  constructor(private readonly config: AppConfig) {}

  async classify(image: Buffer, model: string): Promise<MlPrediction> {
    const baseUrl = this.config.SAPA_LLM_BASE_URL;
    const apiKey = this.config.SAPA_LLM_API_KEY;
    if (!baseUrl || !apiKey) throw new Error('ML_UNAVAILABLE: vision gateway not configured');

    const mime = sniffMime(image);
    if (!mime) throw new Error('ML_INVALID_RESPONSE: unsupported image format');
    const dataUrl = `data:${mime};base64,${image.toString('base64')}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.SCAN_LLM_VISION_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 200,
          stream: false,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: USER_TEXT },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error((error as Error).name === 'AbortError' ? 'ML_TIMEOUT' : 'ML_UNAVAILABLE: network error');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) throw new Error(`ML_UNAVAILABLE: upstream status ${response.status}`);
    return this.parse(await this.extractContent(response));
  }

  /** Pull the assistant message text out of the OpenAI-compatible envelope. */
  private async extractContent(response: Response): Promise<string> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error('ML_INVALID_RESPONSE: non-JSON upstream body');
    }
    const content = (body as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('ML_INVALID_RESPONSE: empty upstream content');
    }
    return content;
  }

  /** Parse the model JSON into an MlPrediction. Foreign labels are left for mapPrediction to reject. */
  private parse(content: string): MlPrediction {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.stripCodeFence(content));
    } catch {
      throw new Error('ML_INVALID_RESPONSE: model did not return JSON');
    }
    const category = (parsed as { category?: unknown }).category;
    if (typeof category !== 'string' || category.trim().length === 0) {
      throw new Error('ML_INVALID_RESPONSE: model reply missing category');
    }
    const label = category.trim();
    const raw = (parsed as { confidence?: unknown }).confidence;
    const confidence = typeof raw === 'number' && Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 1) : 0.99;
    return { label, confidences: [{ label, confidence }] };
  }

  /** Strip a ```json ... ``` fence some models wrap JSON in. */
  private stripCodeFence(content: string): string {
    const trimmed = content.trim();
    if (!trimmed.startsWith('```')) return trimmed;
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }
}
