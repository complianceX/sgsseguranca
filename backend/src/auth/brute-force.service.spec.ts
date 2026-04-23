import { HttpStatus } from '@nestjs/common';
import { BruteForceService } from './brute-force.service';
import type { AuthRedisService } from '../common/redis/redis.service';

describe('BruteForceService', () => {
  const originalEnv = { ...process.env };

  const createSut = () => {
    const multiExec = jest.fn().mockResolvedValue([]);
    const multiSet = jest.fn().mockReturnValue({ exec: multiExec });
    const multiDel = jest
      .fn()
      .mockReturnValue({ set: multiSet, exec: multiExec });
    const client = {
      get: jest.fn().mockResolvedValue(null),
      eval: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
      multi: jest.fn().mockReturnValue({
        del: multiDel,
        set: multiSet,
        exec: multiExec,
      }),
    };

    const redisService = {
      getClient: jest.fn(() => client),
    } as unknown as AuthRedisService;

    return {
      service: new BruteForceService(redisService),
      client,
      redisService,
      multiDel,
      multiSet,
      multiExec,
    };
  };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      LOGIN_FAIL_MAX: '10',
      LOGIN_FAIL_WINDOW_SECONDS: '900',
      LOGIN_FAIL_BLOCK_SECONDS: '900',
      LOGIN_FAIL_ACCOUNT_MAX: '3',
      LOGIN_FAIL_ACCOUNT_BLOCK_SECONDS: '1200',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('bloqueia conta (CPF) após N tentativas inválidas', async () => {
    const { service, client, multiSet, multiDel } = createSut();
    client.eval.mockResolvedValueOnce(3);

    await service.registerCpfFailure('12345678900');

    expect(client.eval).toHaveBeenCalled();
    expect(multiDel).toHaveBeenCalledWith('auth:bf:cpf:12345678900');
    expect(multiSet).toHaveBeenCalledWith(
      'auth:bf:cpf:block:12345678900',
      '1',
      'EX',
      1200,
    );
  });

  it('rejeita login quando conta já está bloqueada', async () => {
    const { service, client } = createSut();
    client.get.mockResolvedValueOnce('1');

    await expect(service.assertCpfAllowed('12345678900')).rejects.toMatchObject(
      {
        status: HttpStatus.TOO_MANY_REQUESTS,
      },
    );
  });

  it('remove contador e bloqueio da conta após autenticação válida', async () => {
    const { service, client } = createSut();

    await service.resetCpf('12345678900');

    expect(client.del).toHaveBeenCalledWith(
      'auth:bf:cpf:12345678900',
      'auth:bf:cpf:block:12345678900',
    );
  });
});
