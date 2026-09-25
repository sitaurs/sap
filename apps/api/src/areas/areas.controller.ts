import { Controller, Get, HttpCode, Param, Query } from '@nestjs/common';
import type { CategoryId } from '../scans/scan.types.js';
import { AreasService } from './areas.service.js';
import { GetAreaQueryDto, ListAreaReportsQueryDto, ListAreasQueryDto } from './dto.js';

/**
 * Public hotspot map endpoints (OpenAPI `security: []`): no session or CSRF guard.
 * GET is a safe method so the global CsrfGuard does not apply. Responses are
 * redacted aggregates — no reporter, address, exact coordinates, or private media.
 */
@Controller('areas')
export class AreasController {
  constructor(private readonly areas: AreasService) {}

  @Get()
  @HttpCode(200)
  listAreas(@Query() query: ListAreasQueryDto) {
    return this.areas.listAreas(query.bbox, query.from, query.to, (query.categoryId ?? null) as CategoryId | null);
  }

  @Get(':cellId')
  @HttpCode(200)
  getArea(@Param('cellId') cellId: string, @Query() query: GetAreaQueryDto) {
    return this.areas.getArea(cellId, query.from, query.to, (query.categoryId ?? null) as CategoryId | null);
  }

  @Get(':cellId/reports')
  @HttpCode(200)
  listAreaReports(@Param('cellId') cellId: string, @Query() query: ListAreaReportsQueryDto) {
    return this.areas.listAreaReports(
      cellId,
      query.from,
      query.to,
      (query.categoryId ?? null) as CategoryId | null,
      query.limit,
      query.cursor,
    );
  }
}
