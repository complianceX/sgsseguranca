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
  Param,
  Header,
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
  REFRESH_CSRF_COOKIE_NAME,
  getLegacyRequestCsrfClearCookieOptions,
  getRequestCsrfCookieOptions,
  getLegacyRefreshCsrfClearCookieOptions,
  getRefreshCsrfClearCookieOptions,
  getRefreshCsrfCookieOptions,
  getRefreshTokenClearCookieOptions,
  getRefreshTokenCookieOptions,
  isRefreshCsrfEnforced,
  isRefreshCsrfReportOnly,
} from './auth-security.config';
import { SetSignaturePinDto } from './dto/set-signature-pin.dto';
import { ConfirmPasswordDto } from './dto/confirm-password.dto';
import type {
  AuthMeResponseDto,
  AuthLoginResponseDto,
  AuthSessionResponseDto,
  RefreshAccessTokenResponseDto,
  SignaturePinConfiguredResponseDto,
  SignaturePinStatusResponseDto,
} from './dto/auth-response.dto';
import { SecurityAuditService } from '../common/security/security-audit.service';
import * as crypto from 'crypto';
import { TurnstileService } from './turnstile.service';
import { ConfigService } from '@nestjs/config';
import { TenantThrottle } from '../common/decorators/tenant-throttle.decorator';
import {
  normalizeOriginValue,
  resolveAllowedCorsOrigins,
} from '../common/security/cors-origins';
import { profileStage } from '../common/observability/perf-stage.util';
import { MfaService } from './services/mfa.service';
import {
  ActivateBootstrapMfaDto,
  ActivateMfaEnrollmentDto,
  DisableMfaDto,
  MfaStatusResponseDto,
  VerifyLoginMfaDto,
  VerifyStepUpDto,
} from './dto/mfa.dto';

