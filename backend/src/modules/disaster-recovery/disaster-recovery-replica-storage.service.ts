import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Readable } from 'stream';
import { resolveDrReplicaStorageConfig } from '../../shared/config/dr-replica-storage.config';
import { IntegrationResilienceService } from '../../shared/resilience/integration-resilience.service';
import { storageKeyFingerprint } from '../../shared/storage/storage-compensation.util';

const toBufferChunk = (chunk: Buffer | Uint8Array | string): Buffer =>
  Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

const isAsyncIterableBody = (
  value: unknown,
): value is AsyncIterable<Buffer | Uint8Array | string> =>
  typeof value === 'object' &&
  value !== null &&
  Symbol.asyncIterator in value &&
  typeof value[Symbol.asyncIterator] === 'function';

@Injectable()
export class DisasterRecoveryReplicaStorageService {
  private readonly logger = new Logger(
    DisasterRecoveryReplicaStorageService.name,
  );

  private readonly bucketName: string | null;
  private readonly endpoint: string | null;
  private readonly region: string;
  private readonly forcePathStyle: boolean;
  private readonly configured: boolean;
  private readonly client: S3Client;

  constructor(
    private readonly configService: ConfigService,
    private readonly integration: IntegrationResilienceService,
  ) {
    // ConfigModule/Joi may already coerce booleans before ConfigService returns
    // them. Read as unknown and let the shared resolver validate each field
    // according to its real contract instead of trusting a TypeScript generic.
    const replica = resolveDrReplicaStorageConfig((key) =>
      this.configService.get<unknown>(key),
    );

    this.bucketName = replica.bucketName;
    this.endpoint = replica.endpoint;
    this.region = replica.region;
    this.forcePathStyle = replica.forcePathStyle;
    this.configured = replica.configured;

    this.client = new S3Client({
      region: this.region,
      endpoint: this.endpoint || undefined,
      credentials: {
        accessKeyId: replica.accessKeyId,
        secretAccessKey: replica.secretAccessKey,
      },
      forcePathStyle: this.forcePathStyle,
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 2_000,
        socketTimeout: 15_000,
      }),
      maxAttempts: 3,
    });
  }

  isConfigured(): boolean {
    return this.configured;
  }

  getConfigurationSummary(): {
    configured: boolean;
    bucketName: string | null;
    endpoint: string | null;
  } {
    return {
      configured: this.configured,
      bucketName: this.bucketName,
      endpoint: this.endpoint,
    };
  }

  async fileExists(key: string): Promise<boolean> {
    this.assertConfigured();

    try {
      await this.integration.execute(
        'dr_storage_replica_head_object',
        () =>
          this.client.send(
            new HeadObjectCommand({
              Bucket: this.bucketName!,
              Key: key,
            }),
          ),
        { timeoutMs: 10_000 },
      );
      return true;
    } catch (error) {
      const statusCode = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  async listKeys(prefix: string): Promise<string[]> {
    this.assertConfigured();

    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const result = await this.integration.execute(
        'dr_storage_replica_list_objects',
        () =>
          this.client.send(
            new ListObjectsV2Command({
              Bucket: this.bucketName!,
              Prefix: prefix,
              ContinuationToken: continuationToken,
            }),
          ),
        { timeoutMs: 15_000 },
      );

      for (const object of result.Contents || []) {
        if (object.Key) {
          keys.push(object.Key);
        }
      }
      continuationToken = result.IsTruncated
        ? result.NextContinuationToken
        : undefined;
    } while (continuationToken);

    return keys;
  }

  async putObject(key: string, body: Buffer): Promise<void> {
    this.assertConfigured();

    await this.integration.execute(
      'dr_storage_replica_put_object',
      () =>
        this.client.send(
          new PutObjectCommand({
            Bucket: this.bucketName!,
            Key: key,
            Body: body,
          }),
        ),
      { timeoutMs: 30_000 },
    );

    this.logger.log(
      JSON.stringify({
        event: 'dr_storage_replica_write',
        keyFingerprint: storageKeyFingerprint(key),
        bytes: body.length,
      }),
    );
  }

  async readObject(key: string): Promise<Buffer> {
    this.assertConfigured();

    const result = await this.integration.execute(
      'dr_storage_replica_get_object',
      () =>
        this.client.send(
          new GetObjectCommand({
            Bucket: this.bucketName!,
            Key: key,
          }),
        ),
      { timeoutMs: 30_000 },
    );

    if (!result.Body) {
      throw new Error('DR replica object body is empty');
    }

    if (result.Body instanceof Readable) {
      const chunks: Buffer[] = [];
      for await (const chunk of result.Body) {
        chunks.push(toBufferChunk(chunk));
      }
      return Buffer.concat(chunks);
    }

    if (isAsyncIterableBody(result.Body)) {
      const chunks: Buffer[] = [];
      for await (const chunk of result.Body) {
        chunks.push(toBufferChunk(chunk));
      }
      return Buffer.concat(chunks);
    }

    if ('transformToByteArray' in result.Body) {
      const bytes = await result.Body.transformToByteArray();
      return Buffer.from(bytes);
    }

    throw new Error('Unsupported DR replica object body type');
  }

  private assertConfigured(): void {
    if (!this.configured || !this.bucketName) {
      throw new Error('DR replica storage is not configured');
    }
  }
}
