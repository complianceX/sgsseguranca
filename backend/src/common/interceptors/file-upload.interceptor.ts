import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { open } from 'fs/promises';

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

  return null;
}

export const fileUploadOptions: MulterOptions = {
  storage: memoryStorage(),
  fileFilter: (req, file, cb) => {
    // A validação real será feita após upload usando magic bytes.
    cb(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
};

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
  return {
    storage: memoryStorage(),
    limits: {
      fileSize: maxFileSize,
    },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype !== 'application/pdf') {
        return cb(null, false);
      }

      cb(null, true);
    },
  };
}

export function assertUploadedPdf(
  file: Express.Multer.File | undefined,
  missingFileMessage = 'Nenhum arquivo enviado',
): Express.Multer.File {
  if (!file) {
    throw new BadRequestException(missingFileMessage);
  }

  if (file.mimetype !== 'application/pdf') {
    throw new BadRequestException('Apenas arquivos PDF são permitidos');
  }

  if (!file.buffer || file.buffer.length === 0) {
    throw new BadRequestException('Falha ao ler o arquivo enviado.');
  }

  validatePdfMagicBytes(file.buffer);
  return file;
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
