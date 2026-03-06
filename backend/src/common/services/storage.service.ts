import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import type { PutObjectCommandInput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { IntegrationResilienceService } from '../resilience/integration-resilience.service';
import { NodeHttpHandler } from '@smithy/node-http-handler';

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
}
