if (process.env.NEW_RELIC_ENABLED === 'true') {
  require('newrelic');
}
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
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
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
    logger: WinstonModule.createLogger({
      transports: [
        // Console com cores
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

        // Arquivo de erros
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),

        // Arquivo geral
        new winston.transports.File({
          filename: 'logs/combined.log',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
      ],
    }),
  });

  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    (
      app.getHttpAdapter().getInstance() as {
        set: (key: string, value: unknown) => void;
      }
    ).set('trust proxy', 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        reportOnly: !isProduction,
        useDefaults: false,
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
      hsts: { maxAge: 31536000, includeSubDomains: true },
    }),
  );
  app.use(cookieParser());

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
    : ['http://localhost:3000', 'http://localhost:3001'];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }
      const isExplicitAllowed = allowedOrigins.includes(origin);
      const isDevNetworkAllowed =
        !isProduction &&
        (/^http:\/\/(?:localhost|127\.0\.0\.1):(?:3000|3001)$/i.test(origin) ||
          /^http:\/\/(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}):(?:3000|3001)$/i.test(
            origin,
          ));
      if (isExplicitAllowed || isDevNetworkAllowed) {
        return callback(null, true);
      }
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

    console.log(
      `📚 Swagger documentation available at http://localhost:${process.env.PORT || 3001}/api/docs`,
    );
  }

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Server running on port ${port}`);
}

void bootstrap();
