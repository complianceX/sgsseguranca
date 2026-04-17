import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Detector de N+1 queries baseado nos eventos do logger do TypeORM.
 *
 * Não depende de DataSource no bootstrap para evitar ciclos de injeção
 * durante a inicialização do TypeORM no Render.
 */
@Injectable()
export class N1QueryDetectorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(N1QueryDetectorService.name);
  private readonly queries: QueryLog[] = [];
  private readonly queryPatterns = new Map<string, QueryPattern>();
  private readonly enabled: boolean;
  private readonly threshold: number;
  private readonly slowQueryThresholdMs: number;
  private readonly maxQueriesInMemory: number;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<boolean>(
      'N1_QUERY_DETECTION_ENABLED',
      process.env.NODE_ENV === 'development',
    );
    this.threshold = this.configService.get<number>('N1_QUERY_THRESHOLD', 5);
    this.slowQueryThresholdMs = this.configService.get<number>(
      'N1_SLOW_QUERY_THRESHOLD',
      100,
    );
    this.maxQueriesInMemory = this.configService.get<number>(
      'N1_MAX_QUERIES_IN_MEMORY',
      1000,
    );
  }

  onModuleInit(): void {
    this.logger.log(
      `N+1 Query Detection: ${this.enabled ? 'ENABLED' : 'DISABLED'}`,
    );
  }

  logQuery(
    query: string,
    parameters?: unknown[],
    executionTime = 0,
    error?: unknown,
  ): void {
    if (!this.enabled) {
      return;
    }

    const normalizedQuery = this.normalizeQuery(query);
    const pattern = this.queryPatterns.get(normalizedQuery) ?? {
      pattern: normalizedQuery,
      count: 0,
      totalTime: 0,
      errors: 0,
      lastSeen: 0,
    };

    pattern.count += 1;
    pattern.totalTime += executionTime;
    pattern.lastSeen = Date.now();
    if (error) {
      pattern.errors += 1;
    }

    this.queryPatterns.set(normalizedQuery, pattern);

    if (this.queries.length >= this.maxQueriesInMemory) {
      this.queries.shift();
    }

    this.queries.push({
      query: normalizedQuery,
      parameters,
      executionTime,
      timestamp: Date.now(),
      error: this.serializeError(error),
    });

    this.checkForSuspiciousPatterns(pattern);
  }

  analyzeQueries(): N1SuspectReport {
    const report: N1SuspectReport = {
      totalQueries: this.queries.length,
      uniquePatterns: this.queryPatterns.size,
      suspects: [],
      slowQueries: [],
      errorQueries: [],
      timestamp: new Date().toISOString(),
    };

    for (const pattern of this.queryPatterns.values()) {
      const avgTime = pattern.count > 0 ? pattern.totalTime / pattern.count : 0;

      if (pattern.count >= this.threshold) {
        report.suspects.push({
          pattern: pattern.pattern,
          count: pattern.count,
          avgTime: Math.round(avgTime),
          type: 'REPEATED_QUERY',
          severity: this.calculateSeverity(pattern.count, avgTime),
          suggestion: this.generateSuggestion(pattern.pattern, pattern),
        });
      }

      if (avgTime > this.slowQueryThresholdMs) {
        report.slowQueries.push({
          pattern: pattern.pattern.substring(0, 100),
          count: pattern.count,
          avgTime: Math.round(avgTime),
          severity: avgTime > 1000 ? 'CRITICAL' : 'HIGH',
        });
      }

      if (pattern.errors > 0) {
        const errorRate = (pattern.errors / pattern.count) * 100;
        report.errorQueries.push({
          pattern: pattern.pattern.substring(0, 100),
          totalErrors: pattern.errors,
          errorRate: Math.round(errorRate),
          severity: errorRate > 20 ? 'CRITICAL' : 'MEDIUM',
        });
      }
    }

    report.slowQueries = report.slowQueries
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 10);
    report.errorQueries = report.errorQueries
      .sort((a, b) => b.totalErrors - a.totalErrors)
      .slice(0, 5);

    return report;
  }

  reset(): void {
    this.queries.length = 0;
    this.queryPatterns.clear();
    this.logger.log('N+1 Query Detector: Logs reset');
  }

  exportReport(): string {
    return JSON.stringify(this.analyzeQueries(), null, 2);
  }

  onModuleDestroy(): void {
    this.reset();
  }

  private checkForSuspiciousPatterns(pattern: QueryPattern): void {
    const avgTime = pattern.totalTime / pattern.count;
    const truncatedPattern = pattern.pattern.substring(0, 100);

    if (pattern.count === this.threshold) {
      this.logger.warn({
        event: 'n1_query_detected',
        pattern: truncatedPattern,
        count: pattern.count,
        avgTime: Math.round(avgTime),
        severity: this.calculateSeverity(pattern.count, avgTime),
        suggestion: this.generateSuggestion(pattern.pattern, pattern),
      });
    }

    if (avgTime > this.slowQueryThresholdMs) {
      this.logger.warn({
        event: 'slow_query_detected',
        pattern: truncatedPattern,
        avgTime: Math.round(avgTime),
        count: pattern.count,
        severity: avgTime > 1000 ? 'CRITICAL' : 'HIGH',
        suggestion: 'Add database index or optimize query',
      });
    }

    if (pattern.errors > 0 && pattern.errors / pattern.count > 0.1) {
      this.logger.error({
        event: 'error_prone_query',
        pattern: truncatedPattern,
        errorRate: Math.round((pattern.errors / pattern.count) * 100),
        totalErrors: pattern.errors,
        severity: 'MEDIUM',
        suggestion: 'Review query logic or add validation',
      });
    }
  }

  private normalizeQuery(query: string): string {
    return query
      .replace(/\b\d+\b/g, '?')
      .replace(/'[^']*'/g, '?')
      .replace(/\$[0-9]+/g, '?')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  private calculateSeverity(
    count: number,
    avgTime: number,
  ): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    if (count > 20 || avgTime > 1000) {
      return 'CRITICAL';
    }
    if (count > 10 || avgTime > 500) {
      return 'HIGH';
    }
    if (count > 5 || avgTime > 200) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  private generateSuggestion(pattern: string, data: QueryPattern): string {
    const upperPattern = pattern.toUpperCase();

    if (
      upperPattern.includes('SELECT') &&
      upperPattern.includes('WHERE ID = ?')
    ) {
      return 'Use DataLoader for batch loading or add JOIN to parent query';
    }

    if (upperPattern.includes('INSERT') && data.count > 10) {
      return 'Consider bulk insert or batch processing';
    }

    if (upperPattern.includes('UPDATE') && data.count > 5) {
      return 'Batch updates or use single update with CASE statement';
    }

    return 'Review query for optimization opportunities';
  }

  private serializeError(error?: unknown): string | undefined {
    if (!error) {
      return undefined;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return typeof error === 'string' ? error : 'Unknown error';
  }
}

interface QueryLog {
  query: string;
  parameters?: unknown[];
  executionTime: number;
  timestamp: number;
  error?: string;
}

interface QueryPattern {
  pattern: string;
  count: number;
  totalTime: number;
  errors: number;
  lastSeen: number;
}

export interface N1SuspectReport {
  totalQueries: number;
  uniquePatterns: number;
  suspects: {
    pattern: string;
    count: number;
    avgTime: number;
    type: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    suggestion: string;
  }[];
  slowQueries: {
    pattern: string;
    count: number;
    avgTime: number;
    severity: 'CRITICAL' | 'HIGH';
  }[];
  errorQueries: {
    pattern: string;
    totalErrors: number;
    errorRate: number;
    severity: 'CRITICAL' | 'MEDIUM';
  }[];
  timestamp: string;
}
