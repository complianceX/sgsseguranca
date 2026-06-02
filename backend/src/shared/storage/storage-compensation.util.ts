import { Logger } from '@nestjs/common';

export function isS3DisabledUploadError(error: unknown): boolean {
  return error instanceof Error && error.message === 'S3 is not enabled';
}

export type StorageCleanupCompensationResult = {
  attempted: boolean;
  cleaned: boolean;
  context: string;
  fileKey: string;
  errorMessage?: string;
};

export async function cleanupUploadedFile(
  logger: Logger,
  context: string,
  fileKey: string,
  deleteFile: (key: string) => Promise<void>,
): Promise<StorageCleanupCompensationResult> {
  try {
    await deleteFile(fileKey);
    logger.log({
      event: 'storage_cleanup_succeeded',
      context,
      fileKey,
    });
    return {
      attempted: true,
      cleaned: true,
      context,
      fileKey,
    };
  } catch (cleanupError) {
    const errorMessage =
      cleanupError instanceof Error
        ? cleanupError.message
        : String(cleanupError);
    logger.error(
      {
        event: 'storage_cleanup_failed',
        context,
        fileKey,
        errorMessage,
      },
      cleanupError instanceof Error ? cleanupError.stack : undefined,
    );
    return {
      attempted: true,
      cleaned: false,
      context,
      fileKey,
      errorMessage,
    };
  }
}
