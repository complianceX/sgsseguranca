import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { SupabaseAuthAdminService } from './supabase-auth-admin.service';

describe('SupabaseAuthAdminService', () => {
  let service: SupabaseAuthAdminService;
  let configService: { get: jest.Mock };
  let dataSource: { query: jest.Mock };
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    dataSource = {
      query: jest.fn().mockResolvedValue([]),
    };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'SUPABASE_URL') return 'https://project-ref.supabase.co';
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') {
          return 'service-role-key-12345678901234567890';
        }
        if (key === 'SUPABASE_AUTH_SYNC_ENABLED') return 'true';
        return undefined;
      }),
    };
    globalThis.fetch = jest.fn();

    service = new SupabaseAuthAdminService(
      configService as unknown as ConfigService,
      dataSource as unknown as DataSource,
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch as typeof globalThis.fetch;
  });

  it('cria usuário no Supabase Auth quando não existe bridge nem email já cadastrado', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ user: { id: 'auth-user-1' } }),
    });

    const result = await service.ensureUser({
      appUserId: 'app-user-1',
      email: 'user@example.com',
      password: 'SenhaSegura@123',
      companyId: 'company-1',
      profileName: 'TST',
      cpf: '12345678900',
      status: true,
    });

    expect(result).toEqual(
      expect.objectContaining({
        authUserId: 'auth-user-1',
        created: true,
        updated: false,
        skipped: false,
      }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/auth/v1/admin/users',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('atualiza usuário existente quando encontra auth.users pelo email', async () => {
    dataSource.query.mockResolvedValue([{ id: 'auth-user-2' }]);
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ user: { id: 'auth-user-2' } }),
    });

    const result = await service.ensureUser({
      appUserId: 'app-user-2',
      email: 'existing@example.com',
      companyId: 'company-2',
      profileName: 'Administrador Empresa',
    });

    expect(result).toEqual(
      expect.objectContaining({
        authUserId: 'auth-user-2',
        created: false,
        updated: true,
        skipped: false,
      }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/auth/v1/admin/users/auth-user-2',
      expect.objectContaining({
        method: 'PUT',
      }),
    );
  });

  it('faz skip quando sync está habilitado mas o usuário não tem email', async () => {
    const result = await service.ensureUser({
      appUserId: 'app-user-3',
      email: null,
    });

    expect(result).toEqual(
      expect.objectContaining({
        created: false,
        updated: false,
        skipped: true,
        reason: 'missing_email',
      }),
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
