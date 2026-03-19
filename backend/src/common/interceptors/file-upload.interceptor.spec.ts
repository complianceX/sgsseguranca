import { mkdir, access, writeFile } from 'fs/promises';
import * as path from 'path';
import {
  assertUploadedPdf,
  cleanupUploadedTempFile,
  readUploadedFileBuffer,
  validateFileMagicBytes,
} from './file-upload.interceptor';

describe('file-upload.interceptor helpers', () => {
  const tempDir = path.join(process.cwd(), 'temp');

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
});
