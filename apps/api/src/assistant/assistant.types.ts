/**
 * Shared types for the SAPA assistant (addendum v1.1, SAPA_ASSISTANT.md).
 * SAPA is read-only: it explains SAP features and can suggest navigation to an
 * approved route, but never performs domain actions.
 */

/** Pages the frontend may declare so SAPA can pick relevant hints. */
export const PAGE_CONTEXTS = [
  'dashboard',
  'scan',
  'my_reports',
  'areas',
  'scan_history',
  'achievements',
  'settings',
  'help',
] as const;

export type PageContext = (typeof PAGE_CONTEXTS)[number];

/** Approved navigation targets for suggested actions (same closed set as pages). */
export const ASSISTANT_TARGETS = PAGE_CONTEXTS;
export type AssistantTarget = PageContext;

export function isPageContext(value: unknown): value is PageContext {
  return typeof value === 'string' && (PAGE_CONTEXTS as readonly string[]).includes(value);
}

export function isAssistantTarget(value: unknown): value is AssistantTarget {
  return isPageContext(value);
}

export interface SuggestedAction {
  label: string;
  target: AssistantTarget;
}

/**
 * A structured citation card (contract schema `AssistantCitation`). Every card
 * points at a curated corpus entry that was actually present in the injected
 * KONTEKS block, so the UI never surfaces a source SAPA did not ground on.
 */
export interface Citation {
  id: string;
  title: string;
  snippet: string;
  source: string;
  url: string | null;
}

/**
 * Validated model output: a grounded reply, at most three route hints, and the
 * raw KONTEKS entry ids the model claims it grounded on. Ids are resolved to
 * `Citation` cards by the service after cross-checking the retrieved set.
 */
export interface AssistantReply {
  reply: string;
  suggestedActions: SuggestedAction[];
  citationIds: string[];
}

/** Chat result returned to the caller (contract schema `AssistantChat`). */
export interface ChatResult {
  conversationId: string;
  reply: string;
  suggestedActions: SuggestedAction[];
  citations: Citation[];
}

/** A single stored turn. Only role + content; no PII, coordinates, or media. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Provider chat message including the system prompt (not persisted). */
export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const MESSAGE_MAX_LENGTH = 2000;
export const HISTORY_MAX_MESSAGES = 12;
export const CONVERSATION_TTL_SECONDS = 30 * 60;
export const SUGGESTED_ACTIONS_MAX = 3;
export const LABEL_MAX_LENGTH = 40;
/** Max citation cards surfaced per turn — matches the contract `maxItems`. */
export const CITATIONS_MAX = 4;
/** Citation snippet cap, mirrors the contract `AssistantCitation.snippet`. */
export const CITATION_SNIPPET_MAX = 400;
