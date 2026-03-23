import {
  Controller,
  Get,
  Post,
  Body,
  UnauthorizedException,
  UseGuards,
  Request,
  Logger,
  Res,
  Req,
} from '@nestjs/common';
import type { Response, Request as ExpressRequest } from 'express';
import { AuthService } from './auth.service';
import type { User } from '../users/entities/user.entity';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from '../common/decorators/public.decorator';
import { TenantOptional } from '../common/decorators/tenant-optional.decorator';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from '../users/users.service';
import { BruteForceService } from './brute-force.service';
import { RbacService } from '../rbac/rbac.service';
import { getRequestIp } from '../common/utils/request-ip.util';
import {
  getRefreshTokenClearCookieOptions,
  getRefreshTokenCookieOptions,
} from './auth-security.config';
import { SetSignaturePinDto } from './dto/set-signature-pin.dto';
import { ConfirmPasswordDto } from './dto/confirm-password.dto';
import type {
  AuthMeResponseDto,
  AuthSessionResponseDto,
  RefreshAccessTokenResponseDto,
  SignaturePinConfiguredResponseDto,
  SignaturePinStatusResponseDto,
} from './dto/auth-response.dto';
import { SecurityAuditService } from '../common/security/security-audit.service';
import { Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../common/redis/redis.constants';
import type { Redis } from 'ioredis';
import * as crypto from 'crypto';

const isProd = process.env.NODE_ENV === 'production';
const LOGIN_THROTTLE_LIMIT = Number(
  process.env.LOGIN_THROTTLE_LIMIT || (isProd ? 5 : 30),
);
const LOGIN_THROTTLE_TTL = Number(process.env.LOGIN_THROTTLE_TTL || 60000);
const CHANGE_PASSWORD_THROTTLE_LIMIT = Number(
  process.env.CHANGE_PASSWORD_THROTTLE_LIMIT || (isProd ? 5 : 30),
);
const CHANGE_PASSWORD_THROTTLE_TTL = Number(
  process.env.CHANGE_PASSWORD_THROTTLE_TTL || 60000,
);
type AuthenticatedRequest = ExpressRequest & {
  user?: {
    userId?: string;
  };
};

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private bruteForceService: BruteForceService,
    private rbacService: RbacService,
    private securityAudit: SecurityAuditService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Public()
  @Throttle({
    default: { limit: LOGIN_THROTTLE_LIMIT, ttl: LOGIN_THROTTLE_TTL },
  })
  @Post('login')
  async login(
    @Req() req: ExpressRequest,
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponseDto> {
    const tracker = getRequestIp(req);
    await this.bruteForceService.assertAllowed(tracker);
    await this.bruteForceService.assertCpfAllowed(body.cpf);
    const user = (await this.authService.validateUser(
      body.cpf,
      body.password,
    )) as User;
    if (!user) {
      await this.bruteForceService.registerFailure(tracker);
      await this.bruteForceService.registerCpfFailure(body.cpf);
      const maskedCpf = body.cpf.replace(/\d(?=\d{2})/g, '*');
      this.logger.warn({ event: 'login_failed', cpf: maskedCpf });
      throw new UnauthorizedException('Credenciais inválidas');
    }
    this.logger.log({ event: 'login_success', userId: user.id });
    this.securityAudit.loginSuccess(
      user.id,
      tracker ?? undefined,
      String(req.headers['user-agent'] || ''),
    );
    await this.bruteForceService.reset(tracker);
    await this.bruteForceService.resetCpf(body.cpf);

    const result = await this.authService.login(user, {
      userAgent: String(req.headers['user-agent'] || ''),
    });
    const access = await this.rbacService.getUserAccess(user.id);

    // Refresh token - longa duração
    response.cookie(
      'refresh_token',
      result.refreshToken,
      getRefreshTokenCookieOptions(),
    );

    // Modelo oficial: access token em Authorization Bearer (não em cookie).
    return {
      accessToken: result.accessToken,
      user: result.user,
      roles: access.roles,
      permissions: access.permissions,
    };
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshAccessTokenResponseDto> {
    const refreshToken = (req.cookies as Record<string, string>)[
      'refresh_token'
    ];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token não encontrado');
    }
    const result = await this.authService.refresh(refreshToken, {
      userAgent: String(req.headers['user-agent'] || ''),
    });

    if (result.refreshToken) {
      res.cookie(
        'refresh_token',
        result.refreshToken,
        getRefreshTokenCookieOptions(),
      );
    }

    return { accessToken: result.accessToken };
  }

  @Public()
  @Post('logout')
  async logout(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = (req.cookies as Record<string, string>)[
      'refresh_token'
    ];
    // Extrair o access token do header Authorization para adicioná-lo à blacklist.
    const authHeader = req.headers['authorization'] ?? '';
    const accessToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;

    if (refreshToken || accessToken) {
      await this.authService.logout(refreshToken ?? '', accessToken);
    }
    response.clearCookie('refresh_token', getRefreshTokenClearCookieOptions());
    return { success: true };
  }

  @Throttle({
    default: {
      limit: CHANGE_PASSWORD_THROTTLE_LIMIT,
      ttl: CHANGE_PASSWORD_THROTTLE_TTL,
    },
  })
  @TenantOptional()
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @Request() req: { user?: { userId?: string } },
    @Body() body: ChangePasswordDto,
  ) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    const result = await this.authService.changePassword(
      req.user.userId,
      body.currentPassword,
      body.newPassword,
    );
    this.logger.log({ event: 'password_changed', userId: req.user.userId });
    return result;
  }

  @Public()
  @Throttle({
    default: { limit: LOGIN_THROTTLE_LIMIT, ttl: LOGIN_THROTTLE_TTL },
  })
  @Post('forgot-password')
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return await this.authService.forgotPassword(body.cpf);
  }

  @Public()
  @Throttle({
    default: { limit: LOGIN_THROTTLE_LIMIT, ttl: LOGIN_THROTTLE_TTL },
  })
  @Post('reset-password')
  async resetPassword(@Body() body: ResetPasswordDto) {
    return await this.authService.resetPassword(body.token, body.newPassword);
  }

  @TenantOptional()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(
    @Request() req: { user?: { userId?: string } },
  ): Promise<AuthMeResponseDto> {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    const user = await this.usersService.findOne(req.user.userId);
    const access = await this.rbacService.getUserAccess(req.user.userId);
    return { user, roles: access.roles, permissions: access.permissions };
  }

  // ---------------------------------------------------------------------------
  // Step-up authentication: confirm password to get a short-lived token
  // for sensitive operations (signatures, approvals, deletions, exports).
  // ---------------------------------------------------------------------------

  @Throttle({
    default: {
      limit: CHANGE_PASSWORD_THROTTLE_LIMIT,
      ttl: CHANGE_PASSWORD_THROTTLE_TTL,
    },
  })
  @TenantOptional()
  @UseGuards(JwtAuthGuard)
  @Post('confirm-password')
  async confirmPassword(
    @Request() req: AuthenticatedRequest,
    @Body() body: ConfirmPasswordDto,
  ): Promise<{ stepUpToken: string; expiresIn: number }> {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    const user = await this.usersService.findOneWithPassword(req.user.userId);
    if (!user?.password) {
      throw new UnauthorizedException('Usuário sem senha definida');
    }
    const { PasswordService } =
      await import('../common/services/password.service');
    const pwService = new PasswordService();
    const match = await pwService.compare(body.password, user.password);
    if (!match) {
      this.securityAudit.stepUpFailed(req.user.userId, 'wrong_password');
      throw new UnauthorizedException('Senha incorreta');
    }

    const stepUpToken = crypto.randomBytes(32).toString('hex');
    const ttlSeconds = 600; // 10 minutes
    const redisKey = `stepup:${req.user.userId}:${stepUpToken}`;
    await this.redis.setex(redisKey, ttlSeconds, '1');

    this.securityAudit.stepUpIssued(req.user.userId, 'confirm-password');

    return { stepUpToken, expiresIn: ttlSeconds };
  }

  // ---------------------------------------------------------------------------
  // Signature PIN endpoints
  // ---------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard)
  @Get('signature-pin/status')
  async getSignaturePinStatus(
    @Request() req: AuthenticatedRequest,
  ): Promise<SignaturePinStatusResponseDto> {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    const hasPin = await this.usersService.hasSignaturePin(req.user.userId);
    return { has_pin: hasPin };
  }

  @UseGuards(JwtAuthGuard)
  @Post('signature-pin')
  async setSignaturePin(
    @Request() req: AuthenticatedRequest,
    @Body() dto: SetSignaturePinDto,
  ): Promise<SignaturePinConfiguredResponseDto> {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    await this.usersService.setSignaturePin(
      req.user.userId,
      dto.pin,
      dto.current_password,
    );
    return { ok: true, message: 'PIN de assinatura configurado com sucesso.' };
  }
}
