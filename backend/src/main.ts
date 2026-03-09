import * as path from 'path';
import * as dotenv from 'dotenv';
// Carrega .env antes de qualquer uso de process.env (inclui PORT)
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import * as crypto from 'crypto';

// Polyfill para crypto.randomUUID() executado no nível do módulo
// O @nestjs/typeorm v10+ usa crypto.randomUUID() globalmente e precisa disso antes do AppModule carregar
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: crypto.webcrypto || crypto,
    writable: true,
    configurable: true,
  });
}

import { NestFactory } from '@nestjs/core';
import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import type { RequestHandler } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter as BullBoardExpressAdapter } from '@bull-board/express';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
// import { initializeTelemetry } from './common/observability/opentelemetry.config';

async function bootstrap() {
  const bootstrapLogger = new Logger('Bootstrap');

  if (process.env.NEW_RELIC_ENABLED === 'true') {
    await import('newrelic');
  }

  // TEMPORÁRIO: desabilitado para teste de startup
  // if (process.env.OTEL_ENABLED === 'true') {
  //   await initializeTelemetry({
  //     serviceName: process.env.OTEL_SERVICE_NAME || 'wanderson-gandra-backend',
  //     serviceVersion: process.env.OTEL_SERVICE_VERSION || '1.0.0',
  //     prometheusPort: process.env.PROMETHEUS_PORT
  //       ? Number(process.env.PROMETHEUS_PORT)
  //       : 9464,
  //   });
  // }
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

  const isProductionEnv = process.env.NODE_ENV === 'production';

  const logTransports: winston.transport[] = [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.printf(
          ({
            timestamp,
            level,
            message,
            context,
            ...meta
          }: {
            timestamp: string;
            level: string;
            message: string;
            context?: string;
            [key: string]: any;
          }) => {
            return `${timestamp} [${context || 'Application'}] ${level}: ${message} ${
              Object.keys(meta).length ? JSON.stringify(meta) : ''
            }`;
          },
        ),
      ),
    }),
  ];

  // File transports apenas fora de produção — containers efêmeros não têm
  // o diretório logs/ e Railway já captura stdout/stderr nativamente.
  if (!isProductionEnv) {
    logTransports.push(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 20 * 1024 * 1024,
        maxFiles: 90,
        tailable: true,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        maxsize: 20 * 1024 * 1024,
        maxFiles: 90,
        tailable: true,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
    );
  }

  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({ transports: logTransports }),
  });

  // BullBoard — montado diretamente via Express (sem NestJS BullBoardModule).
  // app.use(path, router) usa prefix matching nativo do Express, sem wildcards.
  if (process.env.REDIS_DISABLED === 'true') {
    bootstrapLogger.warn('⚠️ Redis desabilitado — Bull Board não será inicializado');
  } else {
    const bullBoardAdapter = new BullBoardExpressAdapter();
    bullBoardAdapter.setBasePath('/admin/queues');
    try {
      createBullBoard({
        queues: [
          new BullMQAdapter(app.get<Queue>(getQueueToken('mail'))),
          new BullMQAdapter(app.get<Queue>(getQueueToken('pdf-generation'))),
          new BullMQAdapter(app.get<Queue>(getQueueToken('sla-escalation'))),
        ],
        serverAdapter: bullBoardAdapter,
      });
    } catch (err) {
      bootstrapLogger.warn(
        `⚠️ Bull Board não pôde ser inicializado (provavelmente sem Redis): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    const bullBoardAuth: RequestHandler = (req, res, next) => {
      // Hardening operacional:
      // - BULL_BOARD_PASS obrigatório; sem ele o painel fica desabilitado (503).
      // - Verificação de origem usa EXCLUSIVAMENTE req.socket.remoteAddress
      //   (camada TCP real, não influenciável por headers como X-Forwarded-For).
      //   req.ip foi removido: com trust proxy ativo poderia ser forjado via
      //   X-Forwarded-For: 127.0.0.1, abrindo acesso indevido ao painel.
      const password = process.env.BULL_BOARD_PASS;
      if (!password) {
        res
          .status(503)
          .json({ error: 'Bull Board desabilitado: configure BULL_BOARD_PASS' });
        return;
      }

      // Somente conexões TCP originadas localmente chegam com remoteAddress local.
      // Headers HTTP não podem alterar esse valor.
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

  const isProduction = isProductionEnv;
  if (isProduction) {
    (
      app.getHttpAdapter().getInstance() as {
        set: (key: string, value: unknown) => void;
      }
    ).set('trust proxy', 1);
  }

  // Compressão gzip/brotli — reduz ~70% o payload JSON enviado ao cliente
  // Threshold padrão: 1KB (responses menores não compensam o overhead de CPU)
  app.use(compression());

  // Hardening: remove header X-Powered-By (express)
  (app.getHttpAdapter().getInstance() as any).disable?.('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        reportOnly: !isProduction,
        // Importante: manter os defaults do Helmet (inclui base-uri, object-src, etc.)
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: true,
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: { maxAge: 31536000, includeSubDomains: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Headers adicionais (compatível com versões do helmet que não expõem permissionsPolicy em type defs)
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  const cookieParserMw = cookieParser() as unknown as RequestHandler;
  app.use(cookieParserMw);

  // RISCO: O limite de 20MB para o corpo da requisição é muito grande e deve ser aplicado apenas em rotas específicas (ex: upload de arquivos).
  // CORREÇÃO: Reduzido para 2MB globalmente para mitigar ataques de DoS. Rotas que precisam de mais devem usar um middleware específico.
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

  // RISCO: `enableCors()` sem argumentos permite todas as origens, o que é inseguro.
  // CORREÇÃO: Configuração de CORS restritiva para produção e mais permissiva para desenvolvimento.
  const allowedOrigins = isProduction
    ? (process.env.CORS_ALLOWED_ORIGINS || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Segurança: não "aceitar origin nulo". Para requisições sem Origin (ex.: curl/server-to-server),
      // retornamos false para não habilitar CORS, sem bloquear a request.
      if (!origin || origin === 'null') return callback(null, false);
      const isExplicitAllowed = allowedOrigins.includes(origin);
      const isRailwayPublicDomain =
        isProduction &&
        /^https:\/\/[a-z0-9-]+\.up\.railway\.app$/i.test(origin);
      const isDevNetworkAllowed =
        !isProduction &&
        (/^http:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}$/i.test(origin) ||
          /^http:\/\/(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}):\d{2,5}$/i.test(
            origin,
          ));
        if (isExplicitAllowed || isDevNetworkAllowed || isRailwayPublicDomain) {
          return callback(null, true);
        }
      bootstrapLogger.warn(
        `[CORS] Origem bloqueada: ${origin}. Permitidas: ${allowedOrigins.join(', ') || '(nenhuma)'}${isProduction ? ' + *.up.railway.app' : ''}`,
      );
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  });

  // RISCO: Expor a documentação da API em produção pode revelar a superfície de ataque.
  // CORREÇÃO: A documentação do Swagger só será gerada em ambientes de não-produção.
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

    bootstrapLogger.log(
      `📚 Swagger documentation available at http://localhost:${process.env.PORT || 3001}/api/docs`,
    );
  }

  // Graceful shutdown: NestJS intercepta SIGTERM/SIGINT e drena conexões abertas
  // Railway envia SIGTERM no redeploy → aguarda até 10s → SIGKILL
  app.enableShutdownHooks();

  const port = process.env.PORT || 8080;
  await app.listen(port, '0.0.0.0');

  bootstrapLogger.log(`🚀 Server running on port ${port}`);
}

bootstrap().catch((err) => {
  const bootstrapLogger = new Logger('Bootstrap');
  bootstrapLogger.error(
    `Bootstrap failed: ${err instanceof Error ? err.message : String(err)}`,
    err instanceof Error ? err.stack : undefined,
  );
  process.exit(1);
});
