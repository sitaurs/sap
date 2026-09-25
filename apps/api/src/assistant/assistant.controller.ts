import { Body, Controller, Delete, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../platform/http/request-context.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { AssistantService } from './assistant.service.js';
import { AssistantChatInputDto } from './assistant.dto.js';

@Controller('assistant')
@UseGuards(SessionAuthGuard)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('chat')
  @HttpCode(200)
  chat(@CurrentUser() user: AuthenticatedUser, @Body() dto: AssistantChatInputDto) {
    // Identity + SAPA opt-in come from the verified session, never the body.
    return this.assistant.chat(
      { id: user.id, sapaEnabled: user.sapaEnabled },
      { message: dto.message, pageContext: dto.pageContext, conversationId: dto.conversationId ?? null },
    );
  }

  @Delete('conversations/:conversationId')
  @HttpCode(200)
  async deleteConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
  ) {
    await this.assistant.deleteConversation(user.id, conversationId);
    return { message: 'Percakapan dihapus.' };
  }
}
