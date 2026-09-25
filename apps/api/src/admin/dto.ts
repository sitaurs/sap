import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const STATUSES = ['submitted', 'verified', 'in_progress', 'resolved', 'rejected', 'duplicate'] as const;

/** Body for decideReport (OpenAPI DecisionInput). */
export class DecisionInputDto {
  @IsIn(STATUSES)
  nextStatus!: (typeof STATUSES)[number];

  @IsString()
  @Length(5, 1000)
  reason!: string;

  @IsOptional()
  @ValidateIf((o) => o.duplicateOfId !== null)
  @IsUUID()
  duplicateOfId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  resolutionMediaIds?: string[];

  @IsOptional()
  @ValidateIf((o) => o.publicSummary !== null)
  @IsString()
  @Length(0, 500)
  publicSummary?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  publishMediaIds?: string[];
}

/** Query for listAdminReports. */
export class ListAdminReportsQueryDto {
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

/** Query for listAuditEvents (keyset pagination only). */
export class ListAuditEventsQueryDto {
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
