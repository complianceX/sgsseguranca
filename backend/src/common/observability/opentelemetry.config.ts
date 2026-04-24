import { NodeSDK, tracing } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { resourceFromAttributes } from '@opentelemetry/resources';

export type TelemetrySamplerName =
  | 'always_on'
  | 'always_off'
  | 'traceidratio'
  | 'parentbased_always_on'
  | 'parentbased_always_off'
  | 'parentbased_traceidratio';

export type TelemetryRuntime = {
  sdk: NodeSDK;
  serviceName: string;
  serviceVersion: string;
  otlpEndpoint: string;
  prometheusPort: number;
  sampler: TelemetrySamplerName;
  samplerArg: number;
};

function clampRatio(raw: unknown, fallback: number): number {
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim().length > 0
        ? Number(raw)
        : NaN;
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function resolveSamplerName(
  raw: string | undefined,
  isProduction: boolean,
): TelemetrySamplerName {
  const normalized = raw?.trim().toLowerCase();
  const allowed: TelemetrySamplerName[] = [
    'always_on',
    'always_off',
    'traceidratio',
    'parentbased_always_on',
    'parentbased_always_off',
    'parentbased_traceidratio',
  ];
  if (normalized && (allowed as string[]).includes(normalized)) {
    return normalized as TelemetrySamplerName;
  }
  // Produção: parent-based + 10% de ratio (controla volume sem perder traces linkados).
  // Dev: always_on (pega tudo para facilitar debug).
  return isProduction ? 'parentbased_traceidratio' : 'always_on';
}

function buildSampler(
  name: TelemetrySamplerName,
  ratio: number,
): tracing.Sampler {
  switch (name) {
    case 'always_on':
      return new tracing.AlwaysOnSampler();
    case 'always_off':
      return new tracing.AlwaysOffSampler();
    case 'traceidratio':
      return new tracing.TraceIdRatioBasedSampler(ratio);
    case 'parentbased_always_on':
      return new tracing.ParentBasedSampler({
        root: new tracing.AlwaysOnSampler(),
      });
    case 'parentbased_always_off':
      return new tracing.ParentBasedSampler({
        root: new tracing.AlwaysOffSampler(),
      });
    case 'parentbased_traceidratio':
      return new tracing.ParentBasedSampler({
        root: new tracing.TraceIdRatioBasedSampler(ratio),
      });
  }
}

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

  const isProduction = process.env.NODE_ENV === 'production';
  const samplerName = resolveSamplerName(
    process.env.OTEL_TRACES_SAMPLER,
    isProduction,
  );
  const samplerArg = clampRatio(
    process.env.OTEL_TRACES_SAMPLER_ARG,
    isProduction ? 0.1 : 1.0,
  );
  const sampler = buildSampler(samplerName, samplerArg);

  const traceExporter = new OTLPTraceExporter({ url: otlpEndpoint });

  const prometheusExporter = new PrometheusExporter({
    port: prometheusPort,
  });

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      'service.name': serviceName,
      'service.version': serviceVersion,
    }),
    sampler,
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
    sampler: samplerName,
    samplerArg,
  });
}

export function initializeOpenTelemetry() {
  return initializeTelemetry();
}
