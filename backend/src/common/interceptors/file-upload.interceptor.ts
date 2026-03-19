import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { mkdirSync } from 'fs';
import { open, readFile, unlink } from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

const TEMP_UPLOAD_DIR = path.join(process.cwd(), 'temp');

type UploadLogger = {
  warn: (message: string) => void;
};

function ensureTempUploadDir(): string {
  mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
  return TEMP_UPLOAD_DIR;
}

function sanitizeExtension(originalName?: string): string {
  const extension = path.extname(String(originalName || '')).toLowerCase();
  return extension.replace(/[^a-z0-9._-]/g, '').slice(0, 12);
}

function createTempFilename(originalName?: string): string {
  const extension = sanitizeExtension(originalName);
  return `${Date.now()}-${randomUUID()}${extension}`;
}

function detectMimeFromMagicBytes(buffer: Buffer): string | null {
  if (
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString('ascii') === '%PDF-'
  ) {
    return 'application/pdf';
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
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
    return 'image/png';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

export function createTemporaryUploadOptions(options?: {
  maxFileSize?: number;
  fileFilter?: MulterOptions['fileFilter'];
}): MulterOptions {
  return {
    storage: diskStorage({
      destination: (_req, _file, cb) => cb(null, ensureTempUploadDir()),
      filename: (_req, file, cb) =>
        cb(null, createTempFilename(file.originalname)),
    }),
    fileFilter:
      options?.fileFilter ||
      ((_req, _file, cb) => {
        cb(null, true);
      }),
    limits: {
      fileSize: options?.maxFileSize ?? 10 * 1024 * 1024,
    },
  };
}

export const fileUploadOptions: MulterOptions = createTemporaryUploadOptions();

export function validateFileMagicBytes(
  buffer: Buffer,
  allowedMimes: string[] = ['application/pdf', 'image/jpeg', 'image/png'],
): void {
  const sample = buffer.slice(0, 4100);
  const detectedMime = detectMimeFromMagicBytes(sample);
  if (!detectedMime || !allowedMimes.includes(detectedMime)) {
    throw new BadRequestException('Tipo de arquivo não permitido');
  }
}

export function validatePdfMagicBytes(buffer: Buffer): void {
  return validateFileMagicBytes(buffer, ['application/pdf']);
}

export function createGovernedPdfUploadOptions(
  maxFileSize = 20 * 1024 * 1024,
): MulterOptions {
  return createTemporaryUploadOptions({
    maxFileSize,
    fileFilter: (_req, file, cb) => {
      if (file.mimetype !== 'application/pdf') {
        return cb(null, false);
      }

      cb(null, true);
    },
  });
}

export async function readUploadedFileBuffer(
  file: Express.Multer.File | undefined,
  missingFileMessage = 'Nenhum arquivo enviado',
): Promise<Buffer> {
  if (!file) {
    throw new BadRequestException(missingFileMessage);
  }

  if (file.buffer && file.buffer.length > 0) {
    return file.buffer;
  }

  if (file.path) {
    const buffer = await readFile(file.path);
    if (buffer.length === 0) {
      throw new BadRequestException('Falha ao ler o arquivo enviado.');
    }

    file.buffer = buffer;
    return buffer;
  }

  throw new BadRequestException('Falha ao ler o arquivo enviado.');
}

export async function assertUploadedPdf(
  file: Express.Multer.File | undefined,
  missingFileMessage = 'Nenhum arquivo enviado',
): Promise<Express.Multer.File> {
  if (!file) {
    throw new BadRequestException(missingFileMessage);
  }

  if (file.mimetype !== 'application/pdf') {
    throw new BadRequestException('Apenas arquivos PDF são permitidos');
  }

  const buffer = await readUploadedFileBuffer(file, missingFileMessage);
  validatePdfMagicBytes(buffer);
  return file;
}

export async function cleanupUploadedTempFile(
  file: Express.Multer.File | undefined,
  logger?: UploadLogger,
): Promise<void> {
  if (!file?.path) {
    return;
  }

  await unlink(file.path).catch((error) => {
    logger?.warn(
      `Falha ao remover arquivo temporário ${file.path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });
}

export async function validatePdfMagicBytesFromPath(filePath: string) {
  const handle = await open(filePath, 'r');
  try {
    const sample = Buffer.alloc(4100);
    const { bytesRead } = await handle.read(sample, 0, sample.length, 0);
    validatePdfMagicBytes(sample.slice(0, bytesRead));
  } finally {
    await handle.close().catch(() => undefined);
  }
}
