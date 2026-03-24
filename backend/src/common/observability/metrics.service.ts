import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge } from '@opentelemetry/api';
import { metrics } from '@opentelemetry/api';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class MetricsService {
  private static readonly APR_STATUS_LABELS = new Set([
    'pendente',
    'aprovada',
    'cancelada',
    'encerrada',
  ]);
  private static readonly MEDICAL_EXAM_TYPE_LABELS = new Set([
    'admissional',
    'demissional',
    'periodico',
    'retorno_ao_trabalho',
    'mudanca_funcao',
  ]);
  private static readonly CAT_SEVERITY_LABELS = new Set([
    'leve',
    'media',
    'moderada',
    'grave',
    'gravissima',
    'fatal',
  ]);
  private static readonly AI_TOOL_LABELS = new Set([
    'none',
    'assistant',
    'chat',
    'fallback',
    'error',
    'openai_unavailable',
    'image-analysis',
    'analyze',
    'buscar_exames_medicos_pendentes',
    'buscar_treinamentos_pendentes',
    'buscar_treinamentos_vencidos',
    'buscar_dds_ultimos',
    'buscar_aprs_recentes',
    'buscar_pts_recentes',
    'buscar_nao_conformidades',
    'buscar_inspecoes_recentes',
    'buscar_cats_recentes',
    'buscar_epis',
    'buscar_riscos',
    'buscar_ordens_de_servico',
    'gerar_resumo_sst',
  ]);

  private meter = metrics.getMeter('wanderson-gandra-backend');

  // HTTP Metrics
  private httpRequestsTotal: Counter;
  private httpRequestDuration: Histogram;
  private httpRequestsInFlight: Gauge;
  private httpInFlightCount = 0;

  // Business Metrics
  private pdfGenerationsTotal: Counter;
  private pdfGenerationDuration: Histogram;
  private pdfGenerationErrors: Counter;

  // Queue Metrics
  private queueJobsTotal: Counter;
  private queueJobDuration: Histogram;
  private queueJobErrors: Counter;

  // Quota Metrics
  private quotaHitPdfTotal: Counter;
  private quotaHitMailTotal: Counter;

  // Database Metrics
  private dbQueriesTotal: Counter;
  private dbQueryDuration: Histogram;

  // OpenAI Circuit Breaker metrics
  private openAiCircuitBreakerStateGauge: Gauge;
  private openAiCircuitBreakerTripsTotal: Counter;

  // Business Metrics (Tenant activity + operational health + IA performance)
  private gstAprsCreatedTotal: Counter;
  private gstDdsCreatedTotal: Counter;
  private gstPtsCreatedTotal: Counter;
  private gstTrainingsRegisteredTotal: Counter;
  private gstMedicalExamsRegisteredTotal: Counter;
  private gstCatsReportedTotal: Counter;
  private gstAiInteractionsTotal: Counter;
  private gstExamsOverdueCount: Gauge;
  private gstTrainingsOverdueCount: Gauge;
  private gstAprsPendingReviewCount: Gauge;
  private gstActiveUsersCount: Gauge;
  private gstAiResponseTimeSeconds: Histogram;
  private gstAiTokensUsedTotal: Counter;

  // In-memory rolling windows (for alerts/logging; not exported automatically)
  private httpWindow = {
    count: 0,
    errorCount: 0,
    sumDurationMs: 0,
    maxDurationMs: 0,
  };

  private queueWindow = {
    count: 0,
    errorCount: 0,
    sumDurationMs: 0,
    maxDurationMs: 0,
  };

  private pdfWindow = {
    count: 0,
    sumDurationMs: 0,
    maxDurationMs: 0,
    samples: [] as number[],
  };

  constructor() {
    // Initialize HTTP metrics
    this.httpRequestsTotal = this.meter.createCounter('http_requests_total', {
      description: 'Total number of HTTP requests',
    });

    this.httpRequestDuration = this.meter.createHistogram(
      'http_request_duration_ms',
      {
        description: 'HTTP request duration in milliseconds',
      },
    );

    this.httpRequestsInFlight = this.meter.createGauge(
      'http_requests_in_flight',
      {
        description: 'Number of HTTP requests currently being processed',
      },
    );

    // Initialize business metrics
    this.pdfGenerationsTotal = this.meter.createCounter(
      'pdf_generations_total',
      {
        description: 'Total number of PDF generations',
      },
    );

    this.pdfGenerationDuration = this.meter.createHistogram(
      'pdf_generation_duration_ms',
      {
        description: 'PDF generation duration in milliseconds',
      },
    );

    this.pdfGenerationErrors = this.meter.createCounter(
      'pdf_generation_errors_total',
      {
        description: 'Total number of PDF generation errors',
      },
    );

    // Initialize queue metrics
    this.queueJobsTotal = this.meter.createCounter('queue_jobs_total', {
      description: 'Total number of jobs processed',
    });

    this.queueJobDuration = this.meter.createHistogram(
      'queue_job_duration_ms',
      {
        description: 'Queue job duration in milliseconds',
      },
    );

    this.queueJobErrors = this.meter.createCounter('queue_job_errors_total', {
      description: 'Total number of queue job errors',
    });

    // Initialize quota metrics
    this.quotaHitPdfTotal = this.meter.createCounter('quota_hit_pdf_total', {
      description: 'Total number of tenant quota hits for PDF jobs',
    });

    this.quotaHitMailTotal = this.meter.createCounter('quota_hit_mail_total', {
      description: 'Total number of tenant quota hits for mail jobs',
    });

    // Initialize database metrics
    this.dbQueriesTotal = this.meter.createCounter('db_queries_total', {
      description: 'Total number of database queries',
    });

    this.dbQueryDuration = this.meter.createHistogram('db_query_duration_ms', {
      description: 'Database query duration in milliseconds',
    });

    this.openAiCircuitBreakerStateGauge = this.meter.createGauge(
      'openai_circuit_breaker_state',
      {
        description:
          'OpenAI circuit breaker state (0=closed, 1=open, 2=half_open)',
      },
    );

    this.openAiCircuitBreakerTripsTotal = this.meter.createCounter(
      'openai_circuit_breaker_trips_total',
      {
        description: 'Total number of times OpenAI circuit breaker opened',
      },
    );

    // Business counters
    this.gstAprsCreatedTotal = this.meter.createCounter(
      'gst_aprs_created_total',
      {
        description: 'Total de APRs criadas por empresa e status',
      },
    );
    this.gstDdsCreatedTotal = this.meter.createCounter(
      'gst_dds_created_total',
      {
        description: 'Total de DDS criados/realizados por empresa',
      },
    );
    this.gstPtsCreatedTotal = this.meter.createCounter(
      'gst_pts_created_total',
      {
        description: 'Total de PTs criadas/realizadas por empresa',
      },
    );
    this.gstTrainingsRegisteredTotal = this.meter.createCounter(
      'gst_trainings_registered_total',
      {
        description: 'Total de treinamentos registrados por empresa e tipo NR',
      },
    );
    this.gstMedicalExamsRegisteredTotal = this.meter.createCounter(
      'gst_medical_exams_registered_total',
      {
        description: 'Total de exames médicos registrados por empresa e tipo',
      },
    );
    this.gstCatsReportedTotal = this.meter.createCounter(
      'gst_cats_reported_total',
      {
        description: 'Total de CATs registradas por empresa e gravidade',
      },
    );
    this.gstAiInteractionsTotal = this.meter.createCounter(
      'gst_ai_interactions_total',
      {
        description: 'Total de interações da Sophie por empresa e ferramenta',
      },
    );

    // Business gauges
    this.gstExamsOverdueCount = this.meter.createGauge(
      'gst_exams_overdue_count',
      {
        description: 'Quantidade de exames vencidos por empresa',
      },
    );
    this.gstTrainingsOverdueCount = this.meter.createGauge(
      'gst_trainings_overdue_count',
      {
        description: 'Quantidade de treinamentos vencidos por empresa',
      },
    );
    this.gstAprsPendingReviewCount = this.meter.createGauge(
      'gst_aprs_pending_review_count',
      {
        description: 'Quantidade de APRs pendentes de revisão por empresa',
      },
    );
    this.gstActiveUsersCount = this.meter.createGauge(
      'gst_active_users_count',
      {
        description:
          'Quantidade de usuários ativos (sessão nos últimos 30 dias) por empresa',
      },
    );

    // Business AI performance
    this.gstAiResponseTimeSeconds = this.meter.createHistogram(
      'gst_ai_response_time_seconds',
      {
        description: 'Tempo de resposta da Sophie por modelo e ferramenta',
      },
    );
    this.gstAiTokensUsedTotal = this.meter.createCounter(
      'gst_ai_tokens_used_total',
      {
        description:
          'Total de tokens consumidos pela Sophie por empresa/modelo',
      },
    );
  }

  // HTTP Metrics Methods
  recordHttpRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    companyId?: string,
  ) {
    // Fallback para AsyncLocalStorage se companyId não for passado explicitamente
    const tenantId = companyId ?? TenantService.currentTenantId();
    const labels: Record<string, string> = {
      method,
      path,
      status: statusCode.toString(),
    };
    if (tenantId) labels['company_id'] = tenantId;

    this.httpRequestsTotal.add(1, labels);
    this.httpRequestDuration.record(duration, labels);

    this.httpWindow.count += 1;
    if (statusCode >= 500) this.httpWindow.errorCount += 1;
    this.httpWindow.sumDurationMs += duration;
    this.httpWindow.maxDurationMs = Math.max(
      this.httpWindow.maxDurationMs,
      duration,
    );
  }

  incrementHttpRequestsInFlight() {
    this.httpInFlightCount += 1;
    this.httpRequestsInFlight.record(this.httpInFlightCount);
  }

  decrementHttpRequestsInFlight() {
    this.httpInFlightCount = Math.max(0, this.httpInFlightCount - 1);
    this.httpRequestsInFlight.record(this.httpInFlightCount);
  }

  // Business Metrics Methods
  recordPdfGeneration(companyId: string, duration: number) {
    this.pdfGenerationsTotal.add(1, { company_id: companyId });
    this.pdfGenerationDuration.record(duration, { company_id: companyId });

    this.pdfWindow.count += 1;
    this.pdfWindow.sumDurationMs += duration;
    this.pdfWindow.maxDurationMs = Math.max(
      this.pdfWindow.maxDurationMs,
      duration,
    );
    if (this.pdfWindow.samples.length >= 500) {
      this.pdfWindow.samples.shift();
    }
    this.pdfWindow.samples.push(duration);
  }

  recordPdfError(companyId: string, errorType: string) {
    this.pdfGenerationErrors.add(1, {
      company_id: companyId,
      error_type: errorType,
    });
  }

  // Queue Metrics Methods
  recordQueueJob(
    queue: string,
    jobName: string,
    duration: number,
    status: 'success' | 'error' | 'delayed',
    companyId?: string,
  ) {
    const labels: Record<string, string> = {
      queue,
      job: jobName,
      status,
    };
    const tenantId = companyId ?? TenantService.currentTenantId();
    if (tenantId) labels['company_id'] = tenantId;

    this.queueJobsTotal.add(1, labels);
    this.queueJobDuration.record(duration, labels);
    if (status === 'error') {
      this.queueJobErrors.add(1, labels);
    }

    this.queueWindow.count += 1;
    if (status === 'error') this.queueWindow.errorCount += 1;
    this.queueWindow.sumDurationMs += duration;
    this.queueWindow.maxDurationMs = Math.max(
      this.queueWindow.maxDurationMs,
      duration,
    );
  }

  recordQuotaHit(resource: 'pdf' | 'mail', companyId?: string) {
    const tenantId = companyId ?? TenantService.currentTenantId();
    const labels: Record<string, string> = {};
    if (tenantId) labels['company_id'] = tenantId;

    if (resource === 'pdf') {
      this.quotaHitPdfTotal.add(1, labels);
    } else {
      this.quotaHitMailTotal.add(1, labels);
    }
  }

  snapshotAndResetHttpWindow(): {
    count: number;
    errorCount: number;
    errorRate: number | null;
    avgDurationMs: number | null;
    maxDurationMs: number;
  } {
    const count = this.httpWindow.count;
    const errorCount = this.httpWindow.errorCount;
    const avgDurationMs = count ? this.httpWindow.sumDurationMs / count : null;
    const errorRate = count ? errorCount / count : null;
    const maxDurationMs = this.httpWindow.maxDurationMs;

    this.httpWindow = {
      count: 0,
      errorCount: 0,
      sumDurationMs: 0,
      maxDurationMs: 0,
    };

    return { count, errorCount, errorRate, avgDurationMs, maxDurationMs };
  }

  snapshotAndResetQueueWindow(): {
    count: number;
    errorCount: number;
    errorRate: number | null;
    avgDurationMs: number | null;
    maxDurationMs: number;
  } {
    const count = this.queueWindow.count;
    const errorCount = this.queueWindow.errorCount;
    const avgDurationMs = count ? this.queueWindow.sumDurationMs / count : null;
    const errorRate = count ? errorCount / count : null;
    const maxDurationMs = this.queueWindow.maxDurationMs;

    this.queueWindow = {
      count: 0,
      errorCount: 0,
      sumDurationMs: 0,
      maxDurationMs: 0,
    };

    return { count, errorCount, errorRate, avgDurationMs, maxDurationMs };
  }

  snapshotAndResetPdfWindow(): {
    count: number;
    avgDurationMs: number | null;
    p95DurationMs: number | null;
    maxDurationMs: number;
  } {
    const count = this.pdfWindow.count;
    const avgDurationMs = count ? this.pdfWindow.sumDurationMs / count : null;
    const maxDurationMs = this.pdfWindow.maxDurationMs;

    let p95DurationMs: number | null = null;
    if (this.pdfWindow.samples.length) {
      const sorted = [...this.pdfWindow.samples].sort((a, b) => a - b);
      const index = Math.min(
        sorted.length - 1,
        Math.floor(sorted.length * 0.95),
      );
      p95DurationMs = sorted[index];
    }

    this.pdfWindow = {
      count: 0,
      sumDurationMs: 0,
      maxDurationMs: 0,
      samples: [],
    };

    return { count, avgDurationMs, p95DurationMs, maxDurationMs };
  }

  // Database Metrics Methods
  recordDbQuery(operation: string, table: string, duration: number) {
    this.dbQueriesTotal.add(1, { operation, table });
    this.dbQueryDuration.record(duration, { operation, table });
  }

  recordOpenAiCircuitBreakerState(state: 'CLOSED' | 'OPEN' | 'HALF_OPEN') {
    const numericState = state === 'OPEN' ? 1 : state === 'HALF_OPEN' ? 2 : 0;
    this.openAiCircuitBreakerStateGauge.record(numericState, {
      integration: 'openai',
    });
  }

  incrementOpenAiCircuitBreakerTrips() {
    this.openAiCircuitBreakerTripsTotal.add(1, { integration: 'openai' });
  }

  incrementAprCreated(companyId: string, status: string) {
    this.safeCounterAdd(this.gstAprsCreatedTotal, 1, {
      company_id: this.normalizeCompanyId(companyId),
      status: this.normalizeAprStatus(status),
    });
  }

  incrementDdsCreated(companyId: string) {
    this.safeCounterAdd(this.gstDdsCreatedTotal, 1, {
      company_id: this.normalizeCompanyId(companyId),
    });
  }

  incrementPtCreated(companyId: string) {
    this.safeCounterAdd(this.gstPtsCreatedTotal, 1, {
      company_id: this.normalizeCompanyId(companyId),
    });
  }

  incrementTrainingRegistered(companyId: string, nrType?: string | null) {
    this.safeCounterAdd(this.gstTrainingsRegisteredTotal, 1, {
      company_id: this.normalizeCompanyId(companyId),
      nr_type: this.normalizeTrainingNrType(nrType),
    });
  }

  incrementMedicalExamRegistered(companyId: string, examType?: string | null) {
    this.safeCounterAdd(this.gstMedicalExamsRegisteredTotal, 1, {
      company_id: this.normalizeCompanyId(companyId),
      exam_type: this.normalizeMedicalExamType(examType),
    });
  }

  incrementCatReported(companyId: string, severity?: string | null) {
    this.safeCounterAdd(this.gstCatsReportedTotal, 1, {
      company_id: this.normalizeCompanyId(companyId),
      severity: this.normalizeCatSeverity(severity),
    });
  }

  incrementAiInteraction(companyId: string, toolUsed?: string | null) {
    this.safeCounterAdd(this.gstAiInteractionsTotal, 1, {
      company_id: this.normalizeCompanyId(companyId),
      tool_used: this.normalizeAiTool(toolUsed),
    });
  }

  recordAiResponseTime(model: string, tool: string, durationSeconds: number) {
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
      return;
    }

    this.safeHistogramRecord(this.gstAiResponseTimeSeconds, durationSeconds, {
      model: this.normalizeAiModel(model),
      tool: this.normalizeAiTool(tool),
    });
  }

  addAiTokensUsed(companyId: string, model: string, tokens: number) {
    const value = Number.isFinite(tokens) ? Math.max(0, Math.trunc(tokens)) : 0;
    if (value <= 0) {
      return;
    }

    this.safeCounterAdd(this.gstAiTokensUsedTotal, value, {
      company_id: this.normalizeCompanyId(companyId),
      model: this.normalizeAiModel(model),
    });
  }

  setExamsOverdueCount(companyId: string, count: number) {
    this.safeGaugeRecord(this.gstExamsOverdueCount, count, {
      company_id: this.normalizeCompanyId(companyId),
    });
  }

  setTrainingsOverdueCount(companyId: string, count: number) {
    this.safeGaugeRecord(this.gstTrainingsOverdueCount, count, {
      company_id: this.normalizeCompanyId(companyId),
    });
  }

  setAprsPendingReviewCount(companyId: string, count: number) {
    this.safeGaugeRecord(this.gstAprsPendingReviewCount, count, {
      company_id: this.normalizeCompanyId(companyId),
    });
  }

  setActiveUsersCount(companyId: string, count: number) {
    this.safeGaugeRecord(this.gstActiveUsersCount, count, {
      company_id: this.normalizeCompanyId(companyId),
    });
  }

  private safeCounterAdd(
    counter: Counter,
    value: number,
    labels: Record<string, string>,
  ) {
    this.safelyRecord(() => counter.add(value, labels));
  }

  private safeHistogramRecord(
    histogram: Histogram,
    value: number,
    labels: Record<string, string>,
  ) {
    this.safelyRecord(() => histogram.record(value, labels));
  }

  private safeGaugeRecord(
    gauge: Gauge,
    value: number,
    labels: Record<string, string>,
  ) {
    const normalizedValue = Number.isFinite(value)
      ? Math.max(0, Math.trunc(value))
      : 0;
    this.safelyRecord(() => gauge.record(normalizedValue, labels));
  }

  private safelyRecord(fn: () => void) {
    try {
      fn();
    } catch {
      // no-op: telemetria nunca pode interromper o fluxo de negócio
    }
  }

  private normalizeCompanyId(companyId?: string | null): string {
    if (typeof companyId === 'string' && companyId.trim().length > 0) {
      return companyId.trim();
    }

    return 'unknown';
  }

  private normalizeLabel(
    value: string | null | undefined,
    fallback: string,
  ): string {
    if (!value || !String(value).trim()) {
      return fallback;
    }

    const normalized = String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9:_-]+/g, '_')
      .slice(0, 64);

    return normalized || fallback;
  }

  private normalizeAprStatus(value: string | null | undefined): string {
    const normalized = this.normalizeLabel(value, 'unknown');
    return MetricsService.APR_STATUS_LABELS.has(normalized)
      ? normalized
      : 'other';
  }

  private normalizeTrainingNrType(value: string | null | undefined): string {
    const normalized = this.normalizeLabel(value, 'unknown');
    const nrMatch = normalized.match(/nr[_-]?(\d{1,2})/);
    if (nrMatch?.[1]) {
      return `nr_${nrMatch[1].padStart(2, '0')}`;
    }

    return normalized === 'unknown' ? 'unknown' : 'other';
  }

  private normalizeMedicalExamType(value: string | null | undefined): string {
    const normalized = this.normalizeLabel(value, 'unknown');
    return MetricsService.MEDICAL_EXAM_TYPE_LABELS.has(normalized)
      ? normalized
      : normalized === 'unknown'
        ? 'unknown'
        : 'other';
  }

  private normalizeCatSeverity(value: string | null | undefined): string {
    const normalized = this.normalizeLabel(value, 'unknown')
      .replace('muito_grave', 'gravissima')
      .replace('gravissimo', 'gravissima')
      .replace('media_alta', 'grave');

    return MetricsService.CAT_SEVERITY_LABELS.has(normalized)
      ? normalized
      : normalized === 'unknown'
        ? 'unknown'
        : 'other';
  }

  private normalizeAiTool(value: string | null | undefined): string {
    const normalized = this.normalizeLabel(value, 'none');
    if (
      MetricsService.AI_TOOL_LABELS.has(normalized) ||
      normalized.startsWith('buscar_')
    ) {
      return normalized;
    }

    return normalized === 'none' ? 'none' : 'other';
  }

  private normalizeAiModel(value: string | null | undefined): string {
    const normalized = this.normalizeLabel(value, 'unknown');
    // preserva famílias/modelos comuns sem explodir cardinalidade
    if (
      normalized.startsWith('gpt-') ||
      normalized.startsWith('o1') ||
      normalized.startsWith('o3') ||
      normalized.startsWith('claude') ||
      normalized.startsWith('gemini')
    ) {
      return normalized.slice(0, 32);
    }

    return normalized === 'unknown' ? 'unknown' : 'other';
  }
}
