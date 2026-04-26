/**
 * Fase 3 — Testes P1: StorageService
 *
 * 1. getPresignedDownloadUrl usa TTL padrão interno de 900s
 * 2. GetObjectCommand inclui ResponseCacheControl e ResponseContentDisposition
 */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { IntegrationResilienceService } from '../resilience/integration-resilience.service';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.example.com/presigned'),
}));

const mockIntegration = {
  execute: jest.fn((_name: string, fn: () => unknown) => fn()),
};

async function buildService(): Promise<StorageService> {
  const module = await Test.createTestingModule({
    providers: [
      StorageService,
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) => {
            const map: Record<string, string> = {
              AWS_BUCKET_NAME: 'test-bucket',
              AWS_REGION: 'us-east-1',
            };
            return map[key] ?? undefined;
          },
        },
      },
      { provide: IntegrationResilienceService, useValue: mockIntegration },
    ],
  }).compile();

  return module.get(StorageService);
}

describe('StorageService — P1: getPresignedDownloadUrl', () => {
  let service: StorageService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await buildService();
  });

  it('usa TTL padrão interno de 900s', async () => {
    await service.getPresignedDownloadUrl('documents/tenant/file.pdf');

    const [, , opts] = (getSignedUrl as jest.Mock).mock.calls[0] as [
      unknown,
      unknown,
      { expiresIn: number },
    ];
    expect(opts.expiresIn).toBe(900);
  });

  it('TTL explícito interno acima de 900s é capado em 900s', async () => {
    await service.getPresignedDownloadUrl('documents/tenant/file.pdf', 1800);

    const [, , opts] = (getSignedUrl as jest.Mock).mock.calls[0] as [
      unknown,
      unknown,
      { expiresIn: number },
    ];
    expect(opts.expiresIn).toBe(900);
  });

  it('fluxo explícito de e-mail permite TTL de até 4h', async () => {
    await service.getEmailLinkPresignedDownloadUrl(
      'documents/tenant/file.pdf',
      14400,
    );

    const [, , opts] = (getSignedUrl as jest.Mock).mock.calls[0] as [
      unknown,
      unknown,
      { expiresIn: number },
    ];
    expect(opts.expiresIn).toBe(14400);
  });

  it('clampa TTL de e-mail acima do teto (4h) para o limite seguro', async () => {
    await service.getEmailLinkPresignedDownloadUrl(
      'documents/tenant/file.pdf',
      86400,
    );

    const [, , opts] = (getSignedUrl as jest.Mock).mock.calls[0] as [
      unknown,
      unknown,
      { expiresIn: number },
    ];
    expect(opts.expiresIn).toBe(14400);
  });

  it('GetObjectCommand inclui ResponseCacheControl=private, no-store', async () => {
    await service.getPresignedDownloadUrl('documents/tenant/file.pdf');

    const [, command] = (getSignedUrl as jest.Mock).mock.calls[0] as [
      unknown,
      GetObjectCommand,
    ];
    expect(command.input.ResponseCacheControl).toBe('private, no-store');
  });

  it('GetObjectCommand inclui ResponseContentDisposition=attachment', async () => {
    await service.getPresignedDownloadUrl('documents/tenant/file.pdf');

    const [, command] = (getSignedUrl as jest.Mock).mock.calls[0] as [
      unknown,
      GetObjectCommand,
    ];
    expect(command.input.ResponseContentDisposition).toBe('attachment');
  });

  it('TTL padrão é <= 900 (invariante de segurança)', async () => {
    await service.getPresignedDownloadUrl('documents/tenant/file.pdf');

    const [, , opts] = (getSignedUrl as jest.Mock).mock.calls[0] as [
      unknown,
      unknown,
      { expiresIn: number },
    ];
    expect(opts.expiresIn).toBeLessThanOrEqual(900);
  });
});
