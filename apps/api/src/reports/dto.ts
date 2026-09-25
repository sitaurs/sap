import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CATEGORY_IDS } from '../scans/scan.types.js';

const SEVERITIES = ['small', 'medium', 'large'] as const;
const STATUSES = ['submitted', 'verified', 'in_progress', 'resolved', 'rejected', 'duplicate'] as const;

export class LocationDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}

/** Body for createReport (OpenAPI ReportInput). */
export class ReportInputDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  mediaIds!: string[];

  @IsString()
  @Length(20, 2000)
  description!: string;

  @ValidateNested()
  @Type(() => LocationDto)
  location!: LocationDto;

  @IsISO8601()
  occurredAt!: string;

  @IsIn(SEVERITIES)
  reportedSeverity!: (typeof SEVERITIES)[number];

  @IsOptional()
  @ValidateIf((o) => o.categoryId !== null)
  @IsIn(CATEGORY_IDS)
  categoryId?: string | null;

  @IsOptional()
  @ValidateIf((o) => o.scanId !== null)
  @IsUUID()
  scanId?: string | null;
}

/** Body for updateReport (OpenAPI ReportUpdateInput, minProperties 1). scanId is immutable. */
export class ReportUpdateInputDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  mediaIds?: string[];

  @IsOptional()
  @IsString()
  @Length(20, 2000)
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @IsOptional()
  @IsIn(SEVERITIES)
  reportedSeverity?: (typeof SEVERITIES)[number];

  @IsOptional()
  @ValidateIf((o) => o.categoryId !== null)
  @IsIn(CATEGORY_IDS)
  categoryId?: string | null;
}

/** Query for listMyReports. */
export class ListMyReportsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
