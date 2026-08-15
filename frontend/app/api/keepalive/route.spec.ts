/**
 * Fase 1/2 — Testes P0: Keepalive Route
 *
 * Fase 1: CRON_SECRET produção, 401/500, não expõe internos
 * Fase 2 adiciona:
 *   5. Tokens com whitespace não bypassa validação
 *   6. Resposta de sucesso tem shape mínimo (ok, status, elapsedMs)
 *   7. Resposta nunca contém CRON_SECRET
 *   8. Erros de abort (timeout do fetch) → 503 sem detalhe
 *   9. NODE_ENV=test sem CRON_SECRET → comporta como development (libera)
 *  10. Invariante: body de 401 e 500 nunca contém informação sensível
 */

// Mock de next/server para evitar dependência do global Request (Web Fetch API)
// que não está disponível no ambiente jsdom. Os testes só precisam de NextResponse.json.
jest.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => data,
      text: async () => JSON.stringify(data),
    }),
  },
}));

// Mock do módulo de normalização de URL
jest.mock('@/lib/public-api-url', () => ({
  normalizePublicApiBaseUrl: (url: string) => url,
}));

// Importa depois do mock para garantir que o módulo usa o mock
import { GET } from './route';

const originalEnv = process.env;
let requestIpCounter = 0;

function makeRequest(authHeader?: string): Request {
  requestIpCounter += 1;
  const testIp = `203.0.113.${requestIpCounter}`;
  return {
    headers: {
      get: (name: string) => {
        if (name === 'authorization') return authHeader ?? null;
        if (name === 'x-forwarded-for') return testIp;
        return null;
      },
    },
  } as unknown as Request;
}

