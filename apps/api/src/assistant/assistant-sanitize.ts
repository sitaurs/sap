import {
  CITATIONS_MAX,
  isAssistantTarget,
  LABEL_MAX_LENGTH,
  SUGGESTED_ACTIONS_MAX,
  type SuggestedAction,
} from './assistant.types.js';

/**
 * Server-side output sanitizers shared by the single-shot {@link AssistantProvider}
 * and the LangGraph {@link AssistantAgent}. Both paths ultimately emit the same
 * `/assistant/chat` contract shape, so the closed-enum action filter and the
 * citation-id filter live here once and are the last word regardless of what the
 * model produced.
 */

/**
 * Keep only well-formed actions whose target is in the approved enum and whose
 * label fits the contract; drop everything else and cap at the max.
 */
export function sanitizeActions(value: unknown): SuggestedAction[] {
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

/**
 * Keep only well-formed citation ids (non-empty, bounded strings), capped at the
 * max. These are raw KONTEKS ids; the service still cross-checks each against the
 * retrieved set before turning it into a card, so a bogus id cannot fabricate a
 * source.
 */
export function sanitizeCitationIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    if (ids.length >= CITATIONS_MAX) break;
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed.length === 0 || trimmed.length > 64) continue;
    ids.push(trimmed);
  }
  return ids;
}
