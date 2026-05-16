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
    savePdfToStorage: jest.fn(),
    getPdfAccess: jest.fn(),
    getEquipmentPhotoAccess: jest.fn(),
    getItemPhotoAccess: jest.fn(),
    sendEmail: jest.fn(),
  };

  beforeEach(() => {
    checklistsService.create.mockReset();
    checklistsService.listStoredFiles.mockReset();
    checklistsService.getWeeklyBundle.mockReset();
    checklistsService.savePdfToStorage.mockReset();
    checklistsService.getPdfAccess.mockReset();
    checklistsService.getEquipmentPhotoAccess.mockReset();
    checklistsService.getItemPhotoAccess.mockReset();
    checklistsService.sendEmail.mockReset();
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

  it('retorna 410 para o endpoint legado save-pdf do checklist', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/checklists/11111111-1111-4111-8111-111111111111/save-pdf')
      .expect(410);

    expect(checklistsService.savePdfToStorage).not.toHaveBeenCalled();
  });

  it('encaminha a consulta de acesso do PDF final para o service', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const checklistId = '11111111-1111-4111-8111-111111111111';
    checklistsService.getPdfAccess.mockResolvedValue({
      entityId: checklistId,
      fileKey: 'documents/company-1/checklists/checklist-1.pdf',
      folderPath: 'documents/company-1/checklists',
      originalName: 'checklist-1.pdf',
      url: 'https://example.com/checklist.pdf',
      hasFinalPdf: true,
      availability: 'ready',
      message: 'PDF final do checklist disponível para acesso.',
    });

    await request(httpServer).get(`/checklists/${checklistId}/pdf`).expect(200);

    expect(checklistsService.getPdfAccess).toHaveBeenCalledWith(checklistId);
  });

  it('encaminha a consulta de foto do equipamento para o service', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const checklistId = '11111111-1111-4111-8111-111111111111';
    checklistsService.getEquipmentPhotoAccess.mockResolvedValue({
      entityId: checklistId,
      scope: 'equipment',
      itemIndex: null,
      photoIndex: null,
      hasGovernedPhoto: true,
      availability: 'ready',
      fileKey: 'documents/company-1/checklists/checklist-1/foto.png',
      originalName: 'foto.png',
      mimeType: 'image/png',
      url: 'https://example.com/photo.png',
      degraded: false,
      message: null,
    });

    await request(httpServer)
      .get(`/checklists/${checklistId}/equipment-photo/access`)
      .expect(200);

    expect(checklistsService.getEquipmentPhotoAccess).toHaveBeenCalledWith(
      checklistId,
    );
  });

  it('encaminha a consulta de foto do item para o service', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const checklistId = '11111111-1111-4111-8111-111111111111';
    checklistsService.getItemPhotoAccess.mockResolvedValue({
      entityId: checklistId,
      scope: 'item',
      itemIndex: 0,
      photoIndex: 0,
      hasGovernedPhoto: true,
      availability: 'ready',
      fileKey: 'documents/company-1/checklists/checklist-1/foto.png',
      originalName: 'foto.png',
      mimeType: 'image/png',
      url: 'https://example.com/photo.png',
      degraded: false,
      message: null,
    });

    await request(httpServer)
      .get(`/checklists/${checklistId}/items/0/photos/0/access`)
      .expect(200);

    expect(checklistsService.getItemPhotoAccess).toHaveBeenCalledWith(
      checklistId,
      0,
      0,
    );
  });

  it('rejeita envio de email com payload inválido', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const checklistId = '11111111-1111-4111-8111-111111111111';

    await request(httpServer)
      .post(`/checklists/${checklistId}/send-email`)
      .send({ to: 'email-invalido' })
      .expect(400);

    expect(checklistsService.sendEmail).not.toHaveBeenCalled();
  });

  it('encaminha envio de email com payload válido', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const checklistId = '11111111-1111-4111-8111-111111111111';
    checklistsService.sendEmail.mockResolvedValue({
      sent: true,
    });

    await request(httpServer)
      .post(`/checklists/${checklistId}/send-email`)
      .send({ to: 'cliente@empresa.com' })
      .expect(201);

    expect(checklistsService.sendEmail).toHaveBeenCalledWith(
      checklistId,
      'cliente@empresa.com',
    );
  });
});
