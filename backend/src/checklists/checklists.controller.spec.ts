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
import { TenantGuard } from '../common/guards/tenant.guard';
import { FileInspectionService } from '../common/security/file-inspection.service';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { ChecklistsController } from './checklists.controller';
import { ChecklistsService } from './checklists.service';

describe('ChecklistsController (http)', () => {
  let app: INestApplication;

  const checklistsService = {
    create: jest.fn(),
    listStoredFiles: jest.fn(),
    getWeeklyBundle: jest.fn(),
  };

  beforeEach(() => {
    checklistsService.create.mockReset();
    checklistsService.listStoredFiles.mockReset();
    checklistsService.getWeeklyBundle.mockReset();
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ChecklistsController],
      providers: [
        {
          provide: ChecklistsService,
          useValue: checklistsService,
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

  it('ignora company_id do client na listagem de arquivos do checklist', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    checklistsService.listStoredFiles.mockResolvedValue([]);

    await request(httpServer)
      .get('/checklists/files/list')
      .query({
        company_id: 'tenant-forjado',
        year: '2026',
        week: '19',
      })
      .expect(200);

    expect(checklistsService.listStoredFiles).toHaveBeenCalledWith({
      year: 2026,
      week: 19,
    });
  });

  it('ignora company_id do client no bundle semanal do checklist', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    checklistsService.getWeeklyBundle.mockResolvedValue({
      buffer: Buffer.from('checklist bundle'),
      fileName: 'checklists.pdf',
    });

    await request(httpServer)
      .get('/checklists/files/weekly-bundle')
      .query({
        company_id: 'tenant-forjado',
        year: '2026',
        week: '19',
      })
      .expect(200);

    expect(checklistsService.getWeeklyBundle).toHaveBeenCalledWith({
      year: 2026,
      week: 19,
    });
  });

  it('rejeita company_id forjado na criação de checklist', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/checklists')
      .send({
        titulo: 'Checklist crítico',
        data: '2026-04-23T10:00:00.000Z',
        company_id: '11111111-1111-4111-8111-111111111111',
        itens: [{ item: 'Inspecionar proteção' }],
      })
      .expect(400);

    expect(checklistsService.create).not.toHaveBeenCalled();
  });

  it('cria checklist válido sem tenant no payload', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    checklistsService.create.mockResolvedValue({ id: 'checklist-1' });

    await request(httpServer)
      .post('/checklists')
      .send({
        titulo: 'Checklist crítico',
        data: '2026-04-23T10:00:00.000Z',
        itens: [{ item: 'Inspecionar proteção' }],
      })
      .expect(201);

    expect(checklistsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: 'Checklist crítico',
        data: '2026-04-23T10:00:00.000Z',
      }),
    );
    expect(
      checklistsService.create.mock.calls[0][0].company_id,
    ).toBeUndefined();
  });
});
