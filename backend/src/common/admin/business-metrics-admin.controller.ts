import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '../../auth/enums/roles.enum';
import { TenantOptional } from '../decorators/tenant-optional.decorator';
import { BusinessMetricsSummaryService } from '../observability/business-metrics-summary.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service';
import {
  N1QueryDetectorService,
  N1SuspectReport,
} from '../database/n1-query-detector.service';

@Controller('admin/metrics')
@TenantOptional()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN_GERAL)
export class BusinessMetricsAdminController {
  constructor(
    private readonly businessMetricsSummaryService: BusinessMetricsSummaryService,
    @InjectQueue('mail') private readonly mailQueue: Queue,
    @InjectQueue('pdf') private readonly pdfQueue: Queue,
    @InjectQueue('document-import') private readonly documentImportQueue: Queue,
    private readonly redisService: RedisService,
    private readonly n1QueryDetector: N1QueryDetectorService,
  ) { }

  @Get('business')
  async getBusinessMetrics() {
    return this.businessMetricsSummaryService.getBusinessSummaryByTenant();
  }

  @Get('performance')
  async getPerformanceMetrics() {
    const [mailQueueStats, pdfQueueStats, documentImportQueueStats] = await Promise.all([
      this.getQueueStats(this.mailQueue),
      this.getQueueStats(this.pdfQueue),
      this.getQueueStats(this.documentImportQueue),
    ]);

    const cacheStats = await this.getCacheStats();
    const n1Report = this.n1QueryDetector.analyzeQueries();

    return {
      timestamp: new Date().toISOString(),
      queues: {
        mail: mailQueueStats,
        pdf: pdfQueueStats,
        document_import: documentImportQueueStats,
      },
      cache: cacheStats,
      database: {
        n1_queries: {
          total_queries: n1Report.totalQueries,
          unique_patterns: n1Report.uniquePatterns,
          critical_suspects: n1Report.suspects.filter(s => s.severity === 'CRITICAL').length,
          high_suspects: n1Report.suspects.filter(s => s.severity === 'HIGH').length,
          slow_queries_count: n1Report.slowQueries.length,
        },
      },
      alerts: this.generateAlerts(mailQueueStats, pdfQueueStats, documentImportQueueStats, cacheStats, n1Report),
    };
  }

  private async getQueueStats(queue: Queue) {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed(),
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        total: waiting.length + active.length + completed.length + failed.length + delayed.length,
        health: this.assessQueueHealth(waiting.length, active.length, failed.length),
      };
    } catch (error) {
      return {
        error: error.message,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        total: 0,
        health: 'ERROR',
      };
    }
  }

  private async getCacheStats() {
    try {
      // Tentar obter stats do Redis INFO command
      const info = await this.redisService.getClient().info();
      const lines = info.split('\n');
      const stats: any = {};

      lines.forEach(line => {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = value;
        }
      });

      return {
        hits: parseInt(stats.keyspace_hits || '0'),
        misses: parseInt(stats.keyspace_misses || '0'),
        hit_rate: stats.keyspace_hits && stats.keyspace_misses
          ? (parseInt(stats.keyspace_hits) / (parseInt(stats.keyspace_hits) + parseInt(stats.keyspace_misses))) * 100
          : 0,
        memory_used: stats.used_memory_human || 'unknown',
        connected_clients: parseInt(stats.connected_clients || '0'),
        health: 'OK',
      };
    } catch (error) {
      return {
        error: error.message,
        hits: 0,
        misses: 0,
        hit_rate: 0,
        memory_used: 'unknown',
        connected_clients: 0,
        health: 'ERROR',
      };
    }
  }

  private assessQueueHealth(waiting: number, active: number, failed: number): 'HEALTHY' | 'WARNING' | 'CRITICAL' {
    if (failed > 10 || waiting > 50) return 'CRITICAL';
    if (failed > 5 || waiting > 20) return 'WARNING';
    return 'HEALTHY';
  }

  private generateAlerts(
    mailStats: any,
    pdfStats: any,
    docStats: any,
    cacheStats: any,
    n1Report: N1SuspectReport,
  ) {
    const alerts = [];

    // Queue alerts
    if (mailStats.health === 'CRITICAL') {
      alerts.push({
        level: 'CRITICAL',
        component: 'mail_queue',
        message: `Mail queue critical: ${mailStats.waiting} waiting, ${mailStats.failed} failed`,
        action: 'Check mail service and increase workers',
      });
    }

    if (pdfStats.health === 'CRITICAL') {
      alerts.push({
        level: 'CRITICAL',
        component: 'pdf_queue',
        message: `PDF queue critical: ${pdfStats.waiting} waiting, ${pdfStats.failed} failed`,
        action: 'Check PDF generation and increase workers',
      });
    }

    // Cache alerts
    if (cacheStats.hit_rate < 50 && cacheStats.hit_rate > 0) {
      alerts.push({
        level: 'WARNING',
        component: 'cache',
        message: `Low cache hit rate: ${cacheStats.hit_rate.toFixed(1)}%`,
        action: 'Review cache TTLs and keys',
      });
    }

    // N+1 alerts
    if (
      n1Report.suspects.filter((s) => s.severity === 'CRITICAL').length > 0
    ) {
      alerts.push({
        level: 'CRITICAL',
        component: 'database',
        message: `${n1Report.suspects.filter((s) => s.severity === 'CRITICAL').length} critical N+1 patterns detected`,
        action: 'Fix N+1 queries immediately',
      });
    }

    return alerts;
  }
}
