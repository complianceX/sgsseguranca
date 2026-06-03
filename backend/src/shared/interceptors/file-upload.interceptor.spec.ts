import { mkdir, access, writeFile, utimes } from 'fs/promises';
import * as path from 'path';
import {
  assertUploadedPdf,
  assertUploadedVideo,
  cleanupStaleTempUploads,
  cleanupUploadedTempFile,
  inspectUploadedFileBuffer,
  readUploadedFileBuffer,
  resetTempUploadCleanupStateForTests,
  validateFileMagicBytes,
} from './file-upload.interceptor';

describe('file-upload.interceptor helpers', () => {
  const tempDir = path.join(process.cwd(), 'temp');

  afterEach(() => {
    resetTempUploadCleanupStateForTests();
  });

  it('reuses the in-memory multer buffer when available', async () => {
    const buffer = Buffer.from('%PDF-1.4\nbody\n%%EOF');
    const file = {
      buffer,
      mimetype: 'application/pdf',
      originalname: 'memory.pdf',
      size: buffer.length,
    } as Express.Multer.File;

    const resolved = await readUploadedFileBuffer(file);

    expect(resolved).toBe(buffer);
  });

  it('hydrates PDF buffer from a temporary disk file and cleans it up', async () => {
    await mkdir(tempDir, { recursive: true });
    const filePath = path.join(
      tempDir,
      `jest-upload-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`,
    );
    const buffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
    await writeFile(filePath, buffer);

    const file = {
      path: filePath,
      mimetype: 'application/pdf',
      originalname: 'disk.pdf',
      size: buffer.length,
    } as Express.Multer.File;

    const asserted = await assertUploadedPdf(file);

    expect(asserted.buffer).toBeDefined();
    expect(asserted.buffer.equals(buffer)).toBe(true);

    await cleanupUploadedTempFile(asserted);

    await expect(access(filePath)).rejects.toThrow();
  });

  it('inspects PDF uploads after magic byte validation when inspection is provided', async () => {
    const buffer = Buffer.from('%PDF-1.4\nbody\n%%EOF');
    const file = {
      buffer,
      mimetype: 'application/pdf',
      originalname: 'inspected.pdf',
      size: buffer.length,
    } as Express.Multer.File;
    const inspection = {
      inspect: jest.fn().mockResolvedValue({ clean: true }),
    };

    await expect(assertUploadedPdf(file, undefined, inspection)).resolves.toBe(
      file,
    );

    expect(inspection.inspect).toHaveBeenCalledWith(buffer, 'inspected.pdf');
  });

  it('inspects video uploads after magic byte validation when inspection is provided', async () => {
    const buffer = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from('ftypisom', 'ascii'),
      Buffer.alloc(16),
    ]);
    const file = {
      buffer,
      mimetype: 'video/mp4',
      originalname: 'inspected.mp4',
      size: buffer.length,
    } as Express.Multer.File;
    const inspection = {
      inspect: jest.fn().mockResolvedValue({ clean: true }),
    };

    await expect(
      assertUploadedVideo(file, undefined, inspection),
    ).resolves.toBe(file);

    expect(inspection.inspect).toHaveBeenCalledWith(buffer, 'inspected.mp4');
  });

  it('propagates inspection failures for generic uploaded buffers', async () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    const file = { originalname: 'blocked.jpg' } as Express.Multer.File;
    const error = new Error('scanner unavailable');
    const inspection = { inspect: jest.fn().mockRejectedValue(error) };

    await expect(
      inspectUploadedFileBuffer(buffer, file, inspection),
    ).rejects.toThrow('scanner unavailable');
  });

  it('recognizes webp magic bytes for safe image uploads', () => {
    const webpHeader = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x2a, 0x00, 0x00, 0x00]),
      Buffer.from('WEBP', 'ascii'),
      Buffer.from('VP8 ', 'ascii'),
    ]);

    expect(() =>
      validateFileMagicBytes(webpHeader, ['image/webp']),
    ).not.toThrow();
  });

  it('removes stale temporary uploads and preserves fresh files', async () => {
    await mkdir(tempDir, { recursive: true });
    const staleFilePath = path.join(
      tempDir,
      `jest-stale-upload-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`,
    );
    const freshFilePath = path.join(
      tempDir,
      `jest-fresh-upload-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`,
    );
    const buffer = Buffer.from('%PDF-1.4\ncleanup-test\n%%EOF');
    const now = Date.now();
    const staleTimestamp = new Date(now - 10 * 60 * 1000);
    const freshTimestamp = new Date(now - 5 * 1000);
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    await writeFile(staleFilePath, buffer);
    await writeFile(freshFilePath, buffer);
    await utimes(staleFilePath, staleTimestamp, staleTimestamp);
    await utimes(freshFilePath, freshTimestamp, freshTimestamp);

    const result = await cleanupStaleTempUploads({
      directory: tempDir,
      ttlMs: 60 * 1000,
      now,
      logger,
    });

    await expect(access(staleFilePath)).rejects.toThrow();
    await expect(access(freshFilePath)).resolves.toBeUndefined();
    expect(result.removedFiles).toBeGreaterThanOrEqual(1);
    expect(result.failedFiles).toBe(0);
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'temp_upload_cleanup_completed',
        removedFiles: result.removedFiles,
      }),
    );

    await cleanupUploadedTempFile({
      path: freshFilePath,
    } as Express.Multer.File);
  });
});
