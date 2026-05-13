import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AuthPrincipalService } from './auth-principal.service';
import { SecurityAuditService } from '../common/security/security-audit.service';

describe('AuthPrincipalService', () => {
  let service: AuthPrincipalService;
  let configService: { get: jest.Mock };
  let dataSource: {
    query: jest.Mock;
  };
  let securityAudit: {
    emit: jest.Mock;
    tenantMismatch: jest.Mock;
  };

  beforeEach(() => {
    dataSource = {
      query: jest.fn().mockResolvedValue([]),
    };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') {
          return 'local-secret-123456789012345678901234';
        }
        return undefined;
      }),
    };
    securityAudit = {
      emit: jest.fn(),
      tenantMismatch: jest.fn(),
    };

    service = new AuthPrincipalService(
      configService as unknown as ConfigService,
      dataSource as unknown as DataSource,
      securityAudit as unknown as SecurityAuditService,
    );
  });

  it('resolve principal local revalidando bridge no banco', async () => {
    dataSource.query.mockResolvedValue([
      {
        id: 'app-user-1',
        auth_user_id: 'auth-user-1',
        cpf: '12345678900',
        company_id: 'company-1',
        site_id: 'site-1',
        profile_nome: 'Administrador Geral',
      },
    ]);

    const principal = await service.resolveAccessPrincipal({
      sub: 'app-user-1',
      app_user_id: 'app-user-1',
      auth_uid: 'auth-user-1',
      company_id: 'company-1',
      site_id: 'site-1',
      profile: { nome: 'Administrador Geral' },
      cpf: '12345678900',
    });

    expect(principal).toEqual(
      expect.objectContaining({
        userId: 'app-user-1',
        app_user_id: 'app-user-1',
        authUserId: 'auth-user-1',
        companyId: 'company-1',
        isSuperAdmin: true,
        tokenSource: 'local',
      }),
    );
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('reconhece ADMIN_GERAL legado como super admin ao resolver principal', async () => {
    dataSource.query.mockResolvedValue([
      {
        id: 'app-user-admin',
        auth_user_id: 'auth-user-admin',
        cpf: '12345678900',
        company_id: 'company-1',
        profile_nome: 'ADMIN_GERAL',
      },
    ]);

    const principal = await service.resolveAccessPrincipal({
      sub: 'app-user-admin',
      app_user_id: 'app-user-admin',
      company_id: 'company-1',
      profile: { nome: 'ADMIN_GERAL' },
    });

    expect(principal.isSuperAdmin).toBe(true);
    expect(principal.profile).toEqual({ nome: 'ADMIN_GERAL' });
  });

  it('lança UnauthorizedException quando usuário não é encontrado no banco', async () => {
    dataSource.query.mockResolvedValue([]);

    await expect(
      service.resolveAccessPrincipal({
        sub: 'app-user-inexistente',
        app_user_id: 'app-user-inexistente',
        company_id: 'company-1',
      }),
    ).rejects.toThrow('Token inválido: usuário da aplicação não resolvido.');
  });

  it('reusa o cache local do bridge para evitar nova query por app_user_id', async () => {
    dataSource.query.mockResolvedValue([
      {
        id: 'app-user-cache',
        auth_user_id: 'auth-user-cache',
        cpf: '98765432100',
        company_id: 'company-cache',
        profile_nome: 'Supervisor',
      },
    ]);

    const first = await service.resolveAccessPrincipal({
      sub: 'app-user-cache',
      app_user_id: 'app-user-cache',
      company_id: 'company-cache',
    });
    const second = await service.resolveAccessPrincipal({
      sub: 'app-user-cache',
      app_user_id: 'app-user-cache',
      company_id: 'company-cache',
    });

    expect(first.userId).toBe('app-user-cache');
    expect(second.userId).toBe('app-user-cache');
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('bloqueia token com claim de tenant divergente e emite auditoria', async () => {
    dataSource.query.mockResolvedValue([
      {
        id: 'app-user-tenant',
        auth_user_id: 'auth-user-tenant',
        cpf: '98765432100',
        company_id: 'company-db',
        site_id: 'site-db',
        profile_nome: 'Supervisor',
      },
    ]);

    await expect(
      service.resolveAccessPrincipal({
        sub: 'app-user-tenant',
        app_user_id: 'app-user-tenant',
        company_id: 'company-token',
      }),
    ).rejects.toThrow('Token inválido: divergência de contexto de acesso.');

    expect(securityAudit.emit).toHaveBeenCalled();
    expect(securityAudit.tenantMismatch).toHaveBeenCalledWith(
      'app-user-tenant',
      'company-db',
      'company-token',
    );
  });

  it('quando profile diverge, audita e usa profile do banco como fonte de verdade', async () => {
    dataSource.query.mockResolvedValue([
      {
        id: 'app-user-profile',
        auth_user_id: 'auth-user-profile',
        cpf: '98765432100',
        company_id: 'company-1',
        site_id: 'site-1',
        profile_nome: 'Supervisor',
      },
    ]);

    const principal = await service.resolveAccessPrincipal({
      sub: 'app-user-profile',
      app_user_id: 'app-user-profile',
      company_id: 'company-1',
      site_id: 'site-1',
      profile: { nome: 'Administrador Geral' },
    });

    expect(principal.profile).toEqual({ nome: 'Supervisor' });
    expect(principal.isSuperAdmin).toBe(false);
    expect(securityAudit.emit).toHaveBeenCalled();
  });

  it('deduplica lookups concorrentes do bridge', async () => {
    let resolveLookup:
      | ((value: Array<Record<string, unknown>>) => void)
      | undefined;
    dataSource.query.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLookup = resolve;
        }),
    );

    const firstPromise = service.resolveAccessPrincipal({
      sub: 'app-user-race',
      app_user_id: 'app-user-race',
      company_id: 'company-race',
    });
    const secondPromise = service.resolveAccessPrincipal({
      sub: 'app-user-race',
      app_user_id: 'app-user-race',
      company_id: 'company-race',
    });

    await Promise.resolve();
    await Promise.resolve();
    resolveLookup?.([
      {
        id: 'app-user-race',
        auth_user_id: 'auth-user-race',
        cpf: '98765432100',
        company_id: 'company-race',
        profile_nome: 'Supervisor',
      },
    ]);
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    expect(first.userId).toBe('app-user-race');
    expect(second.userId).toBe('app-user-race');
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });
});
