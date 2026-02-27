import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../observability/metrics.service';

/**
 * EXEMPLO DE USO DO METRICS SERVICE
 *
 * Este serviço demonstra como usar o MetricsService para coletar
 * métricas de negócio e operacionais.
 */
@Injectable()
export class MetricsExampleService {
  private readonly logger = new Logger(MetricsExampleService.name);

  constructor(private readonly metricsService: MetricsService) {}

  /**
   * Exemplo 1: Registrar geração de PDF com sucesso
   */
  async generatePdf(companyId: string, data: any): Promise<Buffer> {
    const startTime = Date.now();

    try {
      // Simular geração de PDF
      this.logger.log(`Generating PDF for company ${companyId}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const pdf = Buffer.from('PDF content');
      const duration = Date.now() - startTime;

      // Registrar métrica de sucesso
      this.metricsService.recordPdfGeneration(companyId, duration);

      return pdf;
    } catch (error) {
      // Registrar métrica de erro
      this.metricsService.recordPdfError(companyId, error.message);
      throw error;
    }
  }

  /**
   * Exemplo 2: Registrar query de banco de dados
   */
  async executeQuery(query: string): Promise<any[]> {
    const startTime = Date.now();
    let success = false;

    try {
      // Simular query
      this.logger.log(`Executing query: ${query}`);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const results = [{ id: 1, name: 'Example' }];
      success = true;

      return results;
    } catch (error) {
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      this.metricsService.recordDbQuery('SELECT', 'users', duration);
    }
  }

  /**
   * Exemplo 3: Registrar abertura de conexão
   */
  async openDatabaseConnection(): Promise<void> {
    this.logger.log('Opening database connection');
    // Métrica de conexão pode ser adicionada ao MetricsService se necessário

    // Simular abertura de conexão
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  /**
   * Exemplo 4: Registrar fechamento de conexão
   */
  async closeDatabaseConnection(): Promise<void> {
    this.logger.log('Closing database connection');
    // Métrica de conexão pode ser adicionada ao MetricsService se necessário

    // Simular fechamento de conexão
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  /**
   * Exemplo 5: Atualizar gauge de conexões ativas
   */
  updateActiveConnections(
    type: 'database' | 'redis' | 'external',
    count: number,
  ): void {
    // Métrica de conexão pode ser adicionada ao MetricsService se necessário
    this.logger.log(`Active ${type} connections: ${count}`);
  }

  /**
   * Exemplo 6: Workflow completo com múltiplas métricas
   */
  async processCompleteWorkflow(companyId: string): Promise<void> {
    // 1. Abrir conexão
    await this.openDatabaseConnection();
    this.updateActiveConnections('database', 1);

    try {
      // 2. Executar query
      await this.executeQuery('SELECT * FROM users');

      // 3. Gerar PDF
      await this.generatePdf(companyId, {});

      // 4. Executar mais queries
      await this.executeQuery('SELECT * FROM reports');
    } finally {
      // 5. Fechar conexão
      await this.closeDatabaseConnection();
      this.updateActiveConnections('database', 0);
    }
  }

  /**
   * Exemplo 7: Registrar métricas de API (já feito automaticamente pelo MetricsInterceptor)
   * Este é apenas um exemplo de como fazer manualmente se necessário
   */
  recordManualApiMetric(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
  ): void {
    this.metricsService.recordHttpRequest(method, path, statusCode, duration);
  }
}
