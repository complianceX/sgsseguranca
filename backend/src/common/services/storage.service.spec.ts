import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service';
import { ConfigService } from '@nestjs/config';
import { CircuitBreakerService } from '../resilience/circuit-breaker.service';
import { RetryService } from '../resilience/retry.service';
import { IntegrationResilienceService } from '../resilience/integration-resilience.service';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

type TestConfigKey =
  | 'AWS_BUCKET_NAME'
  | 'AWS_S3_BUCKET'
  | 'AWS_REGION'
  | 'AWS_ENDPOINT'
  | 'AWS_S3_ENDPOINT'
  | 'AWS_ACCESS_KEY_ID'
  | 'AWS_SECRET_ACCESS_KEY';

type MockS3ClientInstance = {
  send: typeof mockS3ClientSend;
};

// Mock das dependências do AWS SDK
const mockS3ClientSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => {
  // Mock dos construtores dos comandos
  return {
    S3Client: jest.fn().mockImplementation(function (
      this: MockS3ClientInstance,
    ) {
      // instancia real do mock (this) recebe o método send
      this.send = mockS3ClientSend;
    }),
    PutObjectCommand: jest.fn(),
    GetObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

// Mocks com tipos para melhor autocompletar e segurança
const mockedS3Client = S3Client as jest.MockedClass<typeof S3Client>;
const mockedPutObjectCommand = PutObjectCommand as unknown as jest.Mock;
const mockedGetObjectCommand = GetObjectCommand as unknown as jest.Mock;
const mockedDeleteObjectCommand = DeleteObjectCommand as unknown as jest.Mock;
const mockedGetSignedUrl = getSignedUrl as jest.Mock;

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        CircuitBreakerService,
        RetryService,
        IntegrationResilienceService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<TestConfigKey, string> = {
                AWS_BUCKET_NAME: 'test-bucket',
                AWS_S3_BUCKET: '',
                AWS_REGION: 'us-east-1',
                AWS_ENDPOINT: 'http://localhost:4566',
                AWS_S3_ENDPOINT: '',
                AWS_ACCESS_KEY_ID: 'test-key',
                AWS_SECRET_ACCESS_KEY: 'test-secret',
              };
              return config[key as TestConfigKey];
            }),
          },
        },
      ],
    }).compile();
    service = module.get<StorageService>(StorageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve estar definido', () => {
    expect(service).toBeDefined();
  });

  it('deve inicializar o S3Client com as configurações corretas', () => {
    // Acessa a instância criada no construtor do serviço
    expect(mockedS3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'us-east-1',
        endpoint: 'http://localhost:4566',
        credentials: {
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
        },
        forcePathStyle: true,
        maxAttempts: 3,
      }),
    );
  });

  it('prioriza AWS_BUCKET_NAME/AWS_ENDPOINT sobre envs legadas', async () => {
    jest.clearAllMocks();

    await Test.createTestingModule({
      providers: [
        StorageService,
        CircuitBreakerService,
        RetryService,
        IntegrationResilienceService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<TestConfigKey, string> = {
                AWS_BUCKET_NAME: 'managed-bucket',
                AWS_S3_BUCKET: 'legacy-bucket',
                AWS_REGION: 'us-east-1',
                AWS_ENDPOINT: 'https://managed.example.com',
                AWS_S3_ENDPOINT: 'https://legacy.example.com',
                AWS_ACCESS_KEY_ID: 'test-key',
                AWS_SECRET_ACCESS_KEY: 'test-secret',
              };
              return config[key as TestConfigKey];
            }),
          },
        },
      ],
    }).compile();

    expect(mockedS3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'us-east-1',
        endpoint: 'https://managed.example.com',
        credentials: {
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
        },
      }),
    );
  });

  describe('getPresignedUploadUrl', () => {
    it('deve gerar uma URL pré-assinada de upload (PUT) e chamar os comandos corretos', async () => {
      const key = 'uploads/teste.pdf';
      const contentType = 'application/pdf';
      const mockUrl = 'https://s3.amazonaws.com/presigned-url-mock-put';
      mockedGetSignedUrl.mockResolvedValue(mockUrl);

      const url = await service.getPresignedUploadUrl(key, contentType);

      expect(mockedPutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: key,
        ContentType: contentType,
      });
      expect(mockedGetSignedUrl).toHaveBeenCalledWith(
        mockedS3Client.mock.instances[0],
        expect.any(Object),
        { expiresIn: 3600 },
      );
      expect(url).toBe(mockUrl);
    });

    it('deve lançar um erro se a geração da URL falhar', async () => {
      const error = new Error('AWS SDK error');
      mockedGetSignedUrl.mockRejectedValue(error);

      await expect(
        service.getPresignedUploadUrl('key', 'type'),
      ).rejects.toThrow(error);
    });
  });

  describe('getPresignedDownloadUrl', () => {
    it('deve gerar uma URL pré-assinada de download (GET) e chamar os comandos corretos', async () => {
      const key = 'uploads/teste.pdf';
      const mockUrl = 'https://s3.amazonaws.com/presigned-url-mock-get';
      mockedGetSignedUrl.mockResolvedValue(mockUrl);

      const url = await service.getPresignedDownloadUrl(key);

      expect(mockedGetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: key,
        ResponseCacheControl: 'private, no-store',
        ResponseContentDisposition: 'attachment',
      });
      expect(mockedGetSignedUrl).toHaveBeenCalledWith(
        mockedS3Client.mock.instances[0],
        expect.any(Object),
        { expiresIn: 900 },
      );
      expect(url).toBe(mockUrl);
    });

    it('deve reservar o TTL de 4h apenas para o fluxo explícito de e-mail', async () => {
      const key = 'uploads/teste.pdf';
      const mockUrl = 'https://s3.amazonaws.com/presigned-url-mock-get';
      mockedGetSignedUrl.mockResolvedValue(mockUrl);

      const url = await service.getEmailLinkPresignedDownloadUrl(key);

      expect(mockedGetSignedUrl).toHaveBeenCalledWith(
        mockedS3Client.mock.instances[0],
        expect.any(Object),
        { expiresIn: 14400 },
      );
      expect(url).toBe(mockUrl);
    });

    it('deve lançar um erro se a geração da URL falhar', async () => {
      const error = new Error('AWS SDK error');
      mockedGetSignedUrl.mockRejectedValue(error);

      await expect(service.getPresignedDownloadUrl('key')).rejects.toThrow(
        error,
      );
    });
  });

  describe('deleteFile', () => {
    it('deve chamar o comando de deletar objeto com a chave correta', async () => {
      const key = 'uploads/arquivo-para-deletar.txt';
      mockS3ClientSend.mockResolvedValue({}); // Simula uma resposta de sucesso do S3

      await service.deleteFile(key);

      expect(mockedDeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: key,
      });
      expect(mockS3ClientSend).toHaveBeenCalledWith(expect.any(Object));
    });

    it('deve lançar um erro se a deleção do arquivo falhar', async () => {
      const error = new Error('AWS SDK error on delete');
      mockS3ClientSend.mockRejectedValue(error);

      await expect(service.deleteFile('key')).rejects.toThrow(error);
    });
  });
});
