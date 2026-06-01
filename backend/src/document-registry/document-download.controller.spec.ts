import {
  ForbiddenException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import type { Server } from 'http';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DocumentDownloadController } from './document-download.controller';
import { DocumentDownloadGrantService } from '../common/services/document-download-grant.service';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { SecurityAuditService } from '../common/security/security-audit.service';

const mockSecurityAudit: Partial<SecurityAuditService> = {
  sensitiveDownload: jest.fn(),
  bruteForceBlocked: jest.fn(),
};

const httpRequest = (app: INestApplication) =>
  request(app.getHttpServer() as unknown as Server);

describe('DocumentDownloadController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('entrega o documento como attachment e sem cache', async () => {
    const consumeToken = jest.fn().mockResolvedValue({
      id: 'grant-1',
      file_key: 'documents/company-1/apr/final.pdf',
      original_name: 'APR Final.pdf',
      content_type: 'application/pdf',
      issued_for_user_id: 'user-123',
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [DocumentDownloadController],
      providers: [
        {
          provide: DocumentDownloadGrantService,
          useValue: { consumeToken },
        },
        {
          provide: DocumentStorageService,
          useValue: {
            downloadFileBuffer: jest
              .fn()
              .mockResolvedValue(Buffer.from('%PDF-test')),
          },
        },
        {
          provide: SecurityAuditService,
          useValue: mockSecurityAudit,
        },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    const response = await httpRequest(app).get('/storage/download/a.b.c');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.headers['content-disposition']).toContain('attachment;');
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(Buffer.from(response.body).toString('utf8')).toContain('%PDF-test');

    await app.close();
  });

  it('bloqueia token inválido ou já consumido', async () => {
    const consumeToken = jest
      .fn()
      .mockRejectedValue(
        new ForbiddenException(
          'Token de download inválido, expirado ou já consumido.',
        ),
      );
    const moduleRef = await Test.createTestingModule({
      controllers: [DocumentDownloadController],
      providers: [
        {
          provide: DocumentDownloadGrantService,
          useValue: { consumeToken },
        },
        {
          provide: DocumentStorageService,
          useValue: {
            downloadFileBuffer: jest.fn(),
          },
        },
        {
          provide: SecurityAuditService,
          useValue: mockSecurityAudit,
        },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    const response = await httpRequest(app).get(
      '/storage/download/aaa.bbb.ccc',
    );

    expect(response.status).toBe(403);
    expect(mockSecurityAudit.bruteForceBlocked).toHaveBeenCalled();
    expect(consumeToken).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('bloqueia token com formato inválido antes de consumir grant', async () => {
    const consumeToken = jest.fn();
    const moduleRef = await Test.createTestingModule({
      controllers: [DocumentDownloadController],
      providers: [
        {
          provide: DocumentDownloadGrantService,
          useValue: { consumeToken },
        },
        {
          provide: DocumentStorageService,
          useValue: {
            downloadFileBuffer: jest.fn(),
          },
        },
        {
          provide: SecurityAuditService,
          useValue: mockSecurityAudit,
        },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    const response = await httpRequest(app).get(
      '/storage/download/token-bruto',
    );

    expect(response.status).toBe(400);
    expect(consumeToken).not.toHaveBeenCalled();
    expect(mockSecurityAudit.bruteForceBlocked).not.toHaveBeenCalled();

    await app.close();
  });
});
