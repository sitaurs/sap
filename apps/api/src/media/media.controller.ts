import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthenticatedUser } from '../platform/http/request-context.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { UploadMediaDto } from './dto.js';
import { MAX_UPLOAD_BYTES } from './image-processor.service.js';
import { MediaService } from './media.service.js';

interface UploadedFile {
  buffer: Buffer;
  mimetype?: string;
  size?: number;
  originalname?: string;
}

@Controller('media')
@UseGuards(SessionAuthGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @HttpCode(201)
  // memoryStorage is multer's default when no storage is configured → file.buffer is populated.
  // The hard byte cap here means oversized uploads fail fast (mapped to 413 in the exception filter).
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  uploadMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadMediaDto,
    @UploadedFile() file: UploadedFile | undefined,
  ) {
    return this.media.upload(user.id, dto.purpose, file);
  }

  @Get(':mediaId/url')
  @HttpCode(200)
  getMediaUrl(@CurrentUser() user: AuthenticatedUser, @Param('mediaId', ParseUUIDPipe) mediaId: string) {
    return this.media.createReadUrl(user.id, mediaId);
  }
}
