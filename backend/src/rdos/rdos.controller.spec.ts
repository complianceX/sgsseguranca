/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  CallHandler,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PdfRateLimitService } from '../auth/services/pdf-rate-limit.service';
import { TenantGuard } from '../common/guards/tenant.guard';
import { FileInspectionService } from '../common/security/file-inspection.service';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { RdosController } from './rdos.controller';
import { RdosService } from './rdos.service';

describe('RdosController (http)', () => {
  let app: INestApplication;

  const rdosService = {
    create: jest.fn(),
    listFiles: jest.fn(),
    getWeeklyBundle: jest.fn(),
  };

  beforeEach(() => {
    rdosService.create.mockReset();
    rdosService.listFiles.mockReset();
    rdosService.getWeeklyBundle.mockReset();
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RdosController],
      providers: [
        {
          provide: RdosService,
          useValue: rdosService,
        },
        {
          provide: PdfRateLimitService,
          useValue: { checkDownloadLimit: jest.fn() },
        },
        { provide: FileInspectionService, useValue: { inspect: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(TenantInterceptor)
      .useValue({
        intercept: (
          _context: ExecutionContext,
          next: CallHandler,
        ): Observable<unknown> => next.handle(),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('ignora company_id do client na listagem de arquivos do RDO', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    rdosService.listFiles.mockResolvedValue([]);

    await request(httpServer)
      .get('/rdos/files/list')
      .query({
        company_id: 'tenant-forjado',
        year: '2026',
        week: '20',
      })
      .expect(200);

    expect(rdosService.listFiles).toHaveBeenCalledWith({
      year: 2026,
      week: 20,
    });
  });

  it('ignora company_id do client no bundle semanal do RDO', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    rdosService.getWeeklyBundle.mockResolvedValue({
      buffer: Buffer.from('rdo bundle'),
      fileName: 'rdos.pdf',
    });

    await request(httpServer)
      .get('/rdos/files/weekly-bundle')
      .query({
        company_id: 'tenant-forjado',
        year: '2026',
        week: '20',
      })
      .expect(200);

    expect(rdosService.getWeeklyBundle).toHaveBeenCalledWith({
      year: 2026,
      week: 20,
    });
  });

  it('rejeita company_id forjado na criação de RDO', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/rdos')
      .send({
        data: '2026-04-23T10:00:00.000Z',
        company_id: '11111111-1111-4111-8111-111111111111',
      })
      .expect(400);

    expect(rdosService.create).not.toHaveBeenCalled();
  });

  it('cria RDO válido sem tenant no payload', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    rdosService.create.mockResolvedValue({ id: 'rdo-1' });

    await request(httpServer)
      .post('/rdos')
      .send({
        data: '2026-04-23T10:00:00.000Z',
      })
      .expect(201);

    expect(rdosService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: '2026-04-23T10:00:00.000Z',
      }),
    );
    expect(rdosService.create.mock.calls[0][0].company_id).toBeUndefined();
  });
});
