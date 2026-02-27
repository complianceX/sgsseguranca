import {
  Controller,
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
import { Public } from '../common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 tentativas/min
  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = (await this.authService.validateUser(
      body.cpf,
      body.password,
    )) as User;
    if (!user) {
      const maskedCpf = body.cpf.replace(/\d(?=\d{2})/g, '*');
      this.logger.warn({ event: 'login_failed', cpf: maskedCpf });
      throw new UnauthorizedException('Credenciais inválidas');
    }
    this.logger.log({ event: 'login_success', userId: user.id });

    const result = await this.authService.login(user);

    // Access token - curta duração
    response.cookie('access_token', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutos
    });

    // Refresh token - longa duração
    response.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
      path: '/auth/refresh',
    });

    return { user: result.user };
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
    const result = await this.authService.refresh(refreshToken);

    res.cookie('access_token', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutos
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

    return { success: true };
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
    response.clearCookie('access_token');
    response.clearCookie('refresh_token', { path: '/auth/refresh' });
    return { success: true };
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
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
}
