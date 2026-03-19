import { context as otelContext, trace } from '@opentelemetry/api';
import type { TransformableInfo } from 'logform';
import * as winston from 'winston';
import { RequestContext } from '../middleware/request-context.middleware';

const RESERVED_INFO_KEYS = new Set([
  'level',
  'message',
  'timestamp',
  'context',
  'stack',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeError(error: Error): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    message: error.message,
    errorName: error.name,
  };

  const maybeCode = (error as Error & { code?: unknown }).code;
  if (typeof maybeCode === 'string' || typeof maybeCode === 'number') {
    normalized.errorCode = maybeCode;
  }

  if (error.stack) {
    normalized.stack = error.stack;
  }

  return normalized;
}

function stringifyUnknown(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'symbol':
      return value.toString();
    case 'undefined':
      return '';
    default:
      try {
        const serialized = JSON.stringify(value);
        return typeof serialized === 'string'
          ? serialized
          : '[non-stringifiable value]';
      } catch {
        return '[unserializable value]';
      }
  }
}

function normalizeMessage(message: unknown): Record<string, unknown> {
  if (typeof message === 'string') {
    return { message };
  }

  if (message instanceof Error) {
    return normalizeError(message);
  }

  if (isRecord(message)) {
    return { ...message };
  }

  if (typeof message === 'undefined') {
    return {};
  }

  return { message: stringifyUnknown(message) };
}

function currentTraceMetadata(): Record<string, string> {
  const activeSpan = trace.getSpan(otelContext.active());
  if (!activeSpan) {
    return {};
  }

  const spanContext = activeSpan.spanContext();
  if (!spanContext.traceId || !spanContext.spanId) {
    return {};
  }

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
}

export function buildStructuredLogEntry(
  info: TransformableInfo,
): TransformableInfo {
  const entry: Record<string, unknown> = {
    timestamp:
      typeof info.timestamp === 'string'
        ? info.timestamp
        : new Date().toISOString(),
    level: String(info.level).toUpperCase(),
  };

  if (typeof info.context === 'string' && info.context.length > 0) {
    entry.context = info.context;
  }

  Object.assign(entry, normalizeMessage(info.message));

  for (const [key, value] of Object.entries(info)) {
    if (!RESERVED_INFO_KEYS.has(key)) {
      entry[key] = value;
    }
  }

  if (typeof info.stack === 'string' && entry.stack === undefined) {
    entry.stack = info.stack;
  }

  const requestId = RequestContext.getRequestId();
  if (requestId && entry.requestId === undefined) {
    entry.requestId = requestId;
  }

  const userId = RequestContext.getUserId();
  if (userId && entry.userId === undefined) {
    entry.userId = userId;
  }

  const companyId = RequestContext.getCompanyId();
  if (
    companyId &&
    entry.companyId === undefined &&
    entry.tenantId === undefined
  ) {
    entry.companyId = companyId;
  }

  const traceMetadata = currentTraceMetadata();
  if (traceMetadata.traceId && entry.traceId === undefined) {
    entry.traceId = traceMetadata.traceId;
  }
  if (traceMetadata.spanId && entry.spanId === undefined) {
    entry.spanId = traceMetadata.spanId;
  }

  return entry as TransformableInfo;
}

function createStructuredJsonFormat(): winston.Logform.Format {
  return winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format((info) => buildStructuredLogEntry(info))(),
    winston.format.json(),
  );
}

export function buildStructuredLoggerOptions(
  serviceName: string,
): winston.LoggerOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  const level = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');
  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: createStructuredJsonFormat(),
    }),
  ];

  if (!isProduction) {
    transports.push(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 20 * 1024 * 1024,
        maxFiles: 90,
        tailable: true,
        format: createStructuredJsonFormat(),
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        maxsize: 20 * 1024 * 1024,
        maxFiles: 90,
        tailable: true,
        format: createStructuredJsonFormat(),
      }),
    );
  }

  return {
    level,
    defaultMeta: {
      service: serviceName,
      environment: process.env.NODE_ENV || 'development',
    },
    transports,
  };
}

export function createStructuredWinstonLogger(
  serviceName: string,
): winston.Logger {
  return winston.createLogger(buildStructuredLoggerOptions(serviceName));
}
