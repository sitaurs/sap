import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { getConfig, type AppConfig } from '@sap/config';
import { RateLimitException } from '../platform/http/rate-limit.js';
import { buildContextBlock, retrieveKnowledge, toCitations } from './assistant-knowledge.js';
import { AssistantProvider, ProviderUnavailableError } from './assistant-provider.js';
import { HybridRetriever } from './assistant-retrieval.js';
import { AssistantStatsTool } from './assistant-stats-tool.js';
import { AssistantAgent } from './assistant-agent.js';
import { AssistantStore } from './assistant-store.js';
import { PRIMING_REPLY, SYSTEM_PROMPT } from './assistant.prompt.js';
import type { KnowledgeEntry } from './assistant-knowledge.js';
import { sanitizeActions } from './assistant-sanitize.js';
import type { HelpPassage } from './assistant-tools.js';

const TOOL_ELIGIBLE_RE = /\b(scan|pindai|riwayat|hasil|klasifikasi|laporan|status|verifikasi|selesai|pencapaian|lencana|badge|poin|progres|kemajuan|sampah|kategori|area|rawan|hotspot|peta|bantuan|panduan|siap|draft)\b/i;
const FAQ_NEAR_DIRECT_RE = /\b(bagaimana cara|cara scan|cara foto|arti hasil|maksud status|cara membaca peta|kenapa scan gagal|mematikan|menyalakan sapa)\b/i;
const MAX_TURN_MS = 20_000; // Capped further by SAPA_LLM_TIMEOUT_MS.
const MAX_AGENT_HISTORY_MESSAGES = 6; // Reuse the existing Redis history, bounded for agent prompt size.
const CONVERSATION_LOCK_RENEW_MS = 10_000;
import {
  isPageContext,
  MESSAGE_MAX_LENGTH,
  type ChatResult,
  type PageContext,
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
  private readonly logger = new Logger(AssistantService.name);
  private readonly config: AppConfig = getConfig();

  constructor(
    private readonly provider: AssistantProvider,
    private readonly store: AssistantStore,
    @Optional() private readonly retriever?: HybridRetriever,
    @Optional() private readonly statsTool?: AssistantStatsTool,
    @Optional() private readonly agent?: AssistantAgent,
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
    const pageContext = request.pageContext as PageContext;

    // 4. Per-account, per-minute quota shields the paid LLM from abuse.
    const rate = await this.store.checkRateLimit(caller.id);
    if (!rate.allowed) throw new RateLimitException(rate.retryAfterSeconds);

    // 5. A null id starts a fresh transcript. A supplied id is checked only after
    //    acquiring the per-conversation lock, so concurrent turns load the most
    //    recent committed history instead of sharing a stale snapshot.
    const isNewConversation = !request.conversationId;
    const conversationId = request.conversationId ?? this.store.newConversationId();
    const lockToken = await this.store.acquireConversation(caller.id, conversationId);
    if (!lockToken) throw this.conversationBusy();
    const renewalTimer = setInterval(() => {
      void this.store.renewConversation(caller.id, conversationId, lockToken).then((renewed) => {
        if (!renewed) this.logger.warn('SAPA conversation lease was lost while processing a turn');
      }).catch(() => {
        this.logger.warn('Could not renew SAPA conversation lease; writes remain fenced by token');
      });
    }, CONVERSATION_LOCK_RENEW_MS);
    renewalTimer.unref();

    try {
      const history = isNewConversation
        ? null
        : await this.store.getConversation(caller.id, conversationId);
      if (!isNewConversation && history === null) {
        throw new NotFoundException({
          code: 'CONVERSATION_NOT_FOUND',
          message: 'Percakapan tidak ditemukan.',
        });
      }

      return await this.processTurn(
        caller.id,
        message,
        pageContext,
        conversationId,
        lockToken,
        isNewConversation,
        history,
      );
    } finally {
      clearInterval(renewalTimer);
      // A failed release leaves only the short lease; its token still fences all
      // writes, and surfacing a cleanup error could turn a committed reply into
      // an apparent failure that the client might retry as a duplicate turn.
      try {
        await this.store.releaseConversation(caller.id, conversationId, lockToken);
      } catch {
        this.logger.warn('Could not release SAPA conversation lease; it will expire automatically');
      }
    }
  }

  /** Delete a stored transcript. Missing/expired/foreign id -> 404. */
  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    const lockToken = await this.store.acquireConversation(userId, conversationId);
    if (!lockToken) throw this.conversationBusy();
    const result = await this.store.deleteConversation(userId, conversationId, lockToken);
    if (result === 'lock_lost') throw this.conversationBusy();
    if (result === 'not_found') {
      throw new NotFoundException({
        code: 'CONVERSATION_NOT_FOUND',
        message: 'Percakapan tidak ditemukan.',
      });
    }
  }

  private async processTurn(
    callerId: string,
    message: string,
    pageContext: PageContext,
    conversationId: string,
    lockToken: string,
    allowCreate: boolean,
    history: Awaited<ReturnType<AssistantStore['getConversation']>>,
  ): Promise<ChatResult> {
    // 6. Deterministic read-only tool: if the caller is clearly asking for their
    //    own stats, answer from their gamification aggregates directly.
    if (this.statsTool && this.statsTool.detectIntent(message)) {
      const stats = await this.statsTool.run(callerId);
      await this.persistTurn(callerId, conversationId, lockToken, allowCreate, message, stats.reply);
      return {
        conversationId,
        reply: stats.reply,
        suggestedActions: stats.suggestedActions,
        citations: stats.citations,
      };
    }

    const entries =
      this.retriever && this.retriever.isEnabled()
        ? await this.retriever.retrieve(message, pageContext)
        : retrieveKnowledge(message, pageContext);

    if (this.agent && this.isToolEligible(message)) {
      try {
        await this.ensureConversationLease(callerId, conversationId, lockToken);
        const agentReply = await this.agent.run({
          message,
          history: (history ?? [])
            .slice(-MAX_AGENT_HISTORY_MESSAGES)
            .map((turn) => ({ role: turn.role, content: turn.content })),
          callerId,
          deadlineAt: Date.now() + Math.min(MAX_TURN_MS, this.config.SAPA_LLM_TIMEOUT_MS),
          helpPassages: entries.map(toHelpPassage),
        });
        await this.persistTurn(callerId, conversationId, lockToken, allowCreate, message, agentReply.reply);
        return {
          conversationId,
          reply: agentReply.reply,
          suggestedActions: sanitizeActions(agentReply.suggestedActions),
          citations: toCitations(entries, agentReply.citationIds),
        };
      } catch (error) {
        if (!(error instanceof ProviderUnavailableError)) throw error;
      }
    }

    const contextBlock = buildContextBlock(entries, pageContext);
    const messages: ProviderMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'assistant', content: PRIMING_REPLY },
      ...(history ?? []).map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user', content: `${contextBlock}\n\nPertanyaan pengguna:\n${message}` },
    ];

    let reply;
    try {
      await this.ensureConversationLease(callerId, conversationId, lockToken);
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

    await this.persistTurn(callerId, conversationId, lockToken, allowCreate, message, reply.reply);
    return {
      conversationId,
      reply: reply.reply,
      suggestedActions: reply.suggestedActions,
      citations: toCitations(entries, reply.citationIds),
    };
  }

  private async persistTurn(
    callerId: string,
    conversationId: string,
    lockToken: string,
    allowCreate: boolean,
    userMessage: string,
    assistantReply: string,
  ): Promise<void> {
    const status = await this.store.appendTurn(
      callerId,
      conversationId,
      userMessage,
      assistantReply,
      lockToken,
      allowCreate,
    );
    if (status === 'conversation_missing') {
      throw new NotFoundException({
        code: 'CONVERSATION_NOT_FOUND',
        message: 'Percakapan tidak ditemukan.',
      });
    }
    if (status === 'lock_lost') throw this.conversationBusy();
  }

  private conversationBusy(): ConflictException {
    return new ConflictException({
      code: 'CONVERSATION_BUSY',
      message: 'Percakapan sedang diproses. Coba lagi sebentar.',
    });
  }

  private async ensureConversationLease(callerId: string, conversationId: string, lockToken: string): Promise<void> {
    if (!(await this.store.renewConversation(callerId, conversationId, lockToken))) {
      throw this.conversationBusy();
    }
  }

  /**
   * Cheap heuristic for whether a turn should use the tool-using agent instead of
   * the single-shot FAQ provider. A near-direct FAQ ("bagaimana cara scan") is
   * answered by the FAQ path; anything referencing the caller's own
   * status/progress, taxonomy, an area summary, or approved help content is
   * agent-eligible. When neither pattern is decisive we return false and let the
   * caller fall back to the FAQ path.
   */
  private isToolEligible(message: string): boolean {
    if (FAQ_NEAR_DIRECT_RE.test(message)) return false;
    return TOOL_ELIGIBLE_RE.test(message);
  }

  private invalidMessage(message: string): UnprocessableEntityException {
    return new UnprocessableEntityException({ code: 'ASSISTANT_MESSAGE_INVALID', message });
  }
}

/**
 * Map a retrieved KB/corpus entry to the approved-passage shape the agent's
 * search_help_content tool quotes from. Internal FAQ entries default to the
 * "FAQ SAP" provenance label and carry no external URL.
 */
function toHelpPassage(entry: KnowledgeEntry): HelpPassage {
  return {
    id: entry.id,
    title: entry.question,
    snippet: entry.answer,
    source: entry.source ?? 'FAQ SAP',
    url: entry.url ?? null,
  };
}
