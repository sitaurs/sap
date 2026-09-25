import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser, SapRequest } from '../platform/http/request-context.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { AdminGuard } from './admin.guard.js';
import { AdminService } from './admin.service.js';
import { DecisionInputDto, ListAdminReportsQueryDto, ListAuditEventsQueryDto } from './dto.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVISION_RE = /^[1-9][0-9]*$/;

@Controller('admin')
@UseGuards(SessionAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('reports')
  @HttpCode(200)
  listReports(@Query() query: ListAdminReportsQueryDto) {
    return this.admin.listAdminReports(query.limit, query.cursor, query.status);
  }

  @Get('reports/:reportId/duplicates')
  @HttpCode(200)
  listDuplicates(@Param('reportId', ParseUUIDPipe) reportId: string) {
    return this.admin.listDuplicateCandidates(reportId);
  }

  @Post('reports/:reportId/decisions')
  @HttpCode(200)
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: SapRequest,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: DecisionInputDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
  ) {
    if (!idempotencyKey || !UUID_RE.test(idempotencyKey)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Header Idempotency-Key (uuid) wajib.' });
    }
    if (!ifMatch || !REVISION_RE.test(ifMatch)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Header If-Match (revisi integer) wajib.' });
    }
    return this.admin.decideReport(user.id, reportId, Number(ifMatch), idempotencyKey, req.requestId ?? null, dto);
  }

  @Get('stats')
  @HttpCode(200)
  stats() {
    return this.admin.getAdminStats();
  }

  @Get('audit')
  @HttpCode(200)
  audit(@Query() query: ListAuditEventsQueryDto) {
    return this.admin.listAuditEvents(query.limit, query.cursor);
  }
}
