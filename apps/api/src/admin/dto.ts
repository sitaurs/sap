import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
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
import { HYBRID_MODES } from './scan-settings.types.js';

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
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  resolutionEvidenceIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => EvidencePublicationDto)
  publicEvidenceApprovals?: EvidencePublicationDto[];

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

export class EvidencePublicationDto {
  @IsUUID() mediaId!: string;
  @IsUUID() renditionId!: string;
  @IsArray() @ArrayMaxSize(2) @ArrayUnique() @IsIn(['web','instagram'], {each:true})
  channels!: ('web'|'instagram')[];
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

/** Body for updateScanSettings (OpenAPI ScanSettingsUpdateInput). All fields optional (partial update). */
export class ScanSettingsUpdateDto {
  @IsOptional()
  @IsIn(HYBRID_MODES)
  mode?: (typeof HYBRID_MODES)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceThreshold?: number;

  @IsOptional()
  @IsBoolean()
  visionEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  visionModel?: string;
}
