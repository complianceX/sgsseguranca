import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';
import * as path from 'path';
import * as crypto from 'crypto';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { open } from 'fs/promises';

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

export async function validateFileMagicBytes(
  buffer: Buffer,
  allowedMimes: string[] = ['application/pdf', 'image/jpeg', 'image/png'],
) {
  const sample = buffer.slice(0, 4100);
  const { fileTypeFromBuffer } = await import('file-type');
  const detectedType = await fileTypeFromBuffer(sample);
  if (!detectedType || !allowedMimes.includes(detectedType.mime)) {
    throw new BadRequestException('Tipo de arquivo não permitido');
  }
}

export async function validatePdfMagicBytes(buffer: Buffer) {
  return validateFileMagicBytes(buffer, ['application/pdf']);
}

export async function validatePdfMagicBytesFromPath(filePath: string) {
  const handle = await open(filePath, 'r');
  try {
    const sample = Buffer.alloc(4100);
    const { bytesRead } = await handle.read(sample, 0, sample.length, 0);
    return validatePdfMagicBytes(sample.slice(0, bytesRead));
  } finally {
    await handle.close().catch(() => undefined);
  }
}
