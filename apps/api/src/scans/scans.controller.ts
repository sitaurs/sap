import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from '../platform/http/request-context.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { ListScansQueryDto, ScanInputDto } from './dto.js';
import { ScansService } from './scans.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('scans')
@UseGuards(SessionAuthGuard)
export class ScansController {
  constructor(private readonly scans: ScansService) {}

  @Post()
  @HttpCode(202)
  createScan(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ScanInputDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    if (!idempotencyKey || !UUID_RE.test(idempotencyKey)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Header Idempotency-Key (uuid) wajib.' });
    }
    return this.scans.createScan(user.id, dto, idempotencyKey);
  }

  @Get()
  @HttpCode(200)
  listScans(@CurrentUser() user: AuthenticatedUser, @Query() query: ListScansQueryDto) {
    return this.scans.listScans(user.id, query.limit, query.cursor);
  }

  @Get(':scanId')
  @HttpCode(200)
  getScan(@CurrentUser() user: AuthenticatedUser, @Param('scanId', ParseUUIDPipe) scanId: string) {
    return this.scans.getScan(user.id, scanId);
  }
}
