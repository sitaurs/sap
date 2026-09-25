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

/** Validated model output: a grounded reply plus at most three route hints. */
export interface AssistantReply {
  reply: string;
  suggestedActions: SuggestedAction[];
}

/** Chat result returned to the caller (contract schema `AssistantChat`). */
export interface ChatResult extends AssistantReply {
  conversationId: string;
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
