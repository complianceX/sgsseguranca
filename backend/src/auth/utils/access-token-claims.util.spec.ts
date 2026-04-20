import { ConfigService } from '@nestjs/config';
import { Role } from '../enums/roles.enum';
import {
  decodeJwtPayloadUnsafe,
  extractAccessTokenClaimCache,
  looksLikeSupabaseAccessTokenPayload,
  normalizeAccessTokenClaims,
  resolveAccessTokenSecret,
} from './access-token-claims.util';

describe('access-token-claims.util', () => {
  it('normaliza o JWT local legado para o contrato canônico', () => {
    const normalized = normalizeAccessTokenClaims({
      sub: 'app-user-1',
      cpf: '12345678900',
      company_id: 'company-1',
      profile: { nome: 'Administrador Empresa' },
      plan: 'PROFESSIONAL',
    });

    expect(normalized).toEqual(
      expect.objectContaining({
        id: 'app-user-1',
        userId: 'app-user-1',
        app_user_id: 'app-user-1',
        cpf: '12345678900',
        company_id: 'company-1',
        companyId: 'company-1',
        profile: { nome: 'Administrador Empresa' },
        plan: 'PROFESSIONAL',
        isSuperAdmin: false,
      }),
    );
    expect(normalized.token_claim_cache).toEqual(
      expect.objectContaining({
        auth_user_id: 'app-user-1',
        company_id: 'company-1',
      }),
    );
  });

  it('normaliza claims do Supabase Auth com bridge para usuário da aplicação', () => {
    const normalized = normalizeAccessTokenClaims({
      sub: 'auth-user-1',
      role: 'authenticated',
      session_id: 'session-1',
      app_metadata: {
        app_user_id: 'app-user-1',
        company_id: 'company-1',
        profile_name: 'TST',
      },
    });

    expect(normalized).toEqual(
      expect.objectContaining({
        id: 'app-user-1',
        userId: 'app-user-1',
        app_user_id: 'app-user-1',
        auth_user_id: 'auth-user-1',
        company_id: 'company-1',
        companyId: 'company-1',
        profile: { nome: 'TST' },
        isSuperAdmin: false,
      }),
    );
    expect(normalized.token_claim_cache).toEqual(
      expect.objectContaining({
        app_user_id: 'app-user-1',
        auth_user_id: 'auth-user-1',
        company_id: 'company-1',
        profile_name: 'TST',
      }),
    );
  });

  it('promove explicitamente o super admin quando a claim booleana vier do hook', () => {
    const normalized = normalizeAccessTokenClaims({
      sub: 'auth-user-1',
      app_metadata: {
        app_user_id: 'app-user-1',
        is_super_admin: true,
      },
    });

    expect(normalized.profile).toEqual({ nome: Role.ADMIN_GERAL });
    expect(normalized.isSuperAdmin).toBe(true);
    expect(normalized.token_claim_cache.is_super_admin).toBe(true);
  });

  it('expõe claims apenas como cache/hints para validação posterior em banco', () => {
    const cache = extractAccessTokenClaimCache({
      sub: 'auth-user-42',
      app_metadata: {
        app_user_id: 'app-user-42',
      },
      user_metadata: {
        company_id: 'company-claim',
        site_id: 'site-claim',
      },
    });

    expect(cache).toEqual(
      expect.objectContaining({
        app_user_id: 'app-user-42',
        auth_user_id: 'auth-user-42',
        company_id: 'company-claim',
        site_id: 'site-claim',
      }),
    );
  });

  it('identifica payload de access token do Supabase e escolhe o segredo correto', () => {
    const payload = {
      iss: 'https://example.supabase.co/auth/v1',
      sub: 'auth-user-1',
      role: 'authenticated',
      app_metadata: {},
    };

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET')
          return 'local-secret-123456789012345678901234';
        if (key === 'SUPABASE_JWT_SECRET') {
          return 'supabase-secret-12345678901234567890';
        }
        return undefined;
      }),
    } as unknown as ConfigService;

    expect(looksLikeSupabaseAccessTokenPayload(payload)).toBe(true);
    expect(resolveAccessTokenSecret(configService, undefined, payload)).toBe(
      'supabase-secret-12345678901234567890',
    );
  });

  it('decodifica o payload bruto do JWT sem verificar assinatura', () => {
    const rawPayload = Buffer.from(
      JSON.stringify({ sub: 'user-1', company_id: 'company-1' }),
    )
      .toString('base64url')
      .replace(/=/g, '');
    const token = `header.${rawPayload}.signature`;

    expect(decodeJwtPayloadUnsafe(token)).toEqual({
      sub: 'user-1',
      company_id: 'company-1',
    });
  });
});
