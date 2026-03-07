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
import { Throttle } from '@nestjs/throttler';
import { UsersService } from '../users/users.service';
import { BruteForceService } from './brute-force.service';
import { RbacService } from '../rbac/rbac.service';

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

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private bruteForceService: BruteForceService,
    private rbacService: RbacService,
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
  ) {
    const ip = req.ip || '';
    await this.bruteForceService.assertAllowed(ip);
    const user = (await this.authService.validateUser(
      body.cpf,
      body.password,
    )) as User;
    if (!user) {
      await this.bruteForceService.registerFailure(ip);
      const maskedCpf = body.cpf.replace(/\d(?=\d{2})/g, '*');
      this.logger.warn({ event: 'login_failed', cpf: maskedCpf });
      throw new UnauthorizedException('Credenciais inválidas');
    }
    this.logger.log({ event: 'login_success', userId: user.id });
    await this.bruteForceService.reset(ip);

    const result = await this.authService.login(user, {
      userAgent: String(req.headers['user-agent'] || ''),
    });
    const access = await this.rbacService.getUserAccess(user.id);

    // Refresh token - longa duração
    response.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
      path: '/auth/refresh',
    });

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
  ) {
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
      res.cookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/auth/refresh',
      });
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
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    response.clearCookie('refresh_token', { path: '/auth/refresh' });
    return { success: true };
  }

  @Throttle({
    default: {
      limit: CHANGE_PASSWORD_THROTTLE_LIMIT,
      ttl: CHANGE_PASSWORD_THROTTLE_TTL,
    },
  })
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

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Request() req: { user?: { userId?: string } }) {
    if (!req.user?.userId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    const user = await this.usersService.findOne(req.user.userId);
    const access = await this.rbacService.getUserAccess(req.user.userId);
    return { user, roles: access.roles, permissions: access.permissions };
  }
}
