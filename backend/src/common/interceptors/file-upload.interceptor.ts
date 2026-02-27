import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';
import * as path from 'path';
import * as crypto from 'crypto';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

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

export async function validateFileMagicBytes(buffer: Buffer) {
  const sample = buffer.slice(0, 4100);
  const { fileTypeFromBuffer } = await import('file-type');
  const detectedType = await fileTypeFromBuffer(sample);
  const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
  if (!detectedType || !ALLOWED_TYPES.includes(detectedType.mime)) {
    throw new BadRequestException('Tipo de arquivo não permitido');
  }
}
