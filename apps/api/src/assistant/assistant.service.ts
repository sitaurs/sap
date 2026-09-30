import {
  ForbiddenException,
  Injectable,
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

    // 6. Deterministic read-only tool: if the caller is clearly asking for their
    //    own stats, answer from their gamification aggregates directly. This
    //    NEVER goes through the LLM — the locked prompt forbids reciting numbers
    //    outside KONTEKS — and the account is always the authenticated caller.
    if (this.statsTool && this.statsTool.detectIntent(message)) {
      const stats = await this.statsTool.run(caller.id);
      await this.store.appendTurn(caller.id, conversationId, message, stats.reply, history);
      return {
        conversationId,
        reply: stats.reply,
        suggestedActions: stats.suggestedActions,
        citations: stats.citations,
      };
    }

    // 7. Ground the model on retrieved KB entries and call the provider. Hybrid
    //    retrieval is used when enabled+configured; otherwise the in-memory KB.
    const entries =
      this.retriever && this.retriever.isEnabled()
        ? await this.retriever.retrieve(message, pageContext)
        : retrieveKnowledge(message, pageContext);

    // 7a. Route to the tool-using LangGraph agent when it is available and the
    //     turn looks tool-eligible (needs the caller's own status/progress,
    //     taxonomy, an area summary, etc.). A trivial FAQ turn skips it. If the
    //     agent path degrades (ProviderUnavailableError — executor absent, budget
    //     exceeded, tool/auth failure, or bad model output) we fall through to
    //     the existing single-shot FAQ provider below rather than 503 outright.
    if (this.agent && this.isToolEligible(message)) {
      try {
        const agentReply = await this.agent.run({
          message,
          history: (history ?? [])
            .slice(-MAX_AGENT_HISTORY_MESSAGES)
            .map((turn) => ({ role: turn.role, content: turn.content })),
          callerId: caller.id,
          deadlineAt: Date.now() + Math.min(MAX_TURN_MS, this.config.SAPA_LLM_TIMEOUT_MS),
          helpPassages: entries.map(toHelpPassage),
        });
        await this.store.appendTurn(caller.id, conversationId, message, agentReply.reply, history);
        return {
          conversationId,
          reply: agentReply.reply,
          suggestedActions: sanitizeActions(agentReply.suggestedActions),
          citations: toCitations(entries, agentReply.citationIds),
        };
      } catch (error) {
        // Only a graceful-degradation signal falls through to the FAQ path.
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
    return {
      conversationId,
      reply: reply.reply,
      suggestedActions: reply.suggestedActions,
      citations: toCitations(entries, reply.citationIds),
    };
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
