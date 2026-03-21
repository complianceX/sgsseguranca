import {
  CallHandler,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantService } from '../common/tenant/tenant.service';
import { MailController } from './mail.controller';
import { MailService } from './mail.service';

jest.setTimeout(15000);

describe('MailController (http)', () => {
  let app: INestApplication;
  let currentUser: {
    company_id?: string;
    companyId?: string;
    userId?: string;
  } = {
    company_id: 'company-1',
    userId: 'user-1',
  };

  const mailService = {
    sendStoredDocument: jest.fn(),
    sendStoredFileKey: jest.fn(),
    sendUploadedPdfBuffer: jest.fn(),
    buildDocumentDispatchResponse: jest.fn(),
  };

  const documentStorageService = {
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
  };

  const mailQueue = {
    add: jest.fn(),
  };

  beforeEach(() => {
    currentUser = {
      company_id: 'company-1',
      userId: 'user-1',
    };
    mailService.sendStoredDocument.mockReset();
    mailService.sendStoredFileKey.mockReset();
    mailService.sendUploadedPdfBuffer.mockReset();
    mailService.buildDocumentDispatchResponse.mockReset();
    documentStorageService.uploadFile.mockReset();
    documentStorageService.deleteFile.mockReset();
    mailQueue.add.mockReset();
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MailController],
      providers: [
        {
          provide: MailService,
          useValue: mailService,
        },
        {
          provide: DocumentStorageService,
          useValue: documentStorageService,
        },
        {
          provide: TenantService,
          useValue: {
            getTenantId: jest.fn(() => 'company-1'),
            isSuperAdmin: jest.fn(() => false),
          },
        },
        {
          provide: getQueueToken('mail'),
          useValue: mailQueue,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest<{
            user?: typeof currentUser;
          }>();
          req.user = currentUser;
          return true;
        },
      })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(TenantInterceptor)
      .useValue({
        intercept: (
          _context: ExecutionContext,
          next: CallHandler,
        ): Observable<unknown> => next.handle(),
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('degrada para envio síncrono por buffer quando o storage falha', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    documentStorageService.uploadFile.mockRejectedValue(
      new Error('Storage offline'),
    );
    mailService.sendUploadedPdfBuffer.mockResolvedValue({
      success: true,
      message:
        'O PDF local foi enviado por e-mail. Este envio não substitui o documento final governado.',
      deliveryMode: 'sent',
      artifactType: 'local_uploaded_pdf',
      isOfficial: false,
      fallbackUsed: true,
    });

    await request(httpServer)
      .post('/mail/send-uploaded-document')
      .field('email', 'destinatario@example.com')
      .field('docName', 'RDO Teste')
      .attach('file', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF'), {
        filename: 'rdo.pdf',
        contentType: 'application/pdf',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          success: true,
          deliveryMode: 'sent',
          artifactType: 'local_uploaded_pdf',
          isOfficial: false,
          fallbackUsed: true,
        });
      });

    expect(documentStorageService.uploadFile).toHaveBeenCalledTimes(1);
    expect(mailQueue.add).not.toHaveBeenCalled();
    expect(mailService.sendUploadedPdfBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      'destinatario@example.com',
      expect.objectContaining({
        docName: 'RDO Teste',
        companyId: 'company-1',
        userId: 'user-1',
      }),
    );
  });
});
