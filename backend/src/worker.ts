import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { initializeTelemetry } from './common/observability/opentelemetry.config';

async function bootstrap() {
  if (process.env.OTEL_ENABLED === 'true') {
    await initializeTelemetry({
      serviceName: process.env.OTEL_SERVICE_NAME || 'wanderson-gandra-worker',
      serviceVersion: process.env.OTEL_SERVICE_VERSION || '1.0.0',
      prometheusPort: process.env.PROMETHEUS_PORT
        ? Number(process.env.PROMETHEUS_PORT)
        : 9465,
    });
  }
  // SECURITY: worker não expõe porta HTTP — apenas processa filas
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  // sem app.listen() — não é um servidor HTTP
}

bootstrap();
