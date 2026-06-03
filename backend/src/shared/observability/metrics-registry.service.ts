import { Injectable, Logger } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  ObservableGauge,
  metrics,
} from '@opentelemetry/api';

export interface MetricDefinition {
  name: string;
  description: string;
  type: 'counter' | 'histogram' | 'gauge';
  unit?: string;
}

type MetricInstrument = Counter | Histogram | Gauge | ObservableGauge;

@Injectable()
export class MetricsRegistryService {
  private readonly logger = new Logger(MetricsRegistryService.name);
  private readonly meter = metrics.getMeter('wanderson-gandra-backend');
  private readonly registry = new Map<
    string,
    { type: MetricDefinition['type']; instrument: MetricInstrument }
  >();

  register(
    domain: string,
    definitions: MetricDefinition[],
  ): Record<string, Counter | Histogram | ObservableGauge | Gauge> {
    const normalizedDomain = this.normalizeSegment(domain);
    const result: Record<string, MetricInstrument> = {};

    for (const definition of definitions) {
      const localName = this.normalizeSegment(definition.name);
      const metricName = localName.startsWith(`${normalizedDomain}_`)
        ? localName
        : `${normalizedDomain}_${localName}`;
      const existing = this.registry.get(metricName);

      if (existing) {
        if (existing.type !== definition.type) {
          this.logger.warn(
            `[MetricsRegistry] Métrica ${metricName} já registrada com tipo "${existing.type}". Solicitação atual "${definition.type}" reaproveitará o instrumento existente.`,
          );
        }
        result[localName] = existing.instrument;
        continue;
      }

      const instrument = this.createInstrument(metricName, definition);
      this.registry.set(metricName, {
        type: definition.type,
        instrument,
      });
      result[localName] = instrument;
    }

    return result;
  }

  private createInstrument(
    metricName: string,
    definition: MetricDefinition,
  ): MetricInstrument {
    const options = {
      description: definition.description,
      unit: definition.unit,
    };

    if (definition.type === 'counter') {
      return this.meter.createCounter(metricName, options);
    }

    if (definition.type === 'histogram') {
      return this.meter.createHistogram(metricName, options);
    }

    return this.meter.createGauge(metricName, options);
  }

  private normalizeSegment(value: string): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
}
