import {
  Controller,
  Post,
  Get,
  Request,
  UseGuards,
  HttpException,
  HttpStatus,
  Body,
} from '@nestjs/common';
import { TenantRateLimitService } from '../rate-limit/tenant-rate-limit.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '../../auth/enums/roles.enum';
import { Authorize } from '../../auth/authorize.decorator';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    companyId: string;
    email: string;
  };
}

/**
 * EXEMPLO DE USO DO RATE LIMITING POR TENANT
 *
 * Este controller demonstra como usar o Rate Limiting para limitar
 * requisições por tenant baseado no plano contratado.
 */
@Controller('examples/rate-limit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN_GERAL)
export class RateLimitExampleController {
  constructor(private readonly rateLimitService: TenantRateLimitService) {}

  /**
   * Exemplo 1: Rate limiting em endpoint de criação de relatório
   */
  @Post('reports')
  @Authorize('can_view_system_health')
  async createReport(
    @Request() req: AuthenticatedRequest,
    @Body() _data: unknown,
  ) {
    // Verificar limite do tenant
    const limit = await this.rateLimitService.checkLimit(
      req.user.companyId,
      'PROFESSIONAL', // Ou buscar do banco de dados
    );

    if (!limit.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Rate limit exceeded',
          retryAfter: limit.retryAfter,
          resetAt: new Date(limit.resetAt).toISOString(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Processar criação do relatório
    return {
      message: 'Report created successfully',
      remaining: limit.remaining,
      resetAt: new Date(limit.resetAt).toISOString(),
    };
  }

  /**
   * Exemplo 2: Rate limiting em endpoint de geração de PDF
   */
  @Post('pdf/generate')
  @Authorize('can_view_system_health')
  async generatePdf(
    @Request() req: AuthenticatedRequest,
    @Body() _data: unknown,
  ) {
    const limit = await this.rateLimitService.checkLimit(
      req.user.companyId,
      'STARTER',
    );

    if (!limit.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'PDF generation rate limit exceeded',
          retryAfter: limit.retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Gerar PDF
    return {
      message: 'PDF generated successfully',
      remaining: limit.remaining,
    };
  }

  /**
   * Exemplo 3: Rate limiting em endpoint de API pública
   */
  @Get('public/data')
  @Authorize('can_view_system_health')
  async getPublicData(@Request() req: AuthenticatedRequest) {
    const limit = await this.rateLimitService.checkLimit(
      req.user.companyId,
      'FREE',
    );

    if (!limit.allowed) {
      throw new HttpException(
        'Rate limit exceeded for free tier',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return {
      data: 'Public data',
      rateLimit: {
        remaining: limit.remaining,
        resetAt: new Date(limit.resetAt).toISOString(),
      },
    };
  }

  /**
   * Exemplo 4: Verificar estatísticas de uso do tenant
   */
  @Get('stats')
  @Authorize('can_view_system_health')
  async getTenantStats(@Request() req: AuthenticatedRequest) {
    const stats = await this.rateLimitService.getTenantStats(
      req.user.companyId,
    );

    return {
      companyId: req.user.companyId,
      usage: {
        minute: stats.minuteUsage,
        hour: stats.hourUsage,
      },
    };
  }

  /**
   * Exemplo 5: Resetar limite do tenant (admin only)
   */
  @Post('reset')
  @Authorize('can_view_system_health')
  async resetTenantLimit(@Request() req: AuthenticatedRequest) {
    // Em produção, adicionar guard de admin aqui
    await this.rateLimitService.resetTenant(req.user.companyId);

    return {
      message: 'Rate limit reset successfully',
      companyId: req.user.companyId,
    };
  }
}
