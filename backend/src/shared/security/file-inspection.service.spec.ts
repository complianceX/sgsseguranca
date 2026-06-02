import { Test } from '@nestjs/testing';
import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FILE_INSPECTION_PROVIDERS,
  FileInspectionProvider,
  FileInspectionService,
} from './file-inspection.service';

const PDF_BUFFER = Buffer.from('%PDF-1.4 fake content');

function buildConfigService(env: {
  NODE_ENV?: string;
  ANTIVIRUS_PROVIDER?: string;
}): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'NODE_ENV') return env.NODE_ENV ?? 'test';
      if (key === 'ANTIVIRUS_PROVIDER') return env.ANTIVIRUS_PROVIDER;
      return undefined;
    },
  } as unknown as ConfigService;
}

async function buildService(
  env: {
    NODE_ENV?: string;
    ANTIVIRUS_PROVIDER?: string;
  },
  providers: FileInspectionProvider[] = [],
): Promise<FileInspectionService> {
  const module = await Test.createTestingModule({
    providers: [
      FileInspectionService,
      {
        provide: ConfigService,
        useValue: buildConfigService(env),
      },
      {
        provide: FILE_INSPECTION_PROVIDERS,
        useValue: providers,
      },
    ],
  }).compile();

  return module.get(FileInspectionService);
}

describe('FileInspectionService — Fase 3', () => {
  it('sem provider em produção -> bloqueia promoção (fail closed)', async () => {
    const service = await buildService({ NODE_ENV: 'production' });

    await expect(service.inspect(PDF_BUFFER, 'doc.pdf')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('sem provider em development -> permite para DX', async () => {
    const service = await buildService({ NODE_ENV: 'development' });

    await expect(service.inspect(PDF_BUFFER, 'doc.pdf')).resolves.toEqual({
      clean: true,
      provider: 'none',
    });
  });

  it('ameaça detectada -> rejeita com 422', async () => {
    const service = await buildService(
      {
        NODE_ENV: 'production',
        ANTIVIRUS_PROVIDER: 'clamav',
      },
      [
        {
          name: 'clamav',
          inspect: jest.fn().mockResolvedValue({
            clean: false,
            provider: 'clamav',
            threat: 'Eicar-Test-Signature',
          }),
        },
      ],
    );

    await expect(service.inspect(PDF_BUFFER, 'doc.pdf')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('provider indisponível -> fail closed', async () => {
    const service = await buildService(
      {
        NODE_ENV: 'production',
        ANTIVIRUS_PROVIDER: 'clamav',
      },
      [
        {
          name: 'clamav',
          inspect: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        },
      ],
    );

    await expect(service.inspect(PDF_BUFFER, 'doc.pdf')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('provider configurado e limpo -> aprova', async () => {
    const service = await buildService(
      {
        NODE_ENV: 'production',
        ANTIVIRUS_PROVIDER: 'clamav',
      },
      [
        {
          name: 'clamav',
          inspect: jest.fn().mockResolvedValue({
            clean: true,
            provider: 'clamav',
          }),
        },
      ],
    );

    await expect(service.inspect(PDF_BUFFER, 'doc.pdf')).resolves.toEqual({
      clean: true,
      provider: 'clamav',
    });
  });

  it('provider slug sem adaptador carregado em produção -> bloqueia', async () => {
    const service = await buildService({
      NODE_ENV: 'production',
      ANTIVIRUS_PROVIDER: 'clamav',
    });

    await expect(service.inspect(PDF_BUFFER, 'doc.pdf')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
