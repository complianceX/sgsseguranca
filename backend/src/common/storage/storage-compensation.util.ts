import { Logger } from '@nestjs/common';

export function isS3DisabledUploadError(error: unknown): boolean {
  return error instanceof Error && error.message === 'S3 is not enabled';
}

export async function cleanupUploadedFile(
  logger: Logger,
  context: string,
  fileKey: string,
  deleteFile: (key: string) => Promise<void>,
): Promise<void> {
  try {
    await deleteFile(fileKey);
  } catch (cleanupError) {
    logger.error(
      `Falha ao limpar arquivo após erro de governança em ${context}: ${fileKey}`,
      cleanupError instanceof Error ? cleanupError.stack : undefined,
    );
  }
}
