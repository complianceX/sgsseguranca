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
import { getRepositoryToken } from '@nestjs/typeorm';
import { TokenRevocationService } from './token-revocation.service';
import { MailService } from '../mail/mail.service';
import { UserSession } from './entities/user-session.entity';

type UserSessionRepositoryMock = {
  insert: jest.Mock<Promise<unknown>, [Partial<UserSession>]>;
  update: jest.Mock<Promise<{ affected?: number }>, [unknown?, unknown?]>;
  findOne: jest.Mock<Promise<UserSession | null>, [unknown?]>;
};

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: jest.Mocked<JwtService>;
  let passwordService: jest.Mocked<PasswordService>;
  let redisService: jest.Mocked<RedisService>;
  let usersService: {
    findOneWithPassword: jest.Mock;
    update: jest.Mock;
    syncSupabaseAuthByUserId: jest.Mock;
  };
  let configService: { get: jest.Mock };
  let mailService: { sendMailSimple: jest.Mock };
  let dataSource: { transaction: jest.Mock; query: jest.Mock };
  let userSessionRepository: UserSessionRepositoryMock;
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
      query: jest.fn().mockResolvedValue([]),
    };
    userSessionRepository = {
      insert: jest
        .fn<Promise<unknown>, [Partial<UserSession>]>()
        .mockResolvedValue({ identifiers: [{ id: 'session-1' }] }),
      update: jest
        .fn<Promise<{ affected?: number }>, [unknown?, unknown?]>()
        .mockResolvedValue({ affected: 1 }),
      findOne: jest
        .fn<Promise<UserSession | null>, [unknown?]>()
        .mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: getRepositoryToken(UserSession),
          useValue: userSessionRepository,
        },
        {
          provide: UsersService,
          useValue: (usersService = {
            findOneWithPassword: jest.fn(),
            update: jest.fn(),
            syncSupabaseAuthByUserId: jest
              .fn()
              .mockResolvedValue('auth-user-1'),
          }),
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
            hash: jest
              .fn()
              .mockResolvedValue('$argon2id$v=19$m=65536$new-hash'),
            isLegacyHash: jest.fn().mockReturnValue(false),
            validate: jest.fn().mockReturnValue({ valid: true }),
          },
        },
        {
          provide: RedisService,
          useValue: {
            storeRefreshToken: jest.fn().mockResolvedValue(undefined),
            enforceMaxSessions: jest.fn().mockResolvedValue([]),
            atomicConsumeRefreshToken: jest.fn().mockResolvedValue('1'),
            isTokenConsumed: jest.fn().mockResolvedValue(false),
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
          useValue: (configService = {
            get: jest.fn((key: string) => {
              if (key === 'JWT_SECRET') return 'test-access-secret-1234567890';
              if (key === 'JWT_REFRESH_SECRET') {
                return 'test-refresh-secret-1234567890';
              }
              if (key === 'LEGACY_PASSWORD_AUTH_ENABLED') {
                return true;
              }
              if (key === 'SUPABASE_PASSWORD_SYNC_ON_LOCAL_LOGIN') {
                return true;
              }
              return null;
            }),
          }),
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
            sendMailSimple: jest
              .fn()
              .mockResolvedValue({ info: {}, usingTestAccount: false }),
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
      const userRow = {
        id: 'user-1',
        nome: 'Usuário Teste',
        cpf: '12345678900',
        email: 'user@example.com',
        funcao: 'Técnico',
        company_id: 'company-1',
        site_id: null,
        profile_id: 'profile-1',
        profile_nome: 'Administrador Geral',
        auth_user_id: 'auth-user-1',
        password:
          '$2b$10$tV1AhMRqCdZTnSEV18aoR.MSJ.1zu7PIewZKDn1GkoTSqvrSNENC2',
        status: true,
      };
      dataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM _ctx, users u')) {
          return [userRow];
        }
        return [];
      });
      passwordService.isLegacyHash.mockReturnValue(true);
      passwordService.verify.mockResolvedValue(true);

      const result = (await service.validateUser(
        '12345678900',
        'password',
      )) as Partial<User>;

      await new Promise((resolve) => setImmediate(resolve));

      expect(result).toEqual(
        expect.objectContaining({
          id: userRow.id,
          profile: { id: 'profile-1', nome: 'Administrador Geral' },
        }),
      );
      expect(result.password).toBeUndefined();
      expect(usersService.syncSupabaseAuthByUserId).toHaveBeenCalledWith(
        'user-1',
        { password: 'password' },
      );
    });

    it('should return null if user not found', async () => {
      dataSource.query.mockResolvedValue([]);
      const result = await service.validateUser('123', 'pass');
      expect(result).toBeNull();
    });

    it('should return null if password does not match', async () => {
      const userRow = {
        id: 'user-1',
        nome: 'Usuário Teste',
        cpf: '12345678900',
        email: 'user@example.com',
        funcao: 'Técnico',
        company_id: 'company-1',
        site_id: null,
        profile_id: 'profile-1',
        profile_nome: 'Administrador Geral',
        auth_user_id: 'auth-user-1',
        password:
          '$2b$10$tV1AhMRqCdZTnSEV18aoR.MSJ.1zu7PIewZKDn1GkoTSqvrSNENC2',
        status: true,
      };
      dataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM _ctx, users u')) {
          return [userRow];
        }
        if (sql.includes('FROM auth.users')) {
          return [];
        }
        return [];
      });
      passwordService.isLegacyHash.mockReturnValue(true);
      passwordService.verify.mockResolvedValue(false);

      const result = await service.validateUser('123', 'pass');
      expect(result).toBeNull();
    });

    it('should authenticate via Supabase password when legacy auth is disabled', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return 'test-access-secret-1234567890';
        if (key === 'JWT_REFRESH_SECRET') {
          return 'test-refresh-secret-1234567890';
        }
        if (key === 'LEGACY_PASSWORD_AUTH_ENABLED') {
          return false;
        }
        if (key === 'SUPABASE_PASSWORD_SYNC_ON_LOCAL_LOGIN') {
          return true;
        }
        return null;
      });

      const userRow = {
        id: 'user-1',
        nome: 'Usuário Teste',
        cpf: '12345678900',
        email: 'user@example.com',
        funcao: 'Técnico',
        company_id: 'company-1',
        auth_user_id: '11111111-1111-1111-1111-111111111111',
        site_id: null,
        profile_id: 'profile-1',
        profile_nome: 'Administrador Geral',
        password: '$argon2id$v=19$m=65536,t=3,p=4$legacy$shadow-hash',
        status: true,
      };
      dataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM _ctx, users u')) {
          return [userRow];
        }
        if (sql.includes('FROM auth.users')) {
          return [
            {
              encrypted_password:
                '$argon2id$v=19$m=65536,t=3,p=4$supabase$authoritative-hash',
            },
          ];
        }
        return [];
      });
      passwordService.isLegacyHash.mockReturnValue(false);
      passwordService.verify.mockResolvedValue(true);

      const result = await service.validateUser('12345678900', 'password');

      expect(result).toEqual(expect.objectContaining({ id: 'user-1' }));
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM auth.users'),
        ['11111111-1111-1111-1111-111111111111', 'user@example.com'],
      );
      expect(usersService.syncSupabaseAuthByUserId).not.toHaveBeenCalled();
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
      const savedSessionArg = userSessionRepository.insert.mock.calls[0]?.[0] as
        | Partial<UserSession>
        | undefined;
      expect(savedSessionArg?.user_id).toBe('user-1');
      expect(typeof savedSessionArg?.token_hash).toBe('string');
      expect(savedSessionArg?.is_active).toBe(true);
    });
  });

  describe('legacy cutover', () => {
    it('changePassword atualiza Supabase Auth e shadow hash local quando auth legada está desativada', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'LEGACY_PASSWORD_AUTH_ENABLED') {
          return false;
        }
        if (key === 'JWT_REFRESH_SECRET') {
          return 'test-refresh-secret-1234567890';
        }
        if (key === 'JWT_SECRET') {
          return 'test-access-secret-1234567890';
        }
        return null;
      });

      usersService.findOneWithPassword.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        auth_user_id: '11111111-1111-1111-1111-111111111111',
        password: '$argon2id$v=19$m=65536,t=3,p=4$shadow$hash',
      } as Partial<User>);
      dataSource.query.mockResolvedValue([
        {
          encrypted_password: '$argon2id$v=19$m=65536,t=3,p=4$supabase$hash',
        },
      ]);
      passwordService.isLegacyHash.mockReturnValue(false);
      passwordService.verify.mockResolvedValue(true);

      const result = await service.changePassword(
        'user-1',
        'Atual@123',
        'NovaSenha@123',
      );

      expect(result).toEqual({ message: 'Senha atualizada com sucesso' });
      expect(usersService.syncSupabaseAuthByUserId).toHaveBeenCalledWith(
        'user-1',
        { password: 'NovaSenha@123' },
      );
      expect(manager.update).toHaveBeenCalledWith(
        User,
        { id: 'user-1' },
        {
          password: '$argon2id$v=19$m=65536$new-hash',
        },
      );
      expect(redisService.clearAllRefreshTokens.mock.calls[0]).toEqual([
        'user-1',
      ]);
    });
  });

  describe('verifyUserPassword', () => {
    it('prioriza a senha local quando auth legada está habilitada', async () => {
      usersService.findOneWithPassword.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        password:
          '$2b$10$tV1AhMRqCdZTnSEV18aoR.MSJ.1zu7PIewZKDn1GkoTSqvrSNENC2',
      } as Partial<User>);
      passwordService.isLegacyHash.mockReturnValue(true);
      passwordService.verify.mockResolvedValue(true);

      const result = await service.verifyUserPassword('user-1', 'Atual@123');

      expect(result).toBe(true);
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('faz fallback para o hash do Supabase quando a senha local falha', async () => {
      usersService.findOneWithPassword.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        auth_user_id: '11111111-1111-1111-1111-111111111111',
        password:
          '$2b$10$tV1AhMRqCdZTnSEV18aoR.MSJ.1zu7PIewZKDn1GkoTSqvrSNENC2',
      } as Partial<User>);
      passwordService.isLegacyHash
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      passwordService.verify
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      dataSource.query.mockResolvedValue([
        {
          encrypted_password: '$argon2id$v=19$m=65536,t=3,p=4$supabase$hash',
        },
      ]);

      const result = await service.verifyUserPassword('user-1', 'Atual@123');

      expect(result).toBe(true);
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM auth.users'),
        ['11111111-1111-1111-1111-111111111111', 'user@example.com'],
      );
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
      expect(userSessionRepository.update).toHaveBeenCalled();
    });

    it('recovers refresh token from persisted session when Redis lost the key', async () => {
      jwtService.sign
        .mockReturnValueOnce('new-access-token')
        .mockReturnValueOnce('new-refresh-token');
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        cpf: '123',
        company_id: 'company-1',
      });
      redisService.atomicConsumeRefreshToken.mockResolvedValue(null);
      redisService.isTokenConsumed.mockResolvedValue(false);
      userSessionRepository.findOne.mockResolvedValue({
        user_id: 'user-1',
        token_hash: 'existing-hash',
        is_active: true,
        expires_at: new Date('2099-01-01T00:00:00Z'),
      } as UserSession);

      const result = await service.refresh('valid-refresh-token');

      expect(result.accessToken).toBe('new-access-token');
      expect(userSessionRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user_id: 'user-1',
            is_active: true,
          }),
        }),
      );
      expect(userSessionRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          is_active: true,
        }),
        expect.objectContaining({
          token_hash: expect.any(String),
          is_active: true,
        }),
      );
      expect(userSessionRepository.insert).not.toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-1' }),
      );
    });

    it('rejects refresh when Redis misses the key and persisted session is inactive', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        cpf: '123',
        company_id: 'company-1',
      });
      redisService.atomicConsumeRefreshToken.mockResolvedValue(null);
      redisService.isTokenConsumed.mockResolvedValue(false);
      userSessionRepository.findOne.mockResolvedValue(null);

      await expect(service.refresh('revoked-refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
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
        expect.stringContaining('/auth/reset-password/'),
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
      mailService.sendMailSimple.mockRejectedValueOnce(
        new Error('smtp unavailable'),
      );

      const result = await service.forgotPassword('12345678900');

      expect(result.message).toContain('Se o CPF estiver cadastrado');
      expect(mailService.sendMailSimple).toHaveBeenCalledTimes(1);
    });
  });

  describe('session hardening', () => {
    it('logout revoga sessão persistida quando refresh token é válido', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        cpf: '123',
        company_id: 'company-1',
      });
      await service.logout('valid-refresh-token');

      expect(userSessionRepository.update).toHaveBeenCalledWith(
        {
          user_id: 'user-1',
          token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
          is_active: true,
        },
        expect.objectContaining({
          is_active: false,
          revoked_at: expect.any(Date),
        }),
      );
    });
  });
});
