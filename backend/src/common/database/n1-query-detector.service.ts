import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Detector de N+1 Queries
 * Analisa padrões de queries SQL para identificar N+1 problems
 * 
 * Use em desenvolvimento para auditoria contínua
 */
@Injectable()
export class N1QueryDetectorService {
    private readonly logger = new Logger(N1QueryDetectorService.name);
    private readonly queries: QueryLog[] = [];
    private readonly queryPatterns = new Map<string, number>();

    constructor(private dataSource: DataSource) {
        this.setupQueryListener();
    }

    /**
     * Setup listener para todas as queries
     */
    private setupQueryListener(): void {
        if (process.env.NODE_ENV !== 'development') {
            return; // Apenas em desenvolvimento
        }

        this.dataSource.query;
        // Nota: TypeORM não expõe hook de query facialmente
        // Use o QueryBuilder logs:
    }

    /**
     * Log de query para análise posterior
     */
    logQuery(query: string, parameters?: any[], executionTime?: number): void {
        const normalizedQuery = this.normalizeQuery(query);
        const count = (this.queryPatterns.get(normalizedQuery) || 0) + 1;

        this.queryPatterns.set(normalizedQuery, count);
        this.queries.push({
            query: normalizedQuery,
            parameters,
            executionTime: executionTime || 0,
            timestamp: Date.now(),
        });

        // Alert se mesma query aparece múltiplas vezes
        if (count > 3) {
            this.logger.warn(`⚠️ Possible N+1: Query repeated ${count}x`);
            this.logger.debug(`  SQL: ${normalizedQuery.substring(0, 100)}...`);
        }
    }

    /**
     * Normalizar query (remover valores específicos)
     * SELECT * FROM users WHERE id = 1 → SELECT * FROM users WHERE id = ?
     */
    private normalizeQuery(query: string): string {
        return query
            .replace(/\d+/g, '?')  // Números → ?
            .replace(/'[^']*'/g, '?')  // Strings → ?
            .replace(/\s+/g, ' ')  // Whitespace → space único
            .trim();
    }

    /**
     * Analisar queries registradas
     * Retorna: padrões suspeitos de N+1
     */
    analyzeQueries(): N1SuspectReport {
        const report: N1SuspectReport = {
            totalQueries: this.queries.length,
            uniquePatterns: this.queryPatterns.size,
            suspects: [],
            slowQueries: [],
        };

        // Padrão 1: Mesma query repetida muitas vezes
        for (const [pattern, count] of this.queryPatterns) {
            if (count > 3) {
                report.suspects.push({
                    pattern,
                    count,
                    type: 'REPEATED_QUERY',
                    severity: count > 10 ? 'CRITICAL' : 'HIGH',
                });
            }
        }

        // Padrão 2: Queries lentas (> 100ms)
        this.queries
            .filter(q => q.executionTime > 100)
            .slice(0, 10)
            .forEach(q => {
                report.slowQueries.push({
                    query: q.query.substring(0, 100),
                    time: q.executionTime,
                });
            });

        return report;
    }

    /**
     * Reset de logs (para nova análise)
     */
    reset(): void {
        this.queries.length = 0;
        this.queryPatterns.clear();
    }

    /**
     * Exportar relatório em JSON
     */
    exportReport(): string {
        const report = this.analyzeQueries();
        return JSON.stringify(report, null, 2);
    }
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
