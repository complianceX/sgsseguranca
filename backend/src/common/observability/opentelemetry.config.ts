import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { resourceFromAttributes } from '@opentelemetry/resources';

export type TelemetryRuntime = {
  sdk: NodeSDK;
  serviceName: string;
  serviceVersion: string;
  jaegerEndpoint: string;
  prometheusPort: number;
};

export function initializeTelemetry(opts?: {
  serviceName?: string;
  serviceVersion?: string;
  prometheusPort?: number;
}): Promise<TelemetryRuntime> {
  const serviceName = opts?.serviceName ?? 'wanderson-gandra-backend';
  const serviceVersion = opts?.serviceVersion ?? '1.0.0';
  const jaegerEndpoint =
    process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces';
  const prometheusPort = Number(
    opts?.prometheusPort ?? process.env.PROMETHEUS_PORT ?? 9464,
  );

  const jaegerExporter = new JaegerExporter({
    endpoint: jaegerEndpoint,
  });

  const prometheusExporter = new PrometheusExporter({
    port: prometheusPort,
  });

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name': serviceName,
      'service.version': serviceVersion,
    }),
    traceExporter: jaegerExporter,
    metricReader: prometheusExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
          enabled: false, // Disable filesystem instrumentation for performance
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
    jaegerEndpoint,
    prometheusPort,
  });
}

// Backwards-compatible alias (older code)
export function initializeOpenTelemetry() {
  return initializeTelemetry();
}
