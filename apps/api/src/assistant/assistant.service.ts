import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { getConfig, type AppConfig } from '@sap/config';
import { RateLimitException } from '../platform/http/rate-limit.js';
import { buildContextBlock, retrieveKnowledge } from './assistant-knowledge.js';
import { AssistantProvider, ProviderUnavailableError } from './assistant-provider.js';
import { AssistantStore } from './assistant-store.js';
import { PRIMING_REPLY, SYSTEM_PROMPT } from './assistant.prompt.js';
import {
  isPageContext,
  MESSAGE_MAX_LENGTH,
  type ChatResult,
  type ProviderMessage,
} from './assistant.types.js';

/** The authenticated caller's SAPA-relevant identity, taken from the session. */
export interface AssistantCaller {
  id: string;
  sapaEnabled: boolean;
}

export interface ChatRequest {
  message: string;
  pageContext: string;
  conversationId?: string | null;
}

/**
 * Orchestrates a SAPA chat turn behind layered guardrails (SAPA_ASSISTANT.md
 * §19 defense-in-depth): global feature flag, per-account opt-in, input
 * validation, rate limiting, conversation ownership, then the grounded LLM call.
 */
@Injectable()
export class AssistantService {
  private readonly config: AppConfig = getConfig();

  constructor(
    private readonly provider: AssistantProvider,
    private readonly store: AssistantStore,
  ) {}

  async chat(caller: AssistantCaller, request: ChatRequest): Promise<ChatResult> {
    // 1. Feature must be enabled platform-wide.
    if (!this.config.SAPA_FEATURE_ENABLED) {
      throw new ServiceUnavailableException({
        code: 'ASSISTANT_UNAVAILABLE',
        message: 'Asisten SAPA sedang tidak tersedia.',
      });
    }

    // 2. The account must have SAPA turned on.
    if (!caller.sapaEnabled) {
      throw new ForbiddenException({
        code: 'ASSISTANT_DISABLED',
        message: 'Fitur SAPA dinonaktifkan untuk akun ini.',
      });
    }

    // 3. Domain validation -> 422 (distinct from the pipe's generic 400).
    const message = typeof request.message === 'string' ? request.message.trim() : '';
    if (message.length === 0 || message.length > MESSAGE_MAX_LENGTH) {
      throw this.invalidMessage('Pesan harus berisi 1 hingga 2000 karakter.');
    }
    if (!isPageContext(request.pageContext)) {
      throw this.invalidMessage('pageContext tidak dikenali.');
    }
    const pageContext = request.pageContext;

    // 4. Per-account, per-minute quota shields the paid LLM from abuse.
    const rate = await this.store.checkRateLimit(caller.id);
    if (!rate.allowed) throw new RateLimitException(rate.retryAfterSeconds);

    // 5. Resolve the conversation. A supplied id must belong to this account and
    //    still exist; otherwise it is a 404. A null id starts a fresh transcript.
    let conversationId: string;
    let history;
    if (request.conversationId) {
      history = await this.store.getConversation(caller.id, request.conversationId);
      if (history === null) {
        throw new NotFoundException({
          code: 'CONVERSATION_NOT_FOUND',
          message: 'Percakapan tidak ditemukan.',
        });
      }
      conversationId = request.conversationId;
    } else {
      conversationId = this.store.newConversationId();
      history = null;
    }

    // 6. Ground the model on retrieved KB entries and call the provider.
    const entries = retrieveKnowledge(message, pageContext);
    const contextBlock = buildContextBlock(entries, pageContext);
    const messages: ProviderMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'assistant', content: PRIMING_REPLY },
      ...(history ?? []).map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user', content: `${contextBlock}\n\nPertanyaan pengguna:\n${message}` },
    ];

    let reply;
    try {
      reply = await this.provider.complete(messages);
    } catch (error) {
      if (error instanceof ProviderUnavailableError) {
        throw new ServiceUnavailableException({
          code: 'ASSISTANT_UNAVAILABLE',
          message: 'Asisten SAPA sedang tidak tersedia. Coba lagi nanti.',
        });
      }
      throw error;
    }

    await this.store.appendTurn(caller.id, conversationId, message, reply.reply, history);
    return { conversationId, reply: reply.reply, suggestedActions: reply.suggestedActions };
  }

  /** Delete a stored transcript. Missing/expired/foreign id -> 404. */
  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    const removed = await this.store.deleteConversation(userId, conversationId);
    if (!removed) {
      throw new NotFoundException({
        code: 'CONVERSATION_NOT_FOUND',
        message: 'Percakapan tidak ditemukan.',
      });
    }
  }

  private invalidMessage(message: string): UnprocessableEntityException {
    return new UnprocessableEntityException({ code: 'ASSISTANT_MESSAGE_INVALID', message });
  }
}
