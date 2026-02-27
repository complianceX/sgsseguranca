import { Injectable, Logger } from '@nestjs/common';
import { CircuitBreakerService } from '../resilience/circuit-breaker.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * EXEMPLO DE USO DO CIRCUIT BREAKER
 *
 * Este serviço demonstra como usar o Circuit Breaker para proteger
 * chamadas a APIs externas e prevenir cascata de falhas.
 */
@Injectable()
export class CircuitBreakerExampleService {
  private readonly logger = new Logger(CircuitBreakerExampleService.name);

  constructor(
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Exemplo 1: Chamada a API externa com Circuit Breaker
   */
  async callExternalApi(url: string): Promise<any> {
    return this.circuitBreaker.execute(
      'external-api',
      async () => {
        const response = await firstValueFrom(this.httpService.get(url));
        return response.data;
      },
      {
        failureThreshold: 5, // Abrir após 5 falhas
        resetTimeout: 30000, // Tentar novamente após 30s
        timeout: 5000, // Timeout de 5s
      },
    );
  }

  /**
   * Exemplo 2: Autenticação OAuth com Circuit Breaker
   */
  async authenticateWithGoogle(token: string): Promise<any> {
    return this.circuitBreaker.execute(
      'google-oauth',
      async () => {
        const response = await firstValueFrom(
          this.httpService.post('https://oauth2.googleapis.com/tokeninfo', {
            id_token: token,
          }),
        );
        return response.data;
      },
      {
        failureThreshold: 3,
        resetTimeout: 60000,
        timeout: 10000,
      },
    );
  }

  /**
   * Exemplo 3: Upload para S3 com Circuit Breaker
   */
  async uploadToS3(file: Buffer, key: string): Promise<string> {
    return this.circuitBreaker.execute(
      's3-upload',
      async () => {
        // Simulação de upload para S3
        // Em produção, use AWS SDK aqui
        this.logger.log(`Uploading file ${key} to S3`);

        // Simular delay
        await new Promise((resolve) => setTimeout(resolve, 1000));

        return `https://s3.amazonaws.com/bucket/${key}`;
      },
      {
        failureThreshold: 5,
        resetTimeout: 30000,
        timeout: 30000, // Upload pode demorar mais
      },
    );
  }

  /**
   * Exemplo 4: Envio de email com Circuit Breaker
   */
  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    return this.circuitBreaker.execute(
      'email-service',
      async () => {
        // Simulação de envio de email
        // Em produção, use serviço de email aqui
        this.logger.log(`Sending email to ${to}`);

        // Simular delay
        await new Promise((resolve) => setTimeout(resolve, 500));
      },
      {
        failureThreshold: 10,
        resetTimeout: 60000,
        timeout: 10000,
      },
    );
  }

  /**
   * Exemplo 5: Verificar estado do Circuit Breaker
   */
  getCircuitBreakerStatus(name: string): string | null {
    const state = this.circuitBreaker.getState(name);
    return state;
  }

  /**
   * Exemplo 6: Resetar Circuit Breaker manualmente
   */
  resetCircuitBreaker(name: string): void {
    this.circuitBreaker.reset(name);
    this.logger.log(`Circuit breaker ${name} has been reset`);
  }
}
