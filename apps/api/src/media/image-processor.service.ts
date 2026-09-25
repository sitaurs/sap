import { BadRequestException, Injectable, PayloadTooLargeException, UnprocessableEntityException, UnsupportedMediaTypeException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

/** Max upload size on the wire (TECH_SPEC §5: "maksimum 10 MiB"). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10_485_760
/** Max decoded surface (TECH_SPEC §5: "decoded 25 megapiksel"). */
export const MAX_DECODED_PIXELS = 25_000_000;

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
type ImageFormat = 'jpeg' | 'png' | 'webp';

export interface ProcessedImage {
  buffer: Buffer;
  mime: ImageMime;
  extension: 'jpg' | 'png' | 'webp';
  sizeBytes: number;
  sha256: string;
  width: number;
  height: number;
}

const FORMAT_TO_MIME: Record<ImageFormat, ImageMime> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const FORMAT_TO_EXT: Record<ImageFormat, ProcessedImage['extension']> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
};

/**
 * Validates and normalizes user uploads before they touch object storage.
 *
 * Pipeline (TECH_SPEC §5): sniff the real content type from magic bytes (never
 * trust the client's declared mime), reject anything but JPEG/PNG/WebP, decode
 * with sharp, enforce the decoded-pixel ceiling, then re-encode to the same
 * family. Re-encoding through `.rotate()` bakes in EXIF orientation and drops
 * all other metadata (GPS, camera, thumbnails) — sharp only re-attaches
 * metadata when explicitly told to, so the output is stripped by default.
 */
@Injectable()
export class ImageProcessorService {
  async process(buffer: Buffer): Promise<ProcessedImage> {
    if (buffer.length === 0) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'File kosong.' });
    }
    if (buffer.length > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException({ code: 'IMAGE_TOO_LARGE', message: 'Berkas melebihi 10 MiB.' });
    }

    const format = this.sniff(buffer);
    if (!format) {
      throw new UnsupportedMediaTypeException({
        code: 'UNSUPPORTED_IMAGE',
        message: 'Hanya JPEG, PNG, atau WebP yang didukung.',
      });
    }

    let width: number;
    let height: number;
    let normalized: Buffer;
    try {
      const pipeline = sharp(buffer, { failOn: 'error' }).rotate();
      const metadata = await pipeline.metadata();
      // After .rotate() sharp reports pre-rotation dimensions in metadata; compute
      // the effective surface from whichever orientation applies.
      const rawWidth = metadata.width ?? 0;
      const rawHeight = metadata.height ?? 0;
      if (rawWidth <= 0 || rawHeight <= 0) {
        throw new UnprocessableEntityException({ code: 'MEDIA_INVALID', message: 'Gambar tidak dapat didekode.' });
      }
      if (rawWidth * rawHeight > MAX_DECODED_PIXELS) {
        throw new UnprocessableEntityException({
          code: 'MEDIA_INVALID',
          message: 'Resolusi gambar melebihi 25 megapiksel.',
        });
      }
      normalized = await this.reencode(pipeline, format);
      const outMeta = await sharp(normalized).metadata();
      width = outMeta.width ?? rawWidth;
      height = outMeta.height ?? rawHeight;
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      throw new UnprocessableEntityException({ code: 'MEDIA_INVALID', message: 'Gambar tidak dapat didekode.' });
    }

    if (normalized.length > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException({ code: 'IMAGE_TOO_LARGE', message: 'Hasil pemrosesan melebihi 10 MiB.' });
    }

    return {
      buffer: normalized,
      mime: FORMAT_TO_MIME[format],
      extension: FORMAT_TO_EXT[format],
      sizeBytes: normalized.length,
      sha256: createHash('sha256').update(normalized).digest('hex'),
      width,
      height,
    };
  }

  private reencode(pipeline: sharp.Sharp, format: ImageFormat): Promise<Buffer> {
    switch (format) {
      case 'jpeg':
        return pipeline.jpeg({ quality: 82 }).toBuffer();
      case 'png':
        return pipeline.png({ compressionLevel: 9 }).toBuffer();
      case 'webp':
        return pipeline.webp({ quality: 82 }).toBuffer();
    }
  }

  /**
   * Content sniff by magic bytes. Explicitly recognizes the disallowed GIF/SVG so
   * callers still get 415 (rather than a vague decode failure) and everything
   * unrecognized falls through to 415 as well.
   */
  private sniff(buffer: Buffer): ImageFormat | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'jpeg';
    }
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return 'png';
    }
    if (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return 'webp';
    }
    return null;
  }
}
