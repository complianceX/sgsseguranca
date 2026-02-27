import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

// Resource is imported differently to be used as a value
const { Resource } = require('@opentelemetry/resources');

export function initializeOpenTelemetry() {
  const jaegerExporter = new JaegerExporter({
    endpoint:
      process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
  });

  const prometheusExporter = new PrometheusExporter({
    port: parseInt(process.env.PROMETHEUS_PORT || '9464', 10),
  });

  const sdk = new NodeSDK({
    resource: new Resource({
      'service.name': 'wanderson-gandra-backend',
      'service.version': '1.0.0',
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

  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => console.log('OpenTelemetry terminated'))
      .catch((error) => console.error('Error terminating OpenTelemetry', error))
      .finally(() => process.exit(0));
  });

  return sdk;
}
