import { Injectable, Logger } from '@nestjs/common';
import { getConfig, type AppConfig } from '@sap/config';
import {
  isAssistantTarget,
  LABEL_MAX_LENGTH,
  SUGGESTED_ACTIONS_MAX,
  type AssistantReply,
  type ProviderMessage,
  type SuggestedAction,
} from './assistant.types.js';

/** Raised when the LLM is unreachable, times out, or returns unusable output. */
export class ProviderUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'ProviderUnavailableError';
  }
}

/**
 * OpenAI-compatible chat adapter for SAPA. Calls
 * `POST {SAPA_LLM_BASE_URL}/chat/completions` with a Bearer key, enforces a hard
 * timeout, and validates the model's JSON into a safe {reply, suggestedActions}.
 * Security: the Authorization header and message content are NEVER logged; only
 * coarse failure reasons are recorded.
 */
@Injectable()
export class AssistantProvider {
  private readonly logger = new Logger(AssistantProvider.name);
  private readonly config: AppConfig = getConfig();

  async complete(messages: ProviderMessage[]): Promise<AssistantReply> {
    const baseUrl = this.config.SAPA_LLM_BASE_URL;
    const apiKey = this.config.SAPA_LLM_API_KEY;
    const model = this.config.SAPA_LLM_MODEL;
    if (!baseUrl || !apiKey || !model) {
      throw new ProviderUnavailableError('SAPA LLM is not configured');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.SAPA_LLM_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: this.config.SAPA_LLM_TEMPERATURE,
          max_tokens: this.config.SAPA_LLM_MAX_OUTPUT_TOKENS,
          response_format: { type: 'json_object' },
          messages,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      // AbortError (timeout) or network failure. Do not log request content.
      const reason = (error as Error).name === 'AbortError' ? 'timeout' : 'network error';
      this.logger.warn(`SAPA provider unavailable: ${reason}`);
      throw new ProviderUnavailableError(reason);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      this.logger.warn(`SAPA provider returned status ${response.status}`);
      throw new ProviderUnavailableError(`upstream status ${response.status}`);
    }

    const content = await this.extractContent(response);
    return this.parseReply(content);
  }

  /** Pull the assistant message text out of the OpenAI-compatible envelope. */
  private async extractContent(response: Response): Promise<string> {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ProviderUnavailableError('non-JSON upstream body');
    }
    const content = (body as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message
      ?.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new ProviderUnavailableError('empty upstream content');
    }
    return content;
  }

  /** Parse + sanitize the model's JSON. Anything malformed => unavailable. */
  private parseReply(content: string): AssistantReply {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new ProviderUnavailableError('model did not return JSON');
    }
    const reply = (parsed as { reply?: unknown }).reply;
    if (typeof reply !== 'string' || reply.trim().length === 0) {
      throw new ProviderUnavailableError('model reply missing');
    }
    return {
      reply: reply.trim(),
      suggestedActions: this.sanitizeActions((parsed as { suggestedActions?: unknown }).suggestedActions),
    };
  }

  /**
   * Keep only well-formed actions whose target is in the approved enum and whose
   * label fits the contract; drop everything else and cap at the max. This is the
   * server-side backstop against the model emitting arbitrary routes or labels.
   */
  private sanitizeActions(value: unknown): SuggestedAction[] {
    if (!Array.isArray(value)) return [];
    const actions: SuggestedAction[] = [];
    for (const item of value) {
      if (actions.length >= SUGGESTED_ACTIONS_MAX) break;
      if (!item || typeof item !== 'object') continue;
      const { label, target } = item as { label?: unknown; target?: unknown };
      if (typeof label !== 'string') continue;
      const trimmed = label.trim();
      if (trimmed.length === 0 || trimmed.length > LABEL_MAX_LENGTH) continue;
      if (!isAssistantTarget(target)) continue;
      actions.push({ label: trimmed, target });
    }
    return actions;
  }
}
