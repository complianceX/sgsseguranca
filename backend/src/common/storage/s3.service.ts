import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;
  private readonly useS3: boolean;

  constructor(private configService: ConfigService) {
    this.bucketName = this.configService.get<string>('AWS_S3_BUCKET') || '';
    this.region = this.configService.get<string>('AWS_REGION', 'us-east-1');
    this.useS3 = this.configService.get<boolean>('USE_S3', false);

    if (this.useS3) {
      this.s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId:
            this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
          secretAccessKey:
            this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
        },
      });
      this.logger.log(`S3 Service initialized with bucket: ${this.bucketName}`);
    } else {
      this.logger.warn('S3 is disabled. Using local storage.');
    }
  }

  /**
   * Upload file to S3
   */
  async uploadFile(
    key: string,
    file: Buffer | Readable,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<string> {
    if (!this.useS3) {
      throw new Error('S3 is not enabled');
    }

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file,
        ContentType: contentType,
        Metadata: metadata,
        // Cache control for CDN
        CacheControl: 'public, max-age=31536000', // 1 year
      });

      await this.s3Client.send(command);

      const url = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
      this.logger.log(`File uploaded successfully: ${key}`);

      return url;
    } catch (error) {
      this.logger.error(
        `Failed to upload file to S3: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get signed URL for private file access
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    if (!this.useS3) {
      throw new Error('S3 is not enabled');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      return url;
    } catch (error) {
      this.logger.error(
        `Failed to generate signed URL: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Download file from S3
   */
  async downloadFile(key: string): Promise<Buffer> {
    if (!this.useS3) {
      throw new Error('S3 is not enabled');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      const stream = response.Body as Readable;

      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      this.logger.error(
        `Failed to download file from S3: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Delete file from S3
   */
  async deleteFile(key: string): Promise<void> {
    if (!this.useS3) {
      throw new Error('S3 is not enabled');
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`File deleted successfully: ${key}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete file from S3: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(key: string): Promise<boolean> {
    if (!this.useS3) {
      throw new Error('S3 is not enabled');
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Generate S3 key for document
   */
  generateDocumentKey(
    companyId: string,
    documentType: string,
    documentId: string,
    filename: string,
  ): string {
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `documents/${companyId}/${documentType}/${documentId}/${timestamp}-${sanitizedFilename}`;
  }

  /**
   * Get public URL (for CDN)
   */
  getPublicUrl(key: string): string {
    if (!this.useS3) {
      throw new Error('S3 is not enabled');
    }

    // If using CloudFront, return CloudFront URL
    const cloudFrontDomain =
      this.configService.get<string>('CLOUDFRONT_DOMAIN');
    if (cloudFrontDomain) {
      return `https://${cloudFrontDomain}/${key}`;
    }

    // Otherwise return S3 URL
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
  }
}