describe('Keepalive Route — Segurança (P0)', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  // ─── Produção sem CRON_SECRET ──────────────────────────────────────────────

  describe('NODE_ENV=production sem CRON_SECRET', () => {
    beforeEach(() => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      delete process.env.CRON_SECRET;
    });

    it('retorna 500 genérico (falha segura de configuração)', async () => {
      const response = await GET(makeRequest());
      expect(response.status).toBe(500);
    });

    it('não expõe detalhes internos no body do 500', async () => {
      const response = await GET(makeRequest());
      const body = await response.json() as { error?: string };
      // Não deve expor que CRON_SECRET está faltando
      expect(body.error).not.toContain('CRON_SECRET');
      expect(body.error).not.toContain('secret');
      expect(body.error).not.toContain('environment');
    });

    it('não chama o backend quando configuração está inválida', async () => {
      await GET(makeRequest());
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ─── CRON_SECRET definido, token ausente ───────────────────────────────────

  describe('CRON_SECRET definido, header Authorization ausente', () => {
    beforeEach(() => {
      process.env.CRON_SECRET = 'my-super-secret-token';
    });

    it('retorna 401 sem header Authorization', async () => {
      const response = await GET(makeRequest());
      expect(response.status).toBe(401);
    });

    it('não chama o backend quando não autorizado', async () => {
      await GET(makeRequest());
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ─── CRON_SECRET definido, token inválido ──────────────────────────────────

  describe('CRON_SECRET definido, token incorreto', () => {
    beforeEach(() => {
      process.env.CRON_SECRET = 'my-super-secret-token';
    });

    it('retorna 401 com token errado', async () => {
      const response = await GET(makeRequest('Bearer wrong-token'));
      expect(response.status).toBe(401);
    });

    it('retorna 401 com prefixo incorreto (sem Bearer)', async () => {
      const response = await GET(makeRequest('my-super-secret-token'));
      expect(response.status).toBe(401);
    });

    it('retorna 401 com Bearer vazio', async () => {
      const response = await GET(makeRequest('Bearer '));
      expect(response.status).toBe(401);
    });
  });

  // ─── CRON_SECRET definido, token correto ───────────────────────────────────

  describe('CRON_SECRET definido, token correto', () => {
    beforeEach(() => {
      process.env.CRON_SECRET = 'my-super-secret-token';
    });

    it('chama o backend e retorna 200 quando backend está ok', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

      const response = await GET(makeRequest('Bearer my-super-secret-token'));
      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('retorna 503 quando o backend está indisponível', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });

      const response = await GET(makeRequest('Bearer my-super-secret-token'));
      expect(response.status).toBe(503);
    });

    it('não expõe target (URL interna) na resposta de sucesso', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

      const response = await GET(makeRequest('Bearer my-super-secret-token'));
      const body = await response.json() as Record<string, unknown>;
      // URL do backend não deve vazar para o cliente externo
      expect(body).not.toHaveProperty('target');
    });

    it('não expõe stack trace ou erro interno em caso de falha do fetch', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:3000'));

      const response = await GET(makeRequest('Bearer my-super-secret-token'));
      expect(response.status).toBe(503);

      const body = await response.json() as Record<string, unknown>;
      expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
      expect(JSON.stringify(body)).not.toContain('127.0.0.1');
    });
  });

  // ─── Desenvolvimento sem CRON_SECRET ──────────────────────────────────────

  describe('NODE_ENV=development sem CRON_SECRET', () => {
    beforeEach(() => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
      delete process.env.CRON_SECRET;
    });

    it('permite acesso sem token em desenvolvimento (conveniência)', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

      const response = await GET(makeRequest());
      expect(response.status).toBe(200);
    });
  });

  // ─── Fase 2: Whitespace em token não bypassa validação ────────────────────

  describe('Fase 2 — Whitespace no token não bypassa autenticação', () => {
    beforeEach(() => {
      process.env.CRON_SECRET = 'secret-value';
    });

    const whitespaceTokens = [
      { label: 'token com espaço no início', value: 'Bearer  secret-value' },
      { label: 'token com tab',              value: 'Bearer\tsecret-value' },
      { label: 'token com newline',          value: 'Bearer\nsecret-value' },
      { label: 'token com espaço no final',  value: 'Bearer secret-value ' },
      { label: 'Bearer seguido de espaços',  value: 'Bearer   ' },
    ];

    for (const { label, value } of whitespaceTokens) {
      it(`rejeita ${label} → 401`, async () => {
        const response = await GET(makeRequest(value));
        expect(response.status).toBe(401);
      });
    }
  });

  // ─── Fase 2: Shape da resposta de sucesso ─────────────────────────────────

  describe('Fase 2 — Shape da resposta de sucesso', () => {
    beforeEach(() => {
      process.env.CRON_SECRET = 'secret-value';
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    });

    it('resposta 200 contém ok=true, status e elapsedMs', async () => {
      const response = await GET(makeRequest('Bearer secret-value'));
      expect(response.status).toBe(200);

      const body = await response.json() as Record<string, unknown>;
      expect(body.ok).toBe(true);
      expect(typeof body.status).toBe('number');
      expect(typeof body.elapsedMs).toBe('number');
      expect(body.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('resposta NUNCA contém o valor do CRON_SECRET', async () => {
      const response = await GET(makeRequest('Bearer secret-value'));
      const bodyText = await response.text();
      expect(bodyText).not.toContain('secret-value');
    });

    it('resposta 200 NÃO contém campo target (URL interna)', async () => {
      const response = await GET(makeRequest('Bearer secret-value'));
      const body = await response.json() as Record<string, unknown>;
      expect(body).not.toHaveProperty('target');
    });
  });

  // ─── Fase 2: Erros de rede e abort ─────────────────────────────────────────

  describe('Fase 2 — Erros de rede e timeout do fetch', () => {
    beforeEach(() => {
      process.env.CRON_SECRET = 'secret-value';
    });

    it('AbortError (timeout 25s) → 503 sem detalhe interno', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      global.fetch = jest.fn().mockRejectedValue(abortError);

      const response = await GET(makeRequest('Bearer secret-value'));
      expect(response.status).toBe(503);

      const body = await response.json() as Record<string, unknown>;
      expect(JSON.stringify(body)).not.toContain('AbortError');
      expect(JSON.stringify(body)).not.toContain('operation was aborted');
    });

    it('DNS NXDOMAIN (fetch rejeita) → 503 sem URL interna', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND api.sgsseguranca.com.br'));

      const response = await GET(makeRequest('Bearer secret-value'));
      expect(response.status).toBe(503);

      const body = await response.json() as Record<string, unknown>;
      expect(JSON.stringify(body)).not.toContain('sgsseguranca');
      expect(JSON.stringify(body)).not.toContain('ENOTFOUND');
    });

    it('Backend retorna 503 → repassa 503 para o caller', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });

      const response = await GET(makeRequest('Bearer secret-value'));
      expect(response.status).toBe(503);
    });

    it('Backend retorna 200 mas ok=false → repassa como 503', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 200 });

      const response = await GET(makeRequest('Bearer secret-value'));
      expect(response.status).toBe(503);
    });
  });

  // ─── Fase 2: Invariante — body de erro nunca contém informação sensível ────

  describe('Fase 2 — Invariante: body de erro não contém informação sensível', () => {
    const SENSITIVE_STRINGS = [
      'CRON_SECRET',
      'process.env',
      'secret',
      'password',
      'token',
      '127.0.0.1',
      'localhost',
    ];

    it('Body do 500 (prod sem secret) não contém informação sensível', async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      delete process.env.CRON_SECRET;

      const response = await GET(makeRequest());
      const bodyText = await response.text();

      for (const sensitive of SENSITIVE_STRINGS) {
        expect(bodyText.toLowerCase()).not.toContain(sensitive.toLowerCase());
      }
    });

    it('Body do 401 (token inválido) não contém informação sensível', async () => {
      process.env.CRON_SECRET = 'my-real-secret';

      const response = await GET(makeRequest('Bearer REDACTED'));
      const bodyText = await response.text();

      for (const sensitive of SENSITIVE_STRINGS) {
        expect(bodyText.toLowerCase()).not.toContain(sensitive.toLowerCase());
      }
    });
  });
});
