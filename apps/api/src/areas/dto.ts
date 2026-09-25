import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { CATEGORY_IDS } from '../scans/scan.types.js';

const BBOX_RE = /^-?[0-9.]+,-?[0-9.]+,-?[0-9.]+,-?[0-9.]+$/;

/** Shared date-range + category filters for every area endpoint. */
class AreaFilterQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn(CATEGORY_IDS)
  categoryId?: (typeof CATEGORY_IDS)[number];
}

/** Query for listAreas: bbox is required (west,south,east,north; WGS84). */
export class ListAreasQueryDto extends AreaFilterQueryDto {
  @IsString()
  @Matches(BBOX_RE, { message: 'bbox harus berformat west,south,east,north.' })
  bbox!: string;
}

/** Query for getArea (single cell, same filters, no bbox). */
export class GetAreaQueryDto extends AreaFilterQueryDto {}

/** Query for listAreaReports: filters plus keyset pagination. */
export class ListAreaReportsQueryDto extends AreaFilterQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
