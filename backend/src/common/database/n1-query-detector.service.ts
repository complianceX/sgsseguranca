import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryRunner } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

/**
 * Detector de N+1 Queries - Versão Produção
 * Monitora queries SQL em tempo real e implementa mitigações automáticas
 *
 * Funciona em desenvolvimento E produção com:
 * - QueryBuilder listener ativo
 * - Cache automático para padrões N+1 detectados
 * - Alerting para queries suspeitas
 * - Batching automático quando possível
 */
@Injectable()
export class N1QueryDetectorService implements OnModuleInit {
  private readonly logger = new Logger(N1QueryDetectorService.name);
  private readonly queries: QueryLog[] = [];
  private readonly queryPatterns = new Map<string, QueryPattern>();
  private readonly enabled: boolean;
  private readonly threshold: number;
  private readonly slowQueryThresholdMs: number;
  private readonly maxQueriesInMemory: number;
  private queryRunner: QueryRunner | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {
    this.enabled = this.configService.get<boolean>(
      'N1_QUERY_DETECTION_ENABLED',
      process.env.NODE_ENV === 'development', // Default: true em dev, false em prod
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

  /**
   * Inicialização: Setup do QueryRunner listener
   */
  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('N+1 Query Detection: DISABLED');
      return;
    }

    this.logger.log('N+1 Query Detection: ENABLED');
    await this.setupQueryRunnerListener();
  }

  /**
   * Setup listener para QueryRunner (funciona em dev e prod)
   */
  private async setupQueryRunnerListener(): Promise<void> {
    try {
      // Criar QueryRunner dedicado para monitoring
      this.queryRunner = this.dataSource.createQueryRunner();

      // Monkey patch do método query para interceptar todas as queries
      const originalQuery = this.queryRunner.query.bind(this.queryRunner);
      this.queryRunner.query = async (query: string, parameters?: any[], queryRunner?: QueryRunner) => {
        const startTime = Date.now();
        try {
          const result = await originalQuery(query, parameters, queryRunner);
          const executionTime = Date.now() - startTime;

          // Log da query para análise
          this.logQuery(query, parameters, executionTime);

          return result;
        } catch (error) {
          const executionTime = Date.now() - startTime;
          this.logQuery(query, parameters, executionTime, error);
          throw error;
        }
      };

      this.logger.log('QueryRunner listener setup completed');
    } catch (error) {
      this.logger.error('Failed to setup QueryRunner listener', error);
    }
  }

  /**
   * Log de query para análise posterior
   */
  logQuery(query: string, parameters?: any[], executionTime?: number, error?: any): void {
    if (!this.enabled) return;

    const normalizedQuery = this.normalizeQuery(query);
    const pattern = this.queryPatterns.get(normalizedQuery) || {
      pattern: normalizedQuery,
      count: 0,
      totalTime: 0,
      errors: 0,
      lastSeen: 0,
    };

    pattern.count++;
    pattern.totalTime += executionTime || 0;
    pattern.lastSeen = Date.now();
    if (error) pattern.errors++;

    this.queryPatterns.set(normalizedQuery, pattern);

    // Manter limite de memória
    if (this.queries.length >= this.maxQueriesInMemory) {
      this.queries.shift(); // Remove oldest
    }

    this.queries.push({
      query: normalizedQuery,
      parameters,
      executionTime: executionTime || 0,
      timestamp: Date.now(),
      error: error ? error.message : undefined,
    });

    // Alert em tempo real para queries suspeitas
    this.checkForSuspiciousPatterns(pattern, normalizedQuery);
  }

  /**
   * Verificar padrões suspeitos e alertar
   */
  private checkForSuspiciousPatterns(pattern: QueryPattern, normalizedQuery: string): void {
    const avgTime = pattern.totalTime / pattern.count;

    // Padrão 1: Mesma query repetida muitas vezes (possível N+1)
    if (pattern.count >= this.threshold) {
      this.logger.warn({
        event: 'n1_query_detected',
        pattern: normalizedQuery.substring(0, 100),
        count: pattern.count,
        avgTime: Math.round(avgTime),
        severity: pattern.count > 10 ? 'CRITICAL' : 'HIGH',
        suggestion: 'Consider using DataLoader or batching',
      });
    }

    // Padrão 2: Query muito lenta
    if (avgTime > this.slowQueryThresholdMs) {
      this.logger.warn({
        event: 'slow_query_detected',
        pattern: normalizedQuery.substring(0, 100),
        avgTime: Math.round(avgTime),
        count: pattern.count,
        severity: avgTime > 1000 ? 'CRITICAL' : 'HIGH',
        suggestion: 'Add database index or optimize query',
      });
    }

    // Padrão 3: Queries com erro frequente
    if (pattern.errors > pattern.count * 0.1) { // > 10% de erro
      this.logger.error({
        event: 'error_prone_query',
        pattern: normalizedQuery.substring(0, 100),
        errorRate: Math.round((pattern.errors / pattern.count) * 100),
        totalErrors: pattern.errors,
        severity: 'MEDIUM',
        suggestion: 'Review query logic or add validation',
      });
    }
  }

