import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { PasswordService } from '../common/services/password.service';
import { TestHelper } from '../../test/helpers/test.helper';
import { UnauthorizedException } from '@nestjs/common';
import { User } from '../users/entities/user.entity';
import { RedisService } from '../common/redis/redis.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let passwordService: jest.Mocked<PasswordService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findOneByCpf: jest.fn(),
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
            getClient: () => ({
              get: jest.fn().mockResolvedValue('1'),
              setex: jest.fn().mockResolvedValue('OK'),
              del: jest.fn().mockResolvedValue(1),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    passwordService = module.get(PasswordService);
  });

  describe('validateUser', () => {
    it('should return user without password if validation succeeds', async () => {
      const user = { ...TestHelper.mockUser(), password: 'hashed-password' };
      usersService.findOneByCpf.mockResolvedValue(user);
      passwordService.compare.mockResolvedValue(true);

      const result = (await service.validateUser(
        '12345678900',
        'password',
      )) as Partial<User>;

      expect(result).toEqual(expect.objectContaining({ id: user.id }));
      expect(result.password).toBeUndefined();
    });

    it('should return null if user not found', async () => {
      usersService.findOneByCpf.mockResolvedValue(null);
      const result = await service.validateUser('123', 'pass');
      expect(result).toBeNull();
    });

    it('should return null if password does not match', async () => {
      const user = { ...TestHelper.mockUser(), password: 'hashed-password' };
      usersService.findOneByCpf.mockResolvedValue(user);
      passwordService.compare.mockResolvedValue(false);

      const result = await service.validateUser('123', 'pass');
      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('should return access and refresh tokens', async () => {
      const user = TestHelper.mockUser();
      const result = await service.login(user);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).toEqual(expect.objectContaining({ id: user.id }));
    });
  });

  describe('refresh', () => {
    it('should return new access token if refresh token is valid', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: '123',
        cpf: '123',
        company_id: '123',
      });
      const result = await service.refresh('valid-refresh-token');
      expect(result).toHaveProperty('accessToken');
    });

    it('should throw UnauthorizedException if refresh token is invalid', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error());
      await expect(service.refresh('invalid')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
