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

@Injectable()
export class StorageService {
  private s3Client: S3Client;
  private bucketName: string;
  private readonly logger = new Logger(StorageService.name);

  constructor(private configService: ConfigService) {
    this.bucketName = this.configService.get<string>('AWS_BUCKET_NAME') || '';

    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_REGION') || 'us-east-1',
      endpoint: this.configService.get<string>('AWS_ENDPOINT'),
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
        secretAccessKey:
          this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
      },
      forcePathStyle: true,
    });
  }

  async upload(
    key: string,
    body: PutObjectCommandInput['Body'],
    contentType: string,
  ): Promise<void> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      });

      await this.s3Client.send(command);
      this.logger.log(`Arquivo enviado com sucesso: ${key}`);
    } catch (error) {
      this.logger.error(`Erro ao enviar arquivo ${key}:`, error);
      throw error;
    }
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
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      this.logger.log(`Presigned Upload URL gerada para: ${key}`);
      return url;
    } catch (error) {
      this.logger.error(
        `Erro ao gerar presigned upload URL para ${key}:`,
        error,
      );
      throw error;
    }
  }

  async getPresignedDownloadUrl(
    key: string,
    expiresIn = 604800,
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      return url;
    } catch (error) {
      this.logger.error(
        `Erro ao gerar presigned download URL para ${key}:`,
        error,
      );
      throw error;
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await this.s3Client.send(command);
      this.logger.log(`Arquivo deletado: ${key}`);
    } catch (error) {
      this.logger.error(`Erro ao deletar arquivo ${key}:`, error);
      throw error;
    }
  }
}
