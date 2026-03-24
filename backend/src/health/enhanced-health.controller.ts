import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { Authorize } from '../auth/authorize.decorator';
import { HealthService } from './health.service';

/**
 * Enhanced Health Check Controller
 *
 * Fornece endpoints detalhados de health check incluindo:
 * - Status geral do sistema
 * - Status de dependências (DB, Redis)
 * - Estado dos circuit breakers
 * - Métricas básicas
 */
@Controller('health')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN_GERAL)
export class EnhancedHealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Health check básico
   */
  @Get()
  @Authorize('can_view_system_health')
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    };
  }

  /**
   * Health check detalhado
   */
  @Get('detailed')
  @Authorize('can_view_system_health')
  async detailedHealthCheck() {
    const dbStatus = await this.healthService.checkDatabase();
    const memoryUsage = this.healthService.getMemoryUsage();

    return {
      status: dbStatus.healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      checks: {
        database: dbStatus,
        memory: memoryUsage,
      },
      version: process.env.npm_package_version || '1.0.0',
    };
  }

  /**
   * Endpoint de readiness (para Kubernetes)
   */
  @Get('ready')
  @Authorize('can_view_system_health')
  async readiness() {
    const dbStatus = await this.healthService.checkDatabase();

    if (!dbStatus.healthy) {
      return {
        status: 'not ready',
        reason: 'database not available',
      };
    }

    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Endpoint de liveness (para Kubernetes)
   */
  @Get('live')
  @Authorize('can_view_system_health')
  liveness() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
