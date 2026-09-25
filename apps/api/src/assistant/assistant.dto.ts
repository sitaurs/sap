import { IsString, IsUUID, ValidateIf } from 'class-validator';

/**
 * POST /assistant/chat body. Domain rules (message length 1–2000, pageContext
 * must be a known enum) are enforced in AssistantService so they surface as 422
 * ASSISTANT_MESSAGE_INVALID rather than the pipe's generic 400. The DTO only
 * checks coarse types here; `forbidNonWhitelisted` still rejects any extra key
 * (e.g. userId, role, coordinates) with 400 before the service runs.
 */
export class AssistantChatInputDto {
  @IsString()
  message!: string;

  @IsString()
  pageContext!: string;

  // Nullable in the contract: a new conversation sends null/omitted; continuing
  // one sends the prior UUID. Only validate the UUID shape when a value is given.
  @ValidateIf((o: AssistantChatInputDto) => o.conversationId !== null && o.conversationId !== undefined)
  @IsUUID()
  conversationId?: string | null;
}
