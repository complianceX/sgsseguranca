import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { FileInspectionService } from '../common/security/file-inspection.service';
import { TenantService } from '../common/tenant/tenant.service';
import { InspectionsController } from './inspections.controller';
import { InspectionsService } from './inspections.service';

describe('InspectionsController (http)', () => {
  let app: INestApplication;

  const inspectionsService = {
    listStoredFiles: jest.fn(),
    getWeeklyBundle: jest.fn(),
  };

  beforeEach(() => {
    inspectionsService.listStoredFiles.mockReset();
    inspectionsService.getWeeklyBundle.mockReset();
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [InspectionsController],
      providers: [
        {
          provide: InspectionsService,
          useValue: inspectionsService,
        },
        {
          provide: TenantService,
          useValue: { getTenantId: jest.fn().mockReturnValue('company-1') },
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
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('ignora company_id do client na listagem de arquivos da inspeção', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    inspectionsService.listStoredFiles.mockResolvedValue([]);

    await request(httpServer)
      .get('/inspections/files/list')
      .query({
        company_id: 'tenant-forjado',
        year: '2026',
        week: '21',
      })
      .expect(200);

    expect(inspectionsService.listStoredFiles).toHaveBeenCalledWith({
      year: 2026,
      week: 21,
    });
  });

  it('ignora company_id do client no bundle semanal da inspeção', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    inspectionsService.getWeeklyBundle.mockResolvedValue({
      buffer: Buffer.from('inspection bundle'),
      fileName: 'inspections.pdf',
    });

    await request(httpServer)
      .get('/inspections/files/weekly-bundle')
      .query({
        company_id: 'tenant-forjado',
        year: '2026',
        week: '21',
      })
      .expect(200);

    expect(inspectionsService.getWeeklyBundle).toHaveBeenCalledWith({
      year: 2026,
      week: 21,
    });
  });
});
