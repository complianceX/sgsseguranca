import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// UV_THREADPOOL_SIZE deve ser definido ANTES do primeiro uso do thread pool do libuv.
// O thread pool é criado de forma lazy (primeiro uso de bcrypt/argon2/crypto async).
// Definir aqui, após dotenv.config(), garante que o valor do .env seja respeitado e
// que o fallback '64' seja aplicado caso a variável não esteja no ambiente do processo.
// Valor 64: suporta até 64 operações bcrypt/argon2 paralelas sem fila de espera,
// eliminando os ~1.200ms de queuing que causavam login p95 de 3.6s sob 100 VUs.
// ⚠️  Não mover para dentro do AppModule ou de qualquer decorator NestJS —
//      seria tarde demais (NestFactory.create já disparou operações assíncronas).
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '64';

import * as crypto from 'crypto';
import type {
  Application as ExpressApplication,
  RequestHandler,
} from 'express';
import type { Queue } from 'bullmq';
import { buildStructuredLoggerOptions } from './common/logging/structured-winston';
import { createStructuredWinstonLogger } from './common/logging/structured-winston';
import {
  initializeTelemetry,
  type TelemetryRuntime,
} from './common/observability/opentelemetry.config';
import { initSentry, type SentryInitStatus } from './common/monitoring/sentry';

const WEB_SERVICE_NAME = 'wanderson-gandra-backend';
const WEB_TELEMETRY_PORT = 9464;

const hasDefaultRequestHandlerExport = (
  value: unknown,
): value is { default: (...args: unknown[]) => RequestHandler } =>
  typeof value === 'object' &&
  value !== null &&
  'default' in value &&
  typeof value.default === 'function';

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: crypto.webcrypto || crypto,
    writable: true,
    configurable: true,
  });
}

function logObservabilityStatus(
  logger: ReturnType<typeof createStructuredWinstonLogger>,
  runtime: 'web' | 'worker',
  telemetry: TelemetryRuntime | null,
  sentryStatus: SentryInitStatus,
) {
  logger.info({
    event: 'observability_runtime',
    runtime,
    loggingFormat: 'json',
    telemetryEnabled: telemetry !== null,
    tracingExporter: telemetry ? 'jaeger' : 'disabled',
    metricsExporter: telemetry ? 'prometheus' : 'disabled',
    jaegerEndpoint: telemetry?.jaegerEndpoint,
    prometheusPort: telemetry?.prometheusPort,
    sentry: sentryStatus,
    newRelicEnabled: process.env.NEW_RELIC_ENABLED === 'true',
  });
}