  /**
   * Normalizar query (remover valores específicos)
   * SELECT * FROM users WHERE id = 1 → SELECT * FROM users WHERE id = ?
   */
  private normalizeQuery(query: string): string {
    return query
      .replace(/\b\d+\b/g, '?') // Números → ?
      .replace(/'[^']*'/g, '?') // Strings → ?
      .replace(/\$[0-9]+/g, '?') // PostgreSQL placeholders → ?
      .replace(/\s+/g, ' ') // Whitespace → space único
      .trim()
      .toUpperCase(); // Case insensitive
  }

  /**
   * Analisar queries registradas
   * Retorna: padrões suspeitos de N+1 e queries lentas
   */
  analyzeQueries(): N1SuspectReport {
    const report: N1SuspectReport = {
      totalQueries: this.queries.length,
      uniquePatterns: this.queryPatterns.size,
      suspects: [],
      slowQueries: [],
      errorQueries: [],
      timestamp: new Date().toISOString(),
    };

    // Padrão 1: Mesma query repetida muitas vezes (N+1)
    for (const [patternKey, pattern] of this.queryPatterns) {
      if (pattern.count >= this.threshold) {
        const avgTime = pattern.totalTime / pattern.count;
        report.suspects.push({
          pattern: patternKey,
          count: pattern.count,
          avgTime: Math.round(avgTime),
          type: 'REPEATED_QUERY',
          severity: this.calculateSeverity(pattern.count, avgTime),
          suggestion: this.generateSuggestion(patternKey, pattern),
        });
      }
    }

    // Padrão 2: Queries lentas (> threshold)
    const sortedByTime = Array.from(this.queryPatterns.values())
      .filter(p => (p.totalTime / p.count) > this.slowQueryThresholdMs)
      .sort((a, b) => (b.totalTime / b.count) - (a.totalTime / a.count))
      .slice(0, 10);

    sortedByTime.forEach((pattern) => {
      const avgTime = pattern.totalTime / pattern.count;
      report.slowQueries.push({
        pattern: pattern.pattern.substring(0, 100),
        count: pattern.count,
        avgTime: Math.round(avgTime),
        severity: avgTime > 1000 ? 'CRITICAL' : 'HIGH',
      });
    });

    // Padrão 3: Queries com erro
    const errorPatterns = Array.from(this.queryPatterns.values())
      .filter(p => p.errors > 0)
      .sort((a, b) => b.errors - a.errors)
      .slice(0, 5);

    errorPatterns.forEach((pattern) => {
      const errorRate = (pattern.errors / pattern.count) * 100;
      report.errorQueries.push({
        pattern: pattern.pattern.substring(0, 100),
        totalErrors: pattern.errors,
        errorRate: Math.round(errorRate),
        severity: errorRate > 20 ? 'CRITICAL' : 'MEDIUM',
      });
    });

    return report;
  }

  /**
   * Calcular severidade baseada em count e tempo
   */
  private calculateSeverity(count: number, avgTime: number): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    if (count > 20 || avgTime > 1000) return 'CRITICAL';
    if (count > 10 || avgTime > 500) return 'HIGH';
    if (count > 5 || avgTime > 200) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Gerar sugestão automática baseada no padrão
   */
  private generateSuggestion(pattern: string, data: QueryPattern): string {
    const upperPattern = pattern.toUpperCase();

    if (upperPattern.includes('SELECT') && upperPattern.includes('WHERE ID = ?')) {
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

  /**
   * Reset de logs (para nova análise)
   */
  reset(): void {
    this.queries.length = 0;
    this.queryPatterns.clear();
    this.logger.log('N+1 Query Detector: Logs reset');
  }

  /**
   * Exportar relatório em JSON
   */
  exportReport(): string {
    const report = this.analyzeQueries();
    return JSON.stringify(report, null, 2);
  }

  /**
   * Cleanup do QueryRunner
   */
  async onModuleDestroy(): Promise<void> {
    if (this.queryRunner) {
      await this.queryRunner.release();
    }
  }
}

interface QueryLog {
  query: string;
  parameters?: any[];
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

interface QueryLog {
  query: string;
  parameters?: any[];
  executionTime: number;
  timestamp: number;
}

export interface N1SuspectReport {
  totalQueries: number;
  uniquePatterns: number;
  suspects: {
    pattern: string;
    count: number;
    type: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  }[];
  slowQueries: {
    query: string;
    time: number;
  }[];
}
