import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Gauge } from '@opentelemetry/api';
import { metrics } from '@opentelemetry/api';
import { TenantService } from '../tenant/tenant.service';

@Injectable()
export class MetricsService {
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

  // Database Metrics
  private dbQueriesTotal: Counter;
  private dbQueryDuration: Histogram;

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

    this.queueJobDuration = this.meter.createHistogram('queue_job_duration_ms', {
      description: 'Queue job duration in milliseconds',
    });

    this.queueJobErrors = this.meter.createCounter('queue_job_errors_total', {
      description: 'Total number of queue job errors',
    });

    // Initialize database metrics
    this.dbQueriesTotal = this.meter.createCounter('db_queries_total', {
      description: 'Total number of database queries',
    });

    this.dbQueryDuration = this.meter.createHistogram('db_query_duration_ms', {
      description: 'Database query duration in milliseconds',
    });
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

  // Database Metrics Methods
  recordDbQuery(operation: string, table: string, duration: number) {
    this.dbQueriesTotal.add(1, { operation, table });
    this.dbQueryDuration.record(duration, { operation, table });
  }
}