const isProd = process.env.NODE_ENV === 'production';
const LOGIN_THROTTLE_LIMIT = Number(
  process.env.LOGIN_THROTTLE_LIMIT || (isProd ? 5 : 30),
);
const LOGIN_THROTTLE_TTL = Number(process.env.LOGIN_THROTTLE_TTL || 60000);
const FORGOT_PASSWORD_THROTTLE_LIMIT = Number(
  process.env.FORGOT_PASSWORD_THROTTLE_LIMIT || (isProd ? 3 : 30),
);
const FORGOT_PASSWORD_THROTTLE_TTL = Number(
  process.env.FORGOT_PASSWORD_THROTTLE_TTL || 60000,
);
const CHANGE_PASSWORD_THROTTLE_LIMIT = Number(
  process.env.CHANGE_PASSWORD_THROTTLE_LIMIT || (isProd ? 5 : 30),
);
const CHANGE_PASSWORD_THROTTLE_TTL = Number(
  process.env.CHANGE_PASSWORD_THROTTLE_TTL || 60000,
);
const AUTH_ME_THROTTLE_LIMIT = Number(
  process.env.AUTH_ME_THROTTLE_LIMIT || (isProd ? 1200 : 6000),
);
const AUTH_ME_THROTTLE_TTL = Number(process.env.AUTH_ME_THROTTLE_TTL || 60000);
const AUTH_ME_TENANT_THROTTLE_LIMIT = Number(
  process.env.AUTH_ME_TENANT_THROTTLE_LIMIT || AUTH_ME_THROTTLE_LIMIT,
);
const AUTH_ME_TENANT_THROTTLE_HOUR_LIMIT = Number(
  process.env.AUTH_ME_TENANT_THROTTLE_HOUR_LIMIT ||
  AUTH_ME_TENANT_THROTTLE_LIMIT * 60,
);
type AuthenticatedRequest = ExpressRequest & {
  user?: {
    userId?: string;
    company_id?: string;
    cpf?: string;
    jti?: string;
    profile?: { nome?: string };
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
    private turnstileService: TurnstileService,
    private readonly mfaService: MfaService,
    private readonly configService: ConfigService,
  ) { }

  @Public()
  @Get('csrf')
  getCsrfToken(@Res({ passthrough: true }) response: Response) {
    const token = crypto.randomBytes(32).toString('hex');
    response.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate, private',
    );
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
    response.clearCookie(
      'csrf-token',
      getLegacyRequestCsrfClearCookieOptions(),
    );
    response.cookie('csrf-token', token, getRequestCsrfCookieOptions());
    return { csrfToken: token };
  }

  @Public()
  @Throttle({
    default: { limit: LOGIN_THROTTLE_LIMIT, ttl: LOGIN_THROTTLE_TTL },
  })
  @Post('login')
  async login(
    @Req() req: ExpressRequest,
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthLoginResponseDto> {
    const tracker = getRequestIp(req);
    await profileStage({
      logger: this.logger,
      route: '/auth/login',
      stage: 'pre_auth_checks',
      run: async () => {
        await Promise.all([
          this.turnstileService.assertHuman(body.turnstileToken, {
            remoteIp: tracker,
            expectedAction: 'login',
          }),
          this.bruteForceService.assertAllowed(tracker),
          this.bruteForceService.assertCpfAllowed(body.cpf),
        ]);
      },
    });
    const user = (await profileStage({
      logger: this.logger,
      route: '/auth/login',
      stage: 'validate_user',
      run: () => this.authService.validateUser(body.cpf, body.password),
    })) as User;
    if (!user) {
      await Promise.allSettled([
        this.bruteForceService.registerFailure(tracker),
        this.bruteForceService.registerCpfFailure(body.cpf),
      ]);
      const maskedCpf = body.cpf.replace(/\d(?=\d{2})/g, '*');
      this.logger.warn({ event: 'login_failed', cpf: maskedCpf });
      this.securityAudit.loginFailed(
        body.cpf,
        tracker ?? undefined,
        'invalid_credentials',
        String(req.headers['user-agent'] || ''),
      );
      throw new UnauthorizedException('Credenciais inválidas');
    }
    await Promise.allSettled([
      this.bruteForceService.reset(tracker),
      this.bruteForceService.resetCpf(body.cpf),
    ]);

    const profileName =
      typeof user.profile === 'object' && user.profile
        ? String((user.profile as { nome?: string }).nome || '')
        : '';
    if (
      this.mfaService.isEnabled() &&
      this.mfaService.requiresMfa(profileName)
    ) {
      const status = await this.mfaService.getStatus({
        userId: user.id,
        profileName,
      });
      if (!status.enabled) {
        const bootstrap =
          await this.mfaService.createBootstrapEnrollmentResponse({
            id: user.id,
            nome: user.nome || '',
            cpf: user.cpf || null,
            funcao: user.funcao || null,
            company_id: user.company_id || '',
            profile: { nome: profileName || null },
            auth_user_id: user.auth_user_id || null,
          });
        return {
          mfaEnrollRequired: true,
          challengeToken: bootstrap.challengeToken,
          expiresIn: bootstrap.expiresIn,
          otpAuthUrl: bootstrap.otpAuthUrl,
          manualEntryKey: bootstrap.manualEntryKey,
          recoveryCodes: bootstrap.recoveryCodes,
        };
      }

      const challenge = await this.mfaService.createLoginChallenge({
        userId: user.id,
        companyId: user.company_id || '',
      });
      return {
        mfaRequired: true,
        challengeToken: challenge.challengeToken,
        expiresIn: challenge.expiresIn,
        methods: challenge.methods,
      };
    }

    return this.issueAuthenticatedSession(user, req, response);
  }

  @Public()
  @Throttle({
    default: { limit: LOGIN_THROTTLE_LIMIT, ttl: LOGIN_THROTTLE_TTL },
  })
  @Post('login/mfa/verify')
  async verifyLoginMfa(
    @Req() req: ExpressRequest,
    @Body() body: VerifyLoginMfaDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponseDto> {
    const result = await this.mfaService.verifyLoginChallenge({
      challengeToken: body.challengeToken,
      code: body.code,
    });
    const user = (await this.usersService.findAuthSessionUser(
      result.userId,
    )) as unknown as User;
    return this.issueAuthenticatedSession(user, req, response);
  }

  @Public()
  @Throttle({
    default: { limit: LOGIN_THROTTLE_LIMIT, ttl: LOGIN_THROTTLE_TTL },
  })
  @Post('login/mfa/bootstrap/activate')
  async activateBootstrapMfa(
    @Req() req: ExpressRequest,
    @Body() body: ActivateBootstrapMfaDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponseDto> {
    const result = await this.mfaService.activateBootstrapChallenge({
      challengeToken: body.challengeToken,
      code: body.code,
    });
    const user = (await this.usersService.findAuthSessionUser(
      result.userId,
    )) as unknown as User;
    return this.issueAuthenticatedSession(user, req, response);
  }

  @Public()
  @Post('refresh')
  @Throttle({
    default: {
      limit: Number(process.env.REFRESH_THROTTLE_LIMIT || (isProd ? 5 : 20)),
      ttl: Number(process.env.REFRESH_THROTTLE_TTL || 60_000),
    },
  })
  async refresh(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshAccessTokenResponseDto> {
    this.assertSameOrigin(req);
    this.assertRefreshCsrf(req);
    const refreshToken = (req.cookies as Record<string, string>)[
      'refresh_token'
    ];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token não encontrado');
    }
    const result = await profileStage({
      logger: this.logger,
      route: '/auth/refresh',
      stage: 'refresh_session',
      run: () =>
        this.authService.refresh(refreshToken, {
          userAgent: String(req.headers['user-agent'] || ''),
          ip: getRequestIp(req) ?? undefined,
        }),
    });

    if (result.refreshToken) {
      res.cookie(
        'refresh_token',
        result.refreshToken,
        getRefreshTokenCookieOptions(),
      );
      res.clearCookie(
        REFRESH_CSRF_COOKIE_NAME,
        getLegacyRefreshCsrfClearCookieOptions(),
      );
      res.cookie(
        REFRESH_CSRF_COOKIE_NAME,
        this.generateRefreshCsrfToken(),
        getRefreshCsrfCookieOptions(),
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
    this.securityAudit.logout(
      (req as AuthenticatedRequest).user?.userId,
      getRequestIp(req) ?? undefined,
      String(req.headers['user-agent'] || ''),
    );
    response.clearCookie('refresh_token', getRefreshTokenClearCookieOptions());
    response.clearCookie(
      REFRESH_CSRF_COOKIE_NAME,
      getLegacyRefreshCsrfClearCookieOptions(),
    );
    response.clearCookie(
      REFRESH_CSRF_COOKIE_NAME,
      getRefreshCsrfClearCookieOptions(),
    );
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
    this.securityAudit.passwordChanged(req.user.userId);
    return result;
  }

  @Public()
  @Throttle({
    default: {
      limit: FORGOT_PASSWORD_THROTTLE_LIMIT,
      ttl: FORGOT_PASSWORD_THROTTLE_TTL,
    },
  })
  @Post('forgot-password')
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return await this.authService.forgotPassword(body.cpf);
  }

  @Public()
  @Get('reset-password/:token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store, max-age=0')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  resetPasswordPage(@Param('token') token: string): string {
    const safeToken = JSON.stringify(String(token || ''));
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="no-referrer" />
  <title>Redefinir senha</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: Arial, sans-serif; background: #f4f1eb; color: #26231f; }
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .card { width: 100%; max-width: 420px; background: #fff; border: 1px solid #ddd3ca; border-radius: 16px; padding: 28px; box-shadow: 0 12px 30px rgba(0,0,0,.06); }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { margin: 0 0 18px; color: #665f58; line-height: 1.5; }
    label { display:block; margin: 14px 0 6px; font-weight: 700; font-size: 14px; }
    input { width: 100%; box-sizing: border-box; padding: 12px 14px; border-radius: 10px; border: 1px solid #cfc5bc; font-size: 15px; }
    button { width: 100%; margin-top: 18px; padding: 12px 14px; border: 0; border-radius: 10px; background: #2f5d46; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; }
    button:disabled { opacity: .7; cursor: not-allowed; }
    .msg { margin-top: 14px; font-size: 14px; line-height: 1.5; }
    .error { color: #b3261e; }
    .success { color: #1d6b43; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Redefinir senha</h1>
      <p>Defina uma nova senha para concluir a recuperação de acesso.</p>
      <form id="resetForm">
        <label for="newPassword">Nova senha</label>
        <input id="newPassword" type="password" minlength="8" autocomplete="new-password" required />
        <label for="confirmPassword">Confirmar senha</label>
        <input id="confirmPassword" type="password" minlength="8" autocomplete="new-password" required />
        <button id="submitButton" type="submit">Redefinir senha</button>
        <div id="message" class="msg"></div>
      </form>
    </div>
  </div>
  <script>
    const token = ${safeToken};
    const form = document.getElementById('resetForm');
    const message = document.getElementById('message');
    const submitButton = document.getElementById('submitButton');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      message.textContent = '';
      message.className = 'msg';
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      if (newPassword !== confirmPassword) {
        message.textContent = 'As senhas não coincidem.';
        message.classList.add('error');
        return;
      }
      submitButton.disabled = true;
      try {
        const response = await fetch('/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, newPassword })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          message.textContent = payload?.message || 'Não foi possível redefinir a senha.';
          message.classList.add('error');
          return;
        }
        message.textContent = 'Senha redefinida com sucesso. Você já pode fazer login.';
        message.classList.add('success');
        form.reset();
      } catch {
        message.textContent = 'Falha de rede ao redefinir a senha.';
        message.classList.add('error');
      } finally {
        submitButton.disabled = false;
      }
    });
  </script>
</body>
</html>`;
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
  @Throttle({
    default: {
      limit: AUTH_ME_THROTTLE_LIMIT,
      ttl: AUTH_ME_THROTTLE_TTL,
    },
  })
  @TenantThrottle({
    requestsPerMinute: AUTH_ME_TENANT_THROTTLE_LIMIT,
    requestsPerHour: AUTH_ME_TENANT_THROTTLE_HOUR_LIMIT,
  })
  @Get('me')
  async me(
    @Request() req: { user?: { userId?: string } },
  ): Promise<AuthMeResponseDto> {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }

    const user = await profileStage({
      logger: this.logger,
      route: '/auth/me',
      stage: 'load_auth_session_user',
      userId: req.user.userId,
      run: () => this.usersService.findAuthSessionUser(req.user!.userId!),
    });

    const access = await profileStage({
      logger: this.logger,
      route: '/auth/me',
      stage: 'resolve_access_bundle',
      userId: req.user.userId,
      companyId: user.company_id,
      run: () =>
        this.rbacService.getUserAccess(req.user!.userId!, {
          profileName: user.profile?.nome,
        }),
    });

    return { user, roles: access.roles, permissions: access.permissions };
  }

  @TenantOptional()
  @UseGuards(JwtAuthGuard)
  @Get('mfa/status')
  async getMfaStatus(
    @Request() req: { user?: { userId?: string; profile?: { nome?: string } } },
  ): Promise<MfaStatusResponseDto> {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    return this.mfaService.getStatus({
      userId: req.user.userId,
      profileName: req.user.profile?.nome,
    });
  }

  @TenantOptional()
  @UseGuards(JwtAuthGuard)
  @Post('mfa/enroll')
  async enrollMfa(@Request() req: AuthenticatedRequest): Promise<{
    otpAuthUrl: string;
    manualEntryKey: string;
    recoveryCodes: string[];
  }> {
    if (!req.user?.userId || !req.user.company_id) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    return this.mfaService.startEnrollment({
      userId: req.user.userId,
      companyId: req.user.company_id,
      label: req.user.cpf || req.user.userId,
    });
  }

  @TenantOptional()
  @UseGuards(JwtAuthGuard)
  @Post('mfa/activate')
  async activateMfa(
    @Request() req: AuthenticatedRequest,
    @Body() body: ActivateMfaEnrollmentDto,
  ) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    await this.mfaService.activateEnrollment({
      userId: req.user.userId,
      code: body.code,
    });
    return { success: true };
  }

  @TenantOptional()
  @UseGuards(JwtAuthGuard)
  @Post('mfa/recovery-codes/regenerate')
  async regenerateRecoveryCodes(@Request() req: AuthenticatedRequest) {
    if (!req.user?.userId || !req.user.company_id) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    const recoveryCodes = await this.mfaService.regenerateRecoveryCodes({
      userId: req.user.userId,
      companyId: req.user.company_id,
    });
    return { recoveryCodes };
  }

  @TenantOptional()
  @UseGuards(JwtAuthGuard)
  @Post('mfa/disable')
  async disableMfa(
    @Request() req: AuthenticatedRequest,
    @Body() body: DisableMfaDto,
  ) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    await this.mfaService.disableMfa({
      userId: req.user.userId,
      code: body.code,
    });
    return { success: true };
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

    return this.mfaService.verifyStepUp({
      userId: req.user.userId,
      profileName: req.user.profile?.nome || null,
      reason: 'legacy_confirm_password',
      password: body.password,
      accessJti: req.user.jti,
    });
  }

  @Throttle({
    default: {
      limit: CHANGE_PASSWORD_THROTTLE_LIMIT,
      ttl: CHANGE_PASSWORD_THROTTLE_TTL,
    },
  })
  @TenantOptional()
  @UseGuards(JwtAuthGuard)
  @Post('step-up/verify')
  async verifyStepUp(
    @Request() req: AuthenticatedRequest,
    @Body() body: VerifyStepUpDto,
  ): Promise<{ stepUpToken: string; expiresIn: number }> {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }

    return this.mfaService.verifyStepUp({
      userId: req.user.userId,
      profileName: req.user.profile?.nome || null,
      reason: body.reason,
      code: body.code,
      password: body.password,
      accessJti: req.user.jti,
    });
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

  private async issueAuthenticatedSession(
    user: User,
    req: ExpressRequest,
    response: Response,
  ): Promise<AuthSessionResponseDto> {
    const tracker = getRequestIp(req);
    const [result, access] = await profileStage({
      logger: this.logger,
      route: '/auth/login',
      stage: 'issue_session_and_rbac',
      companyId: user.company_id || undefined,
      userId: user.id,
      run: () =>
        Promise.all([
          this.authService.login(user, {
            userAgent: String(req.headers['user-agent'] || ''),
            ip: tracker ?? undefined,
          }),
          this.rbacService.getUserAccess(user.id, {
            profileName: user.profile?.nome,
          }),
        ]),
    });

    response.cookie(
      'refresh_token',
      result.refreshToken,
      getRefreshTokenCookieOptions(),
    );
    response.clearCookie(
      REFRESH_CSRF_COOKIE_NAME,
      getLegacyRefreshCsrfClearCookieOptions(),
    );
    response.cookie(
      REFRESH_CSRF_COOKIE_NAME,
      this.generateRefreshCsrfToken(),
      getRefreshCsrfCookieOptions(),
    );

    this.logger.log({ event: 'login_success', userId: user.id });
    this.securityAudit.loginSuccess(
      user.id,
      tracker ?? undefined,
      String(req.headers['user-agent'] || ''),
    );

    return {
      accessToken: result.accessToken,
      user: result.user,
      roles: access.roles,
      permissions: access.permissions,
    };
  }

  /**
   * Mitigação simples de CSRF para o fluxo de refresh baseado em cookie.
   * Permite:
   *  - chamadas sem Origin/Referer (navegação same-site)
   *  - Origin/Referer que comecem com alguma origem de CORS_ALLOWED_ORIGINS
   */
  private assertSameOrigin(req: ExpressRequest) {
    const originHeader = req.headers['origin'];
    const refererHeader = req.headers['referer'];
    const origin =
      typeof originHeader === 'string' ? originHeader.trim() : undefined;
    const referer =
      typeof refererHeader === 'string' ? refererHeader.trim() : undefined;
    const headerValue = origin || referer;
    if (!headerValue) return;

    const allowed = resolveAllowedCorsOrigins({
      isProduction: process.env.NODE_ENV === 'production',
      configuredOriginsRaw: this.configService.get<string>(
        'CORS_ALLOWED_ORIGINS',
      ),
    });

    const requestOrigin = normalizeOriginValue(headerValue);
    if (!requestOrigin) {
      throw new UnauthorizedException('Origem não autorizada para refresh');
    }

    const isAllowed = allowed.some((allowedOrigin) => {
      const normalizedAllowed = normalizeOriginValue(allowedOrigin);
      return normalizedAllowed === requestOrigin;
    });
    if (!isAllowed) {
      throw new UnauthorizedException('Origem não autorizada para refresh');
    }
  }

  private generateRefreshCsrfToken(): string {
    return crypto.randomBytes(24).toString('base64url');
  }

  private assertRefreshCsrf(req: ExpressRequest) {
    const cookieToken = (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_CSRF_COOKIE_NAME
    ];
    const headerToken = String(req.headers['x-refresh-csrf'] || '').trim();

    if (!cookieToken || !headerToken) {
      if (isRefreshCsrfEnforced()) {
        throw new UnauthorizedException('CSRF token ausente para refresh');
      }
      if (isRefreshCsrfReportOnly()) {
        this.logger.warn({
          event: 'refresh_csrf_missing',
          hasCookie: Boolean(cookieToken),
          hasHeader: Boolean(headerToken),
          path: req.originalUrl || req.url,
        });
      }
      return;
    }

    if (cookieToken !== headerToken) {
      if (isRefreshCsrfEnforced()) {
        throw new UnauthorizedException('CSRF token inválido para refresh');
      }
      if (isRefreshCsrfReportOnly()) {
        this.logger.warn({
          event: 'refresh_csrf_mismatch',
          path: req.originalUrl || req.url,
        });
      }
    }
  }
}
