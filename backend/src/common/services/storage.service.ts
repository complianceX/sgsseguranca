import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import type { PutObjectCommandInput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { IntegrationResilienceService } from '../resilience/integration-resilience.service';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Readable } from 'stream';

type ByteArrayTransformable = {
  transformToByteArray: () => Promise<Uint8Array>;
};

const isByteArrayTransformable = (
  value: unknown,
): value is ByteArrayTransformable =>
  typeof value === 'object' &&
  value !== null &&
  'transformToByteArray' in value &&
  typeof value.transformToByteArray === 'function';

const isAsyncIterableBody = (
  value: unknown,
): value is AsyncIterable<Buffer | Uint8Array | string> =>
  typeof value === 'object' &&
  value !== null &&
  Symbol.asyncIterator in value &&
  typeof value[Symbol.asyncIterator] === 'function';

const isReadableBody = (
  value: unknown,
): value is Readable & AsyncIterable<Buffer | Uint8Array | string> =>
  value instanceof Readable;

const toBufferChunk = (chunk: Buffer | Uint8Array | string): Buffer =>
  Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

@Injectable()
export class StorageService {
  private s3Client: S3Client;
  private bucketName: string;
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private configService: ConfigService,
    private readonly integration: IntegrationResilienceService,
  ) {
    this.bucketName = this.configService.get<string>('AWS_BUCKET_NAME') || '';

    const socketTimeoutMs = Number(
      this.configService.get<string>('S3_SOCKET_TIMEOUT_MS') || 10000,
    );
    const connectionTimeoutMs = Number(
      this.configService.get<string>('S3_CONNECTION_TIMEOUT_MS') || 2000,
    );
    const maxAttempts = Number(
      this.configService.get<string>('S3_MAX_ATTEMPTS') || 3,
    );

    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_REGION') || 'us-east-1',
      endpoint: this.configService.get<string>('AWS_ENDPOINT'),
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
        secretAccessKey:
          this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
      },
      forcePathStyle: true,
      requestHandler: new NodeHttpHandler({
        connectionTimeout: connectionTimeoutMs,
        socketTimeout: socketTimeoutMs,
      }),
      maxAttempts: Number.isFinite(maxAttempts) ? maxAttempts : 3,
    });
  }

  async upload(
    key: string,
    body: PutObjectCommandInput['Body'],
    contentType: string,
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    await this.integration.execute('s3', () => this.s3Client.send(command), {
      timeoutMs: 30_000,
    });

    this.logger.log(`Arquivo enviado com sucesso: ${key}`);
  }

  async uploadFile(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    return this.upload(key, buffer, contentType);
  }

  async uploadPdf(buffer: Buffer, userId: string): Promise<string> {
    const safeUserId = String(userId || '').trim();
    if (!safeUserId) {
      throw new Error('userId é obrigatório para uploadPdf');
    }
    const key = `reports/${safeUserId}/${Date.now()}.pdf`;
    await this.uploadFile(key, buffer, 'application/pdf');
    return this.getPresignedDownloadUrl(key);
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 3600,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    const url = await this.integration.execute(
      's3_presign_put',
      () => getSignedUrl(this.s3Client, command, { expiresIn }),
      { timeoutMs: 10_000 },
    );

    this.logger.log(`Presigned Upload URL gerada para: ${key}`);
    return url;
  }

  async getPresignedDownloadUrl(
    key: string,
    expiresIn = 604800,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return this.integration.execute(
      's3_presign_get',
      () => getSignedUrl(this.s3Client, command, { expiresIn }),
      { timeoutMs: 10_000 },
    );
  }

  async downloadFileBuffer(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    const response = await this.integration.execute(
      's3_get_object',
      () => this.s3Client.send(command),
      { timeoutMs: 30_000 },
    );

    const body: unknown = response.Body;

    if (!body) {
      throw new Error(`Arquivo não encontrado no storage: ${key}`);
    }

    if (isByteArrayTransformable(body)) {
      const bytes = await body.transformToByteArray();
      return Buffer.from(bytes);
    }

    if (isReadableBody(body)) {
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(toBufferChunk(chunk));
      }
      return Buffer.concat(chunks);
    }

    if (isAsyncIterableBody(body)) {
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(toBufferChunk(chunk));
      }
      return Buffer.concat(chunks);
    }

    throw new Error(`Tipo de resposta de download não suportado para: ${key}`);
  }

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.integration.execute(
      's3_delete',
      () => this.s3Client.send(command),
      {
        timeoutMs: 10_000,
      },
    );

    this.logger.log(`Arquivo deletado: ${key}`);
  }

  async fileExists(key: string): Promise<boolean> {
    const command = new HeadObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      await this.integration.execute(
        's3_head_object',
        () => this.s3Client.send(command),
        { timeoutMs: 10_000 },
      );
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'NotFound' ||
          error.name === 'NoSuchKey' ||
          error.name === 'UnknownError')
      ) {
        return false;
      }

      const candidate = error as { $metadata?: { httpStatusCode?: number } };
      if (candidate.$metadata?.httpStatusCode === 404) {
        return false;
      }

      throw error;
    }
  }

  async listKeys(
    prefix: string,
    options?: { maxKeys?: number },
  ): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    const maxKeys = options?.maxKeys;

    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys:
          maxKeys && maxKeys > 0
            ? Math.min(1000, Math.max(1, maxKeys - keys.length))
            : undefined,
      });

      const response = await this.integration.execute(
        's3_list_objects',
        () => this.s3Client.send(command),
        { timeoutMs: 30_000 },
      );

      for (const object of response.Contents || []) {
        if (object.Key) {
          keys.push(object.Key);
        }
      }

      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (
      continuationToken &&
      (!maxKeys || maxKeys <= 0 || keys.length < maxKeys)
    );

    return maxKeys && maxKeys > 0 ? keys.slice(0, maxKeys) : keys;
  }
}
