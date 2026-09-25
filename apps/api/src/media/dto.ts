import { IsIn } from 'class-validator';
import type { MediaPurpose } from './media.repository.js';

/** Multipart text field alongside the binary `file` part (OpenAPI uploadMedia). */
export class UploadMediaDto {
  @IsIn(['scan', 'report', 'resolution'])
  purpose!: MediaPurpose;
}
