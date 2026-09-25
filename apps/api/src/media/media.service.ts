import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ImageProcessorService } from './image-processor.service.js';
import { MediaRepository, type MediaPurpose, type MediaRecord } from './media.repository.js';
import { ObjectStorageService } from './object-storage.service.js';

/** Orphan retention for freshly uploaded media (TECH_SPEC §5: "24 jam"). */
export const ORPHAN_TTL_MS = 24 * 60 * 60 * 1_000;

interface UploadedFile {
  buffer: Buffer;
  mimetype?: string;
  size?: number;
  originalname?: string;
}

export interface MediaView {
  id: string;
  purpose: MediaPurpose;
  mimeType: string;
  sizeBytes: number;
  expiresAt: string | null;
}

export interface MediaUrlView {
  url: string;
  expiresAt: string;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly processor: ImageProcessorService,
    private readonly storage: ObjectStorageService,
    private readonly repository: MediaRepository,
  ) {}

  async upload(ownerId: string, purpose: MediaPurpose, file: UploadedFile | undefined): Promise<MediaView> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Berkas wajib diunggah.' });
    }

    const processed = await this.processor.process(file.buffer);
    const objectKey = `${purpose}/${ownerId}/${randomUUID()}.${processed.extension}`;

    await this.storage.putObject({
      key: objectKey,
      body: processed.buffer,
      contentType: processed.mime,
      sha256: processed.sha256,
    });

    const record = await this.repository.createStored({
      ownerId,
      purpose,
      objectKey,
      mime: processed.mime,
      sizeBytes: processed.sizeBytes,
      sha256: processed.sha256,
      width: processed.width,
      height: processed.height,
      expiresAt: new Date(Date.now() + ORPHAN_TTL_MS),
    });

    return this.toView(record);
  }

  async createReadUrl(ownerId: string, mediaId: string): Promise<MediaUrlView> {
    const record = await this.repository.findStoredForOwner(mediaId, ownerId);
    if (!record) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Media tidak ditemukan.' });
    }
    const signed = await this.storage.createSignedGetUrl(record.objectKey);
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }

  private toView(record: MediaRecord): MediaView {
    return {
      id: record.id,
      purpose: record.purpose,
      mimeType: record.mime,
      sizeBytes: record.sizeBytes,
      expiresAt: record.expiresAt ? record.expiresAt.toISOString() : null,
    };
  }
}
