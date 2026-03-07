import { Controller, Get, UseGuards } from '@nestjs/common';
import { CircuitBreakerService } from '../common/resilience/circuit-breaker.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { Authorize } from '../auth/authorize.decorator';

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
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  /**
   * Health check básico
   */
  @Get()
  @Authorize('can_view_system_health')
  async healthCheck() {
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
    const [dbStatus, memoryUsage] = await Promise.all([
      this.checkDatabase(),
      this.getMemoryUsage(),
    ]);

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
   * Verificar status do banco de dados
   */
  private async checkDatabase(): Promise<{
    healthy: boolean;
    responseTime: number;
    error?: string;
  }> {
    const startTime = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return {
        healthy: true,
        responseTime: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        healthy: false,
        responseTime: Date.now() - startTime,
        error: error?.message || 'Unknown error',
      };
    }
  }

  /**
   * Obter uso de memória
   */
  private getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      rss: Math.round(usage.rss / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024), // MB
      percentage: Math.round((usage.heapUsed / usage.heapTotal) * 100),
    };
  }

  /**
   * Endpoint de readiness (para Kubernetes)
   */
  @Get('ready')
  @Authorize('can_view_system_health')
  async readiness() {
    const dbStatus = await this.checkDatabase();

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
  async liveness() {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
