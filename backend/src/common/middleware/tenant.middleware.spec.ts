import { UnauthorizedException } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { Role } from '../../auth/enums/roles.enum';
import type {
  AuthenticatedPrincipal,
  AuthPrincipalService,
} from '../../auth/auth-principal.service';
import type { SecurityAuditService } from '../security/security-audit.service';
import type { TenantContext, TenantService } from '../tenant/tenant.service';
import type { TenantValidationService } from '../tenant/tenant-validation.service';
import { TenantMiddleware, TenantRequest } from './tenant.middleware';

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;
  let tenantRunMock: jest.Mock;
  let tenantService: Pick<TenantService, 'run'>;
  let authPrincipalService: jest.Mocked<
    Pick<AuthPrincipalService, 'verifyAndResolveAccessToken'>
  >;
  let tenantValidationService: jest.Mocked<
    Pick<TenantValidationService, 'assertTenantIsValid'>
  >;
  let securityAudit: jest.Mocked<Pick<SecurityAuditService, 'adminAction'>>;
  let previousRequireExplicit: string | undefined;

  const principal: AuthenticatedPrincipal = {
    id: 'admin-user',
    userId: 'admin-user',
    sub: 'admin-user',
    app_user_id: 'admin-user',
    profile: { nome: Role.ADMIN_GERAL },
    isSuperAdmin: true,
    tokenSource: 'local',
  };

  beforeEach(() => {
    previousRequireExplicit =
      process.env.REQUIRE_EXPLICIT_TENANT_FOR_SUPER_ADMIN;
    process.env.REQUIRE_EXPLICIT_TENANT_FOR_SUPER_ADMIN = 'true';

    tenantRunMock = jest.fn(
      <T>(_context: TenantContext, callback: () => T): T => callback(),
    );
    tenantService = {
      run: tenantRunMock as TenantService['run'],
    };
    authPrincipalService = {
      verifyAndResolveAccessToken: jest.fn().mockResolvedValue(principal),
    };
    tenantValidationService = {
      assertTenantIsValid: jest.fn(),
    };
    securityAudit = {
      adminAction: jest.fn(),
    };

    middleware = new TenantMiddleware(
      tenantService as unknown as TenantService,
      authPrincipalService as unknown as AuthPrincipalService,
      tenantValidationService as unknown as TenantValidationService,
      securityAudit as unknown as SecurityAuditService,
    );
  });

  afterEach(() => {
    if (previousRequireExplicit === undefined) {
      delete process.env.REQUIRE_EXPLICIT_TENANT_FOR_SUPER_ADMIN;
    } else {
      process.env.REQUIRE_EXPLICIT_TENANT_FOR_SUPER_ADMIN =
        previousRequireExplicit;
    }
    jest.clearAllMocks();
  });

  function createRequest(path: string, method = 'GET'): TenantRequest {
    return {
      method,
      originalUrl: path,
      url: path,
      headers: {
        authorization: 'Bearer access-token',
      },
      ip: '127.0.0.1',
    } as TenantRequest;
  }

  it.each([
    ['GET', '/companies'],
    ['GET', '/companies/company-id'],
    ['POST', '/companies'],
    ['GET', '/profiles'],
    ['PATCH', '/profiles/profile-id'],
    ['GET', '/sessions'],
    ['DELETE', '/sessions/session-id'],
    ['GET', '/admin/cache/status'],
    ['POST', '/admin/cache/refresh-dashboard'],
    ['POST', '/auth/change-password'],
    ['POST', '/auth/step-up/verify'],
  ])(
    'permite ADMIN_GERAL acessar rota TenantOptional %s %s sem x-company-id',
    async (method, path) => {
      const next = jest.fn() as jest.MockedFunction<NextFunction>;

      await middleware.use(createRequest(path, method), {} as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(
        tenantValidationService.assertTenantIsValid,
      ).not.toHaveBeenCalled();
      expect(tenantRunMock).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: undefined,
          isSuperAdmin: true,
          userId: 'admin-user',
        }),
        expect.any(Function),
      );
    },
  );

  it('ignora query string ao avaliar rotas globais sem x-company-id', async () => {
    const next = jest.fn() as jest.MockedFunction<NextFunction>;

    await middleware.use(
      createRequest('/companies?page=1&limit=100'),
      {} as Response,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(tenantValidationService.assertTenantIsValid).not.toHaveBeenCalled();
  });

  it('continua bloqueando rota operacional sem tenant explicito', async () => {
    const next = jest.fn() as jest.MockedFunction<NextFunction>;

    await expect(
      middleware.use(createRequest('/dashboard/summary'), {} as Response, next),
    ).rejects.toThrow(UnauthorizedException);

    expect(next).not.toHaveBeenCalled();
    expect(tenantRunMock).not.toHaveBeenCalled();
  });
});
