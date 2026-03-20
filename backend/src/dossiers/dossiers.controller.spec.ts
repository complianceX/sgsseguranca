import {
  CallHandler,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { DossiersController } from './dossiers.controller';
import { DossiersService } from './dossiers.service';

describe('DossiersController (http)', () => {
  const employeeId = '11111111-1111-4111-8111-111111111111';
  const contractId = '22222222-2222-4222-8222-222222222222';
  let currentUser: { userId?: string; id?: string } = { userId: 'user-1' };
  let app: INestApplication;

  const dossiersService = {
    getEmployeeContext: jest.fn(),
    getSiteContext: jest.fn(),
    getEmployeePdfAccess: jest.fn(),
    attachEmployeePdf: jest.fn(),
    getSitePdfAccess: jest.fn(),
    attachSitePdf: jest.fn(),
  };

  beforeEach(() => {
    currentUser = { userId: 'user-1' };
    Object.values(dossiersService).forEach((mockFn) => mockFn.mockReset());
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DossiersController],
      providers: [{ provide: DossiersService, useValue: dossiersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<{
            user?: typeof currentUser;
          }>();
          req.user = currentUser;
          return true;
        },
      })
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
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('retorna 410 para o endpoint legado de PDF do dossiê por colaborador', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get(`/dossiers/employee/${employeeId}/pdf`)
      .expect(410)
      .expect(({ body }) => {
        expect((body as { message?: string }).message).toContain(
          'O endpoint legado de PDF do dossiê por colaborador',
        );
      });

    expect(dossiersService.getEmployeePdfAccess).not.toHaveBeenCalled();
    expect(dossiersService.attachEmployeePdf).not.toHaveBeenCalled();
  });

  it('mantém o legado de contrato bloqueado com 410 e mensagem explícita', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get(`/dossiers/contract/${contractId}/pdf`)
      .expect(410)
      .expect(({ body }) => {
        expect((body as { message?: string }).message).toContain(
          'foi descontinuado',
        );
      });
  });
});
