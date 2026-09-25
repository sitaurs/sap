import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

/** Body for createScan (OpenAPI ScanInput). */
export class ScanInputDto {
  @IsUUID()
  mediaId!: string;
}

/** Query for listScans. */
export class ListScansQueryDto {
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
