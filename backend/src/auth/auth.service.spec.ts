import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { PasswordService } from '../common/services/password.service';
import { UnauthorizedException } from '@nestjs/common';
import { User } from '../users/entities/user.entity';
import { RedisService } from '../common/redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let passwordService: jest.Mocked<PasswordService>;
  let redisService: jest.Mocked<RedisService>;
  let dataSource: { transaction: jest.Mock };
  let manager: {
    query: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    manager = {
      query: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    };
    dataSource = {
      transaction: jest.fn(
        async (callback: (txManager: typeof manager) => unknown) =>
          callback(manager),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: UsersService,
          useValue: {
            findOneWithPassword: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('token'),
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: PasswordService,
          useValue: {
            compare: jest.fn(),
            hash: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            storeRefreshToken: jest.fn().mockResolvedValue(undefined),
            atomicConsumeRefreshToken: jest.fn().mockResolvedValue('1'),
            revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
            clearAllRefreshTokens: jest.fn().mockResolvedValue(undefined),
            getClient: () => ({
              get: jest.fn().mockResolvedValue('1'),
              setex: jest.fn().mockResolvedValue('OK'),
              del: jest.fn().mockResolvedValue(1),
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    passwordService = module.get(PasswordService);
    redisService = module.get(RedisService);
  });

  describe('validateUser', () => {
    it('should return user without password if validation succeeds', async () => {
      const user = {
        id: 'user-1',
        nome: 'Usuário Teste',
        cpf: '12345678900',
        funcao: 'Técnico',
        company_id: 'company-1',
        profile: { nome: 'Administrador Geral' },
        password:
          '$2b$10$tV1AhMRqCdZTnSEV18aoR.MSJ.1zu7PIewZKDn1GkoTSqvrSNENC2',
        status: true,
      } as unknown as User;
      manager.findOne.mockResolvedValue(user);
      passwordService.compare.mockResolvedValue(true);

      const result = (await service.validateUser(
        '12345678900',
        'password',
      )) as Partial<User>;

      expect(result).toEqual(expect.objectContaining({ id: user.id }));
      expect(result.password).toBeUndefined();
    });

    it('should return null if user not found', async () => {
      manager.findOne.mockResolvedValue(null);
      const result = await service.validateUser('123', 'pass');
      expect(result).toBeNull();
    });

    it('should return null if password does not match', async () => {
      const user = {
        id: 'user-1',
        nome: 'Usuário Teste',
        cpf: '12345678900',
        funcao: 'Técnico',
        company_id: 'company-1',
        profile: { nome: 'Administrador Geral' },
        password:
          '$2b$10$tV1AhMRqCdZTnSEV18aoR.MSJ.1zu7PIewZKDn1GkoTSqvrSNENC2',
        status: true,
      } as unknown as User;
      manager.findOne.mockResolvedValue(user);
      passwordService.compare.mockResolvedValue(false);

      const result = await service.validateUser('123', 'pass');
      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('should return access and refresh tokens', async () => {
      const user = {
        id: 'user-1',
        nome: 'Usuário Teste',
        cpf: '12345678900',
        funcao: 'Técnico',
        company_id: 'company-1',
        profile: { nome: 'Administrador Geral' },
      } as unknown as User;
      const result = await service.login(user);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).toEqual(expect.objectContaining({ id: user.id }));
      expect(redisService.storeRefreshToken).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('should return new access token if refresh token is valid', async () => {
      jwtService.sign
        .mockReturnValueOnce('new-access-token')
        .mockReturnValueOnce('new-refresh-token');
      jwtService.verifyAsync.mockResolvedValue({
        sub: '123',
        cpf: '123',
        company_id: '123',
      });
      redisService.atomicConsumeRefreshToken.mockResolvedValue('1');

      const result = await service.refresh('valid-refresh-token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(redisService.atomicConsumeRefreshToken).toHaveBeenCalled();
      expect(redisService.storeRefreshToken).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if refresh token is invalid', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error());
      await expect(service.refresh('invalid')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
