import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { JwtRefreshStrategy } from './jwt-refresh.strategy';

describe('JwtRefreshStrategy', () => {
  const buildStrategy = () => {
    process.env.JWT_REFRESH_SECRET = 'refresh-secret-for-tests';
    const redisClient = {
      get: jest.fn().mockResolvedValue('1'),
    };
    const redisService = {
      getClient: jest.fn(() => redisClient),
      getRefreshTokenKey: jest.fn((userId: string, tokenHash: string) => {
        return `refresh:${userId}:${tokenHash}`;
      }),
    };
    const configService = {
      get: jest.fn((key: string) =>
        key === 'JWT_REFRESH_SECRET' ? 'refresh-secret-for-tests' : undefined,
      ),
    } as unknown as ConfigService;

    const strategy = new JwtRefreshStrategy(
      configService,
      redisService as never,
    );

    return { strategy, redisService, redisClient };
  };

  it('restringe a verificação JWT ao algoritmo HS256', () => {
    const { strategy } = buildStrategy();
    const verifyOptions = (strategy as unknown as { _verifOpts?: unknown })
      ._verifOpts as { algorithms?: string[] } | undefined;

    expect(verifyOptions?.algorithms).toEqual(['HS256']);
  });

  it('bloqueia refresh quando cookie refresh_token está ausente', async () => {
    const { strategy, redisClient } = buildStrategy();

    await expect(strategy.validate({}, { sub: 'user-1' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(redisClient.get).not.toHaveBeenCalled();
  });

  it('valida refresh token no Redis com hash do cookie', async () => {
    const { strategy, redisService, redisClient } = buildStrategy();
    const refreshToken = 'refresh-token-value';
    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    const result = await strategy.validate(
      { cookies: { refresh_token: refreshToken } },
      { sub: 'user-1', company_id: 'company-1', profile: 'TST' },
    );

    expect(redisService.getRefreshTokenKey).toHaveBeenCalledWith(
      'user-1',
      tokenHash,
    );
    expect(redisClient.get).toHaveBeenCalledWith(`refresh:user-1:${tokenHash}`);
    expect(result).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        company_id: 'company-1',
      }),
    );
  });
});
