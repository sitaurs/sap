import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../platform/http/request-context.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ListMyReportsQueryDto, ReportInputDto, ReportUpdateInputDto } from './dto.js';
import { ReportsService } from './reports.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVISION_RE = /^[1-9][0-9]*$/;

@Controller('reports')
@UseGuards(SessionAuthGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @HttpCode(201)
  createReport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReportInputDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    if (!idempotencyKey || !UUID_RE.test(idempotencyKey)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Header Idempotency-Key (uuid) wajib.' });
    }
    return this.reports.createReport(user.id, dto, idempotencyKey);
  }

  @Get('mine')
  @HttpCode(200)
  listMine(@CurrentUser() user: AuthenticatedUser, @Query() query: ListMyReportsQueryDto) {
    return this.reports.listMyReports(user.id, query.limit, query.cursor, query.status);
  }

  @Get(':reportId')
  @HttpCode(200)
  getReport(@CurrentUser() user: AuthenticatedUser, @Param('reportId', ParseUUIDPipe) reportId: string) {
    return this.reports.getReport(user.id, user.role === 'admin', reportId);
  }

  @Patch(':reportId')
  @HttpCode(200)
  updateReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() dto: ReportUpdateInputDto,
    @Headers('if-match') ifMatch: string | undefined,
  ) {
    if (!ifMatch || !REVISION_RE.test(ifMatch)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Header If-Match (revisi integer) wajib.' });
    }
    return this.reports.updateReport(user.id, reportId, Number(ifMatch), dto);
  }
}
