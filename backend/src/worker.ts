import { buildStructuredLoggerOptions } from './common/logging/structured-winston';
import { createStructuredWinstonLogger } from './common/logging/structured-winston';
import {
  initializeTelemetry,
  type TelemetryRuntime,
} from './common/observability/opentelemetry.config';
import { initSentry, type SentryInitStatus } from './common/monitoring/sentry';

const WORKER_SERVICE_NAME = 'wanderson-gandra-worker';
const WORKER_TELEMETRY_PORT = 9465;

function logObservabilityStatus(
  logger: ReturnType<typeof createStructuredWinstonLogger>,
  telemetry: TelemetryRuntime | null,
  sentryStatus: SentryInitStatus,
) {
  logger.info({
    event: 'observability_runtime',
    runtime: 'worker',
    loggingFormat: 'json',
    telemetryEnabled: telemetry !== null,
    tracingExporter: telemetry ? 'jaeger' : 'disabled',
    metricsExporter: telemetry ? 'prometheus' : 'disabled',
    jaegerEndpoint: telemetry?.jaegerEndpoint,
    prometheusPort: telemetry?.prometheusPort,
    sentry: sentryStatus,
  });
}

async function bootstrap() {
  const bootstrapLogger = createStructuredWinstonLogger(WORKER_SERVICE_NAME);
  const { assertWorkerRedisContract } = await import('./worker-runtime.guard');

  assertWorkerRedisContract(process.env);

  const sentryStatus = initSentry('worker');
  const telemetry =
    process.env.OTEL_ENABLED === 'true'
      ? await initializeTelemetry({
          serviceName: process.env.OTEL_SERVICE_NAME || WORKER_SERVICE_NAME,
          serviceVersion: process.env.OTEL_SERVICE_VERSION || '1.0.0',
          prometheusPort: process.env.PROMETHEUS_PORT
            ? Number(process.env.PROMETHEUS_PORT)
            : WORKER_TELEMETRY_PORT,
        })
      : null;

  const [{ NestFactory }, { WinstonModule }, { WorkerModule }] =
    await Promise.all([
      import('@nestjs/core'),
      import('nest-winston'),
      import('./worker.module'),
    ]);

  logObservabilityStatus(bootstrapLogger, telemetry, sentryStatus);

  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: WinstonModule.createLogger(
      buildStructuredLoggerOptions(WORKER_SERVICE_NAME),
    ),
  });
  app.enableShutdownHooks();

  bootstrapLogger.info({
    event: 'worker_booted',
    nodeEnv: process.env.NODE_ENV || 'development',
  });
}

bootstrap().catch((error) => {
  const bootstrapLogger = createStructuredWinstonLogger(WORKER_SERVICE_NAME);
  bootstrapLogger.error({
    event: 'worker_bootstrap_failed',
    errorName: error instanceof Error ? error.name : 'WorkerBootstrapError',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
