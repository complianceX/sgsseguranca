import { TokenRevocationService } from './token-revocation.service';

// Fábrica de mocks do cliente Redis para isolar o comportamento do serviço
function makeRedis(overrides: {
  get?: jest.Mock;
  set?: jest.Mock;
} = {}): { get: jest.Mock; set: jest.Mock } {
  return {
    get: overrides.get ?? jest.fn().mockResolvedValue(null),
    set: overrides.set ?? jest.fn().mockResolvedValue('OK'),
  };
}

function makeService(redis: ReturnType<typeof makeRedis>): TokenRevocationService {
  return new TokenRevocationService(redis as never);
}

describe('TokenRevocationService', () => {
  describe('isRevoked', () => {
    it('retorna false quando o token nao esta no Redis', async () => {
      const svc = makeService(makeRedis());
      expect(await svc.isRevoked('jti-unknown')).toBe(false);
    });

    it('retorna true quando o Redis confirma revogacao', async () => {
      const svc = makeService(makeRedis({ get: jest.fn().mockResolvedValue('revoked') }));
      expect(await svc.isRevoked('jti-revoked')).toBe(true);
    });

    it('fail-open quando o Redis esta indisponivel — retorna false sem lancar', async () => {
      const svc = makeService(makeRedis({
        get: jest.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:6379')),
      }));
      // Nao deve lancar — fail-open
      await expect(svc.isRevoked('jti-redis-down')).resolves.toBe(false);
    });

    it('bloqueia pelo cache local mesmo quando o Redis esta down apos revoke()', async () => {
      // Simula: revoke() escreve no cache local; Redis esta down tanto no set quanto no get
      const redis = makeRedis({
        set: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        get: jest.fn().mockResolvedValue(null), // Redis diz nao esta revogado
      });
      const svc = makeService(redis);

      await svc.revoke('jti-local-only', 900); // falha no Redis, mas cache local e populado
      // Cache local deve bloquear independente do Redis
      expect(await svc.isRevoked('jti-local-only')).toBe(true);
    });

    it('popula o cache local apos hit no Redis para reduzir pressao futura', async () => {
      const getMock = jest.fn().mockResolvedValue('revoked');
      const svc = makeService(makeRedis({ get: getMock }));

      expect(await svc.isRevoked('jti-warm')).toBe(true); // 1a consulta vai ao Redis
      expect(getMock).toHaveBeenCalledTimes(1);

      // Simular Redis down agora — cache local deve cobrir
      getMock.mockRejectedValue(new Error('ECONNREFUSED'));
      expect(await svc.isRevoked('jti-warm')).toBe(true); // cache local bloqueia
      // Redis nao e consultado na 2a chamada — cache local respondeu diretamente
      expect(getMock).toHaveBeenCalledTimes(1);
    });

    it('nao consulta o Redis quando o cache local ja tem o token', async () => {
      const getMock = jest.fn().mockResolvedValue('revoked');
      const svc = makeService(makeRedis({ get: getMock }));

      // Popular cache local via revoke()
      const setMock = jest.fn().mockResolvedValue('OK');
      const redis = makeRedis({ get: getMock, set: setMock });
      const svcWithLocal = makeService(redis);
      await svcWithLocal.revoke('jti-cached', 900); // escreve no cache local

      getMock.mockClear(); // zerar contagem
      expect(await svcWithLocal.isRevoked('jti-cached')).toBe(true);
      expect(getMock).not.toHaveBeenCalled(); // cache local respondeu sem ir ao Redis
    });
  });

  describe('revoke', () => {
    it('persiste no Redis com TTL correto', async () => {
      const setMock = jest.fn().mockResolvedValue('OK');
      const svc = makeService(makeRedis({ set: setMock }));

      await svc.revoke('jti-abc', 900);

      expect(setMock).toHaveBeenCalledWith(
        'revoked-token:jti-abc',
        'revoked',
        'EX',
        900,
      );
    });

    it('nao lanca quando o Redis esta indisponivel', async () => {
      const svc = makeService(makeRedis({
        set: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      }));
      await expect(svc.revoke('jti-fail', 900)).resolves.not.toThrow();
    });

    it('popula o cache local mesmo quando o Redis falha', async () => {
      const redis = makeRedis({
        set: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        get: jest.fn().mockResolvedValue(null),
      });
      const svc = makeService(redis);

      await svc.revoke('jti-cache-only', 900);
      // Cache local deve bloquear sem precisar do Redis
      expect(await svc.isRevoked('jti-cache-only')).toBe(true);
    });
  });

  describe('cache local — limite de capacidade', () => {
    it('nao excede o tamanho maximo evictando a entrada mais antiga', () => {
      // Acessar os internos via cast para testar a RevokedTokenCache isolada
      // A cobertura funcional e suficiente: o servico nao deve lancar ao estourar o cap
      const redis = makeRedis();
      const svc = makeService(redis);

      // Invocar revoke sincronamente no cache local via hack de acesso a localBlacklist
      const lb = (svc as unknown as { localBlacklist: { set(j: string): void; size: number } })
        .localBlacklist;

      // Preencher ate a borda — nao deve lancar
      for (let i = 0; i < 2001; i++) {
        lb.set(`jti-${i}`);
      }
      // O cap e 2000; nao deve lancar ao inserir o 2001o
      expect(lb.size).toBe(2000);
    });
  });
});