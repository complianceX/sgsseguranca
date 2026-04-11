import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { AuthPrincipalService } from './auth-principal.service';

describe('AuthPrincipalService', () => {
  let service: AuthPrincipalService;
  let configService: { get: jest.Mock };
  let manager: {
    query: jest.Mock;
    findOne: jest.Mock;
  };
  let dataSource: {
    transaction: jest.Mock;
  };

  beforeEach(() => {
    manager = {
      query: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue(null),
    };
    dataSource = {
      transaction: jest.fn(
        (callback: (txManager: typeof manager) => Promise<unknown>) =>
          Promise.resolve(callback(manager)),
      ),
    };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET')
          return 'local-secret-123456789012345678901234';
        if (key === 'SUPABASE_JWT_SECRET') {
          return 'supabase-secret-12345678901234567890';
        }
        return undefined;
      }),
    };

    service = new AuthPrincipalService(
      configService as unknown as ConfigService,
      dataSource as unknown as DataSource,
    );
  });

  it('resolve principal local sem bridge quando token já traz app user id', async () => {
    const principal = await service.resolveAccessPrincipal({
      sub: 'app-user-1',
      app_user_id: 'app-user-1',
      auth_uid: 'auth-user-1',
      company_id: 'company-1',
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
      }),
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('resolve principal supabase via bridge auth_user_id -> public.users.id', async () => {
    manager.findOne.mockResolvedValue({
      id: 'app-user-1',
      auth_user_id: 'auth-user-1',
      cpf: '12345678900',
      company_id: 'company-1',
      profile: { nome: 'Técnico' },
    });

    const principal = await service.resolveAccessPrincipal({
      sub: 'auth-user-1',
      iss: 'https://project-ref.supabase.co/auth/v1',
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {},
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(
      "SET LOCAL app.is_super_admin = 'true'",
    );
    expect(manager.findOne).toHaveBeenCalled();
    expect(principal).toEqual(
      expect.objectContaining({
        userId: 'app-user-1',
        app_user_id: 'app-user-1',
        authUserId: 'auth-user-1',
        companyId: 'company-1',
        profile: { nome: 'Técnico' },
        tokenSource: 'supabase',
      }),
    );
  });

  it('verifyAndResolveAccessToken aceita token assinado com segredo do supabase', async () => {
    manager.findOne.mockResolvedValue({
      id: 'app-user-77',
      auth_user_id: 'auth-user-77',
      cpf: '98765432100',
      company_id: 'company-77',
      profile: { nome: 'Supervisor' },
    });

    const token = jwt.sign(
      {
        sub: 'auth-user-77',
        iss: 'https://project-ref.supabase.co/auth/v1',
        role: 'authenticated',
      },
      'supabase-secret-12345678901234567890',
    );

    const principal = await service.verifyAndResolveAccessToken(token);

    expect(principal).toEqual(
      expect.objectContaining({
        userId: 'app-user-77',
        authUserId: 'auth-user-77',
        companyId: 'company-77',
      }),
    );
  });
});
