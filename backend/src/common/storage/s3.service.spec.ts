import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { S3Service } from './s3.service';

type MockS3ClientInstance = {
  send: typeof mockS3ClientSend;
};

const mockS3ClientSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(function (this: MockS3ClientInstance) {
    this.send = mockS3ClientSend;
  }),
  PutObjectCommand: jest
    .fn()
    .mockImplementation(
      (input: Record<string, unknown>): Record<string, unknown> => input,
    ),
  GetObjectCommand: jest
    .fn()
    .mockImplementation(
      (input: Record<string, unknown>): Record<string, unknown> => input,
    ),
  DeleteObjectCommand: jest
    .fn()
    .mockImplementation(
      (input: Record<string, unknown>): Record<string, unknown> => input,
    ),
  HeadObjectCommand: jest
    .fn()
    .mockImplementation(
      (input: Record<string, unknown>): Record<string, unknown> => input,
    ),
}));

describe('S3Service', () => {
  const createConfigService = (
    values: Record<string, string | undefined> = {},
  ): ConfigService =>
    ({
      get: jest.fn((key: string, defaultValue?: string) => {
        const value = values[key];
        return value === undefined ? defaultValue : value;
      }),
    }) as unknown as ConfigService;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('habilita S3 quando existe bucket legado mesmo sem USE_S3', async () => {
    mockS3ClientSend.mockResolvedValue({});
    const service = new S3Service(
      createConfigService({
        AWS_S3_BUCKET: 'legacy-bucket',
        AWS_REGION: 'us-east-1',
        AWS_S3_ENDPOINT: 'https://r2.example.com',
        AWS_ACCESS_KEY_ID: 'test-key',
        AWS_SECRET_ACCESS_KEY: 'test-secret',
      }),
    );

    await expect(
      service.uploadFile(
        'documents/company/video.mp4',
        Buffer.from('video'),
        'video/mp4',
      ),
    ).resolves.toContain('legacy-bucket');

    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'us-east-1',
        endpoint: 'https://r2.example.com',
        forcePathStyle: true,
        credentials: {
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
        },
      }),
    );
  });

  it('prioriza o storage governado quando as envs legadas ainda existem', async () => {
    mockS3ClientSend.mockResolvedValue({});
    const service = new S3Service(
      createConfigService({
        AWS_BUCKET_NAME: 'managed-bucket',
        AWS_S3_BUCKET: 'legacy-bucket',
        AWS_REGION: 'us-east-1',
        AWS_ENDPOINT: 'https://managed.example.com',
        AWS_S3_ENDPOINT: 'https://legacy.example.com',
        AWS_ACCESS_KEY_ID: 'test-key',
        AWS_SECRET_ACCESS_KEY: 'test-secret',
      }),
    );

    await expect(
      service.uploadFile(
        'documents/company/video.mp4',
        Buffer.from('video'),
        'video/mp4',
      ),
    ).resolves.toContain('managed-bucket');

    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'us-east-1',
        endpoint: 'https://managed.example.com',
        forcePathStyle: true,
        credentials: {
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
        },
      }),
    );
  });

  it('permanece desabilitado quando não há bucket configurado', async () => {
    const service = new S3Service(createConfigService());

    await expect(
      service.uploadFile(
        'documents/company/video.mp4',
        Buffer.from('video'),
        'video/mp4',
      ),
    ).rejects.toThrow('S3 is not enabled');
  });
});
