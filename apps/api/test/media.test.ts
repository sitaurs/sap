import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import type { HttpException } from '@nestjs/common';
import { ImageProcessorService, MAX_UPLOAD_BYTES } from '../src/media/image-processor.service.js';
import { MediaService } from '../src/media/media.service.js';
import type { MediaRecord } from '../src/media/media.repository.js';

function errorCode(error: unknown): string {
  const body = (error as HttpException).getResponse?.();
  return typeof body === 'object' && body !== null ? (body as { code?: string }).code ?? '' : '';
}

const solid = (extra: (s: sharp.Sharp) => sharp.Sharp = (s) => s) =>
  extra(sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 12, g: 200, b: 90 } } }));

test('ImageProcessor accepts PNG and returns a stripped, re-encoded buffer', async () => {
  const processor = new ImageProcessorService();
  const png = await solid((s) => s.png()).toBuffer();

  const result = await processor.process(png);
  assert.equal(result.mime, 'image/png');
  assert.equal(result.extension, 'png');
  assert.equal(result.width, 16);
  assert.equal(result.height, 16);
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
  assert.ok(result.sizeBytes > 0);
});

test('ImageProcessor strips EXIF metadata on re-encode', async () => {
  const processor = new ImageProcessorService();
  const jpegWithExif = await solid((s) => s.withExif({ IFD0: { Copyright: 'SAP-TEST' } }).jpeg()).toBuffer();

  const result = await processor.process(jpegWithExif);
  assert.equal(result.mime, 'image/jpeg');
  const outMeta = await sharp(result.buffer).metadata();
  assert.equal(outMeta.exif, undefined, 'EXIF must be stripped from the stored derivative');
});

test('ImageProcessor accepts WebP', async () => {
  const processor = new ImageProcessorService();
  const webp = await solid((s) => s.webp()).toBuffer();
  const result = await processor.process(webp);
  assert.equal(result.mime, 'image/webp');
});

test('ImageProcessor rejects SVG with UNSUPPORTED_IMAGE (415)', async () => {
  const processor = new ImageProcessorService();
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>');
  await assert.rejects(processor.process(svg), (e) => errorCode(e) === 'UNSUPPORTED_IMAGE');
});

test('ImageProcessor rejects GIF with UNSUPPORTED_IMAGE (415)', async () => {
  const processor = new ImageProcessorService();
  const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32)]);
  await assert.rejects(processor.process(gif), (e) => errorCode(e) === 'UNSUPPORTED_IMAGE');
});

test('ImageProcessor rejects oversized uploads with IMAGE_TOO_LARGE (413)', async () => {
  const processor = new ImageProcessorService();
  const tooBig = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
  tooBig[0] = 0xff;
  tooBig[1] = 0xd8;
  tooBig[2] = 0xff;
  await assert.rejects(processor.process(tooBig), (e) => errorCode(e) === 'IMAGE_TOO_LARGE');
});

test('ImageProcessor rejects garbage that sniffs as JPEG but fails to decode (422)', async () => {
  const processor = new ImageProcessorService();
  const fakeJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('not a real jpeg body')]);
  await assert.rejects(processor.process(fakeJpeg), (e) => errorCode(e) === 'MEDIA_INVALID');
});

interface StubStorage {
  putCalls: Array<{ key: string; contentType: string }>;
  signCalls: string[];
}

function makeService(record: MediaRecord | null) {
  const storage: StubStorage = { putCalls: [], signCalls: [] };
  const processor = {
    process: async () => ({
      buffer: Buffer.from('processed'),
      mime: 'image/jpeg' as const,
      extension: 'jpg' as const,
      sizeBytes: 9,
      sha256: 'a'.repeat(64),
      width: 16,
      height: 16,
    }),
  };
  const storageMock = {
    putObject: async (input: { key: string; contentType: string }) => {
      storage.putCalls.push({ key: input.key, contentType: input.contentType });
    },
    createSignedGetUrl: async (key: string) => {
      storage.signCalls.push(key);
      return { url: `https://r2.invalid/${key}?sig=x`, expiresAt: new Date('2026-09-25T00:05:00.000Z') };
    },
  };
  const repository = {
    createStored: async () => record!,
    findStoredForOwner: async (_mediaId: string, ownerId: string) =>
      record && record.ownerId === ownerId ? record : null,
  };
  const service = new MediaService(processor as never, storageMock as never, repository as never);
  return { service, storage };
}

const storedRecord: MediaRecord = {
  id: 'media-1',
  ownerId: 'owner-1',
  purpose: 'scan',
  objectKey: 'scan/owner-1/obj.jpg',
  mime: 'image/jpeg',
  sizeBytes: 9,
  expiresAt: new Date('2026-09-26T00:00:00.000Z'),
};

test('MediaService.upload stores the object and returns the contract Media view', async () => {
  const { service, storage } = makeService(storedRecord);
  const view = await service.upload('owner-1', 'scan', { buffer: Buffer.from('img') });

  assert.equal(view.id, 'media-1');
  assert.equal(view.mimeType, 'image/jpeg');
  assert.equal(view.sizeBytes, 9);
  assert.equal(view.expiresAt, '2026-09-26T00:00:00.000Z');
  assert.equal(storage.putCalls.length, 1);
  assert.match(storage.putCalls[0]!.key, /^scan\/owner-1\/[0-9a-f-]{36}\.jpg$/);
  assert.equal(storage.putCalls[0]!.contentType, 'image/jpeg');
});

test('MediaService.upload rejects a missing file with VALIDATION_ERROR', async () => {
  const { service } = makeService(storedRecord);
  await assert.rejects(service.upload('owner-1', 'scan', undefined), (e) => errorCode(e) === 'VALIDATION_ERROR');
});

test('MediaService.createReadUrl signs a URL for the owner', async () => {
  const { service, storage } = makeService(storedRecord);
  const result = await service.createReadUrl('owner-1', 'media-1');
  assert.match(result.url, /^https:\/\/r2\.invalid\//);
  assert.equal(result.expiresAt, '2026-09-25T00:05:00.000Z');
  assert.deepEqual(storage.signCalls, ['scan/owner-1/obj.jpg']);
});

test('MediaService.createReadUrl returns NOT_FOUND for a non-owner', async () => {
  const { service } = makeService(storedRecord);
  await assert.rejects(service.createReadUrl('someone-else', 'media-1'), (e) => errorCode(e) === 'NOT_FOUND');
});

