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
import { TokenRevocationService } from './token-revocation.service';
import { MailService } from '../mail/mail.service';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: jest.Mocked<JwtService>;
  let passwordService: jest.Mocked<PasswordService>;
  let redisService: jest.Mocked<RedisService>;
  let mailService: { sendMailSimple: jest.Mock };
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
      transaction: jest.fn((callback: (txManager: typeof manager) => unknown) =>
        Promise.resolve(callback(manager)),
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
            verify: jest.fn().mockResolvedValue(true),
            compare: jest.fn().mockResolvedValue(true),
            hash: jest.fn().mockResolvedValue('$argon2id$v=19$m=65536$new-hash'),
            isLegacyHash: jest.fn().mockReturnValue(false),
            validate: jest.fn().mockReturnValue({ valid: true }),
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
            get: jest.fn((key: string) => {
              if (key === 'JWT_SECRET') return 'test-access-secret-1234567890';
              if (key === 'JWT_REFRESH_SECRET') {
                return 'test-refresh-secret-1234567890';
              }
              return null;
            }),
          },
        },
        {
          provide: TokenRevocationService,
          useValue: {
            isRevoked: jest.fn().mockResolvedValue(false),
            revoke: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendMailSimple: jest.fn().mockResolvedValue({ info: {}, usingTestAccount: false }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get(JwtService);
    passwordService = module.get(PasswordService);
    redisService = module.get(RedisService);
    mailService = module.get(MailService);
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
      passwordService.isLegacyHash.mockReturnValue(true);
      passwordService.verify.mockResolvedValue(true);

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
      passwordService.isLegacyHash.mockReturnValue(true);
      passwordService.verify.mockResolvedValue(false);

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
      const refreshTokenCall = jwtService.sign.mock.calls[1];
      expect(refreshTokenCall?.[0]).toEqual(
        expect.objectContaining({ sub: user.id }),
      );
      expect(refreshTokenCall?.[1]).toEqual(
        expect.objectContaining({
          expiresIn: '30d',
          secret: 'test-refresh-secret-1234567890',
        }),
      );
      expect(redisService.storeRefreshToken.mock.calls).toHaveLength(1);
    });
  });

  describe('refresh', () => {
    it('should return new access token if refresh token is valid', async () => {
      jwtService.sign
        .mockReturnValueOnce('new-access-token')
        .mockReturnValueOnce('new-refresh-token');
      const verifiedPayload = {
        sub: '123',
        cpf: '123',
        company_id: '123',
      };
      jwtService.verifyAsync.mockResolvedValue(verifiedPayload);
      redisService.atomicConsumeRefreshToken.mockResolvedValue('1');

      const result = await service.refresh('valid-refresh-token');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(jwtService.verifyAsync.mock.calls[0]).toEqual([
        'valid-refresh-token',
        expect.objectContaining({
          secret: 'test-refresh-secret-1234567890',
        }),
      ]);
      expect(redisService.atomicConsumeRefreshToken.mock.calls).toHaveLength(1);
      expect(redisService.storeRefreshToken.mock.calls).toHaveLength(1);
    });

    it('should throw UnauthorizedException if refresh token is invalid', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error());
      await expect(service.refresh('invalid')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
  describe('forgotPassword', () => {
    it('should send reset email via MailService for an existing user', async () => {
      manager.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        nome: 'Usuário Teste',
        status: true,
      } as Partial<User>);

      const result = await service.forgotPassword('12345678900');

      expect(result.message).toContain('Se o CPF estiver cadastrado');
      expect(mailService.sendMailSimple).toHaveBeenCalledTimes(1);
      expect(mailService.sendMailSimple).toHaveBeenCalledWith(
        'user@example.com',
        'Redefinição de senha — SGS',
        expect.stringContaining('/reset-password?token='),
        { userId: 'user-1' },
        undefined,
        expect.objectContaining({ filename: 'password-reset' }),
      );
    });

    it('should keep a successful public response if e-mail delivery fails', async () => {
      manager.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        nome: 'Usuário Teste',
        status: true,
      } as Partial<User>);
      mailService.sendMailSimple.mockRejectedValueOnce(new Error('smtp unavailable'));

      const result = await service.forgotPassword('12345678900');

      expect(result.message).toContain('Se o CPF estiver cadastrado');
      expect(mailService.sendMailSimple).toHaveBeenCalledTimes(1);
    });
  });

});
