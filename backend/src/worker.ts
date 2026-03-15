import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';
import { initializeTelemetry } from './common/observability/opentelemetry.config';
import { assertWorkerRedisContract } from './worker-runtime.guard';

async function bootstrap() {
  assertWorkerRedisContract(process.env);

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

bootstrap().catch((error) => {
  const bootstrapLogger = new Logger('WorkerBootstrap');
  bootstrapLogger.error(
    error instanceof Error ? error.message : String(error),
    error instanceof Error ? error.stack : undefined,
  );
  process.exit(1);
});
