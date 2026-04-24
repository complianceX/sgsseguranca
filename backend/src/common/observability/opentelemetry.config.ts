import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { resourceFromAttributes } from '@opentelemetry/resources';

export type TelemetryRuntime = {
  sdk: NodeSDK;
  serviceName: string;
  serviceVersion: string;
  otlpEndpoint: string;
  prometheusPort: number;
};

export function initializeTelemetry(opts?: {
  serviceName?: string;
  serviceVersion?: string;
  prometheusPort?: number;
}): Promise<TelemetryRuntime> {
  const serviceName = opts?.serviceName ?? 'wanderson-gandra-backend';
  const serviceVersion = opts?.serviceVersion ?? '1.0.0';
  // Jaeger ≥1.35 natively accepts OTLP HTTP on port 4318.
  // Legacy Jaeger Thrift: http://localhost:14268/api/traces
  const otlpEndpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
    process.env.JAEGER_ENDPOINT ??
    'http://localhost:4318/v1/traces';
  const prometheusPort = Number(
    opts?.prometheusPort ?? process.env.PROMETHEUS_PORT ?? 9464,
  );

  const traceExporter = new OTLPTraceExporter({ url: otlpEndpoint });

  const prometheusExporter = new PrometheusExporter({
    port: prometheusPort,
  });

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name': serviceName,
      'service.version': serviceVersion,
    }),
    traceExporter,
    metricReader: prometheusExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
      }),
    ],
  });

  sdk.start();

  process.once('SIGTERM', () => {
    void sdk.shutdown().finally(() => process.exit(0));
  });

  return Promise.resolve({
    sdk,
    serviceName,
    serviceVersion,
    otlpEndpoint,
    prometheusPort,
  });
}

export function initializeOpenTelemetry() {
  return initializeTelemetry();
}