async function bootstrap() {
  const bootstrapLogger = createStructuredWinstonLogger(WEB_SERVICE_NAME);

  if (process.env.NEW_RELIC_ENABLED === 'true') {
    // New Relic deve ser carregado via require síncrono antes de qualquer
    // outro módulo para instrumentar http, pg e demais libs corretamente.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('newrelic');
  }

  const sentryStatus = initSentry('backend-web');
  const telemetry =
    process.env.OTEL_ENABLED === 'true'
      ? await initializeTelemetry({
          serviceName: process.env.OTEL_SERVICE_NAME || WEB_SERVICE_NAME,
          serviceVersion: process.env.OTEL_SERVICE_VERSION || '1.0.0',
          prometheusPort: process.env.PROMETHEUS_PORT
            ? Number(process.env.PROMETHEUS_PORT)
            : WEB_TELEMETRY_PORT,
        })
      : null;

  const [
    { assertNoPendingMigrationsInProd },
    { NestFactory },
    nestCommon,
    { AppModule },
    expressModule,
    { createBullBoard },
    { BullMQAdapter },
    { ExpressAdapter: BullBoardExpressAdapter },
    { getQueueToken },
    { WinstonModule },
    helmetModule,
    { AllExceptionsFilter },
    { SwaggerModule, DocumentBuilder },
  ] = await Promise.all([
    import('./common/database/migration-startup.guard'),
    import('@nestjs/core'),
    import('@nestjs/common'),
    import('./app.module'),
    import('express'),
    import('@bull-board/api'),
    import('@bull-board/api/bullMQAdapter'),
    import('@bull-board/express'),
    import('@nestjs/bullmq'),
    import('nest-winston'),
    import('helmet'),
    import('./common/filters/http-exception.filter'),
    import('@nestjs/swagger'),
  ]);
  const cookieParserImport: unknown = await import('cookie-parser');
  const compressionImport: unknown = await import('compression');

  await assertNoPendingMigrationsInProd();
  logObservabilityStatus(bootstrapLogger, 'web', telemetry, sentryStatus);

  const { BadRequestException, ValidationPipe } = nestCommon;
  const { json, urlencoded } = expressModule;
  const helmet = helmetModule.default ?? helmetModule;
  const cookieParser = hasDefaultRequestHandlerExport(cookieParserImport)
    ? cookieParserImport.default
    : undefined;
  const compression = hasDefaultRequestHandlerExport(compressionImport)
    ? compressionImport.default
    : undefined;
  const isProductionEnv = process.env.NODE_ENV === 'production';

  if (!cookieParser || !compression) {
    throw new Error(
      'Falha ao resolver cookie-parser/compression no bootstrap da API.',
    );
  }

  if (!('DOMMatrix' in globalThis)) {
    Object.defineProperty(globalThis, 'DOMMatrix', {
      value: class DOMMatrix {
        constructor() {
          // Empty constructor for polyfill
        }
      },
      writable: true,
      configurable: true,
    });
  }

  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(
      buildStructuredLoggerOptions(WEB_SERVICE_NAME),
    ),
  });
  const httpAdapterInstance = app
    .getHttpAdapter()
    .getInstance() as Partial<ExpressApplication>;

  if (process.env.REDIS_DISABLED === 'true') {
    bootstrapLogger.warn({
      event: 'bull_board_disabled',
      reason: 'redis_disabled',
    });
  } else {
    const bullBoardAdapter = new BullBoardExpressAdapter();
    bullBoardAdapter.setBasePath('/admin/queues');
    try {
      createBullBoard({
        queues: [
          new BullMQAdapter(app.get<Queue>(getQueueToken('mail'))),
          new BullMQAdapter(app.get<Queue>(getQueueToken('pdf-generation'))),
          new BullMQAdapter(app.get<Queue>(getQueueToken('document-import'))),
          new BullMQAdapter(app.get<Queue>(getQueueToken('sla-escalation'))),
          // Nome confirmado em tasks/expiry-notifications-worker.module.ts
          new BullMQAdapter(
            app.get<Queue>(getQueueToken('expiry-notifications')),
          ),
          new BullMQAdapter(
            app.get<Queue>(getQueueToken('document-retention')),
          ),
          new BullMQAdapter(
            app.get<Queue>(getQueueToken('document-import-dlq')),
          ),
        ],
        serverAdapter: bullBoardAdapter,
      });
    } catch (error) {
      bootstrapLogger.warn({
        event: 'bull_board_init_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const bullBoardAuth: RequestHandler = (req, res, next) => {
      const password = process.env.BULL_BOARD_PASS;
      if (!password) {
        res.status(503).json({
          error: 'Bull Board desabilitado: configure BULL_BOARD_PASS',
        });
        return;
      }

      const remote = String(req.socket?.remoteAddress || '');
      const isLocalSocket =
        remote === '127.0.0.1' ||
        remote === '::1' ||
        remote === '::ffff:127.0.0.1';

      if (!isLocalSocket) {
        res.status(403).json({ error: 'Acesso negado' });
        return;
      }

      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
        res.status(401).json({ error: 'Autenticação necessária' });
        return;
      }
      const [user, pass] = Buffer.from(authHeader.slice(6), 'base64')
        .toString('utf-8')
        .split(':');
      if (
        user !== (process.env.BULL_BOARD_USER || 'admin') ||
        pass !== password
      ) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
        res.status(401).json({ error: 'Credenciais inválidas' });
        return;
      }
      next();
    };
    app.use('/admin/queues', bullBoardAuth, bullBoardAdapter.getRouter());
  }

  if (isProductionEnv) {
    httpAdapterInstance.set?.('trust proxy', 1);
  }

  app.use(compression());
  httpAdapterInstance.disable?.('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        reportOnly: !isProductionEnv,
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: true,
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  const securityHeadersMiddleware: RequestHandler = (_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  };
  app.use(securityHeadersMiddleware);
  app.use(cookieParser());

  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) => {
        const formattedErrors = errors.map((error) => ({
          field: error.property,
          errors: Object.values(error.constraints || {}),
        }));

        return new BadRequestException({
          message: 'Dados inválidos',
          errors: formattedErrors,
        });
      },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const isProduction = isProductionEnv;
  const allowedOrigins = isProduction
    ? (process.env.CORS_ALLOWED_ORIGINS || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
      ];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || origin === 'null') return callback(null, false);
      const isExplicitAllowed = allowedOrigins.includes(origin);
      const isDevNetworkAllowed =
        !isProduction &&
        (/^http:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}$/i.test(origin) ||
          /^http:\/\/(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}):\d{2,5}$/i.test(
            origin,
          ));
      const isTrustedVercelFrontend =
        isProduction &&
        /^https:\/\/frontend(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin);
      if (
        isExplicitAllowed ||
        isDevNetworkAllowed ||
        isTrustedVercelFrontend
      ) {
        return callback(null, true);
      }
      bootstrapLogger.warn({
        event: 'cors_origin_blocked',
        origin,
        allowedOrigins,
        isTrustedVercelFrontend,
      });
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'x-company-id',
      'x-refresh-csrf',
      'x-client-fingerprint',
      'sentry-trace',
      'baggage',
    ],
    exposedHeaders: ['X-Request-ID'],
  });

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('API Sistema Wanderson-Gandra')
      .setDescription('Documentação completa da API')
      .setVersion('2.0')
      .addTag('auth', 'Autenticação e autorização')
      .addTag('users', 'Gestão de usuários')
      .addTag('companies', 'Gestão de empresas')
      .addTag('checklists', 'Gestão de checklists')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT obtido no login (via httpOnly cookie)',
        },
        'access-token',
      )
      .addServer('http://localhost:3001', 'Desenvolvimento')
      .addServer('https://api.example.com', 'Produção')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      customSiteTitle: 'API Docs',
      customfavIcon: '/favicon.ico',
      customCss: '.swagger-ui .topbar { display: none }',
    });

    bootstrapLogger.info({
      event: 'swagger_enabled',
      docsPath: '/api/docs',
      port: process.env.PORT || 3001,
    });
  }

  app.enableShutdownHooks();

  const port = process.env.PORT || 8080;
  await app.listen(port, '0.0.0.0');

  bootstrapLogger.info({
    event: 'web_booted',
    port: Number(port),
    nodeEnv: process.env.NODE_ENV || 'development',
    healthPath: '/health',
    healthPublicPath: '/health/public',
    uvThreadpoolSize: process.env.UV_THREADPOOL_SIZE,
  });
}

bootstrap().catch((error) => {
  const bootstrapLogger = createStructuredWinstonLogger(WEB_SERVICE_NAME);
  bootstrapLogger.error({
    event: 'bootstrap_failed',
    errorName: error instanceof Error ? error.name : 'BootstrapError',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
