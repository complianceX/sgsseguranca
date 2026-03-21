import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  Request,
  Res,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Response } from 'express';
import { readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { UploadedFile } from '@nestjs/common';
import { MailService } from './mail.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { DispatchAlertsDto } from './dto/dispatch-alerts.dto';
import { defaultJobOptions } from '../queue/default-job-options';
import { validatePdfMagicBytesFromPath } from '../common/interceptors/file-upload.interceptor';
import { TenantService } from '../common/tenant/tenant.service';
import { Authorize } from '../auth/authorize.decorator';
import { DocumentMailDispatchResponseDto } from './dto/document-mail-dispatch-response.dto';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { cleanupUploadedFile } from '../common/storage/storage-compensation.util';

type RequestWithUser = {
  user?: { company_id?: string; companyId?: string; userId?: string };
};

@Controller('mail')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class MailController {
  private readonly logger = new Logger(MailController.name);

  constructor(
    private readonly mailService: MailService,
    @InjectQueue('mail') private readonly mailQueue: Queue,
    private readonly documentStorageService: DocumentStorageService,
    private readonly tenantService: TenantService,
  ) {}

  @Get('logs/export')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_view_mail')
  async exportLogs(
    @Query()
    query: {
      startDate?: string;
      endDate?: string;
      status?: string;
      to?: string;
      subject?: string;
      messageId?: string;
      companyId?: string;
      userId?: string;
      limit?: string;
    },
    @Request() req: RequestWithUser,
    @Res() res: Response,
  ) {
    const isSuperAdmin = this.tenantService.isSuperAdmin();
    const tenantCompanyId = req.user?.company_id || req.user?.companyId;

    if (isSuperAdmin && query.companyId) {
      const uuidV4 =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidV4.test(query.companyId)) {
        throw new BadRequestException('companyId inválido.');
      }
    }
    const effectiveCompanyId = isSuperAdmin
      ? query.companyId || tenantCompanyId
      : tenantCompanyId;

    const { csv, filename } = await this.mailService.exportLogs({
      startDate: query.startDate,
      endDate: query.endDate,
      status: query.status,
      to: query.to,
      subject: query.subject,
      messageId: query.messageId,
      // Segurança multi-tenant:
      // - usuários comuns: ignorar companyId vindo da query (não confiável)
      // - ADMIN_GERAL: pode filtrar por companyId explicitamente
      companyId: effectiveCompanyId,
      userId: query.userId || req.user?.userId,
      limit: query.limit,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('logs')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_view_mail')
  async listLogs(
    @Query()
    query: {
      page?: string;
      pageSize?: string;
      startDate?: string;
      endDate?: string;
      status?: string;
      to?: string;
      subject?: string;
      messageId?: string;
      companyId?: string;
      userId?: string;
    },
    @Request() req: RequestWithUser,
  ) {
    const isSuperAdmin = this.tenantService.isSuperAdmin();
    const tenantCompanyId = req.user?.company_id || req.user?.companyId;

    if (isSuperAdmin && query.companyId) {
      const uuidV4 =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidV4.test(query.companyId)) {
        throw new BadRequestException('companyId inválido.');
      }
    }
    const effectiveCompanyId = isSuperAdmin
      ? query.companyId || tenantCompanyId
      : tenantCompanyId;

    return this.mailService.listLogs({
      page: query.page,
      pageSize: query.pageSize,
      startDate: query.startDate,
      endDate: query.endDate,
      status: query.status,
      to: query.to,
      subject: query.subject,
      messageId: query.messageId,
      companyId: effectiveCompanyId,
      userId: query.userId || req.user?.userId,
    });
  }

  @Post('send-stored-document')
  @Authorize('can_manage_mail')
  async sendStoredDocument(
    @Body() body: { documentId: string; documentType: string; email: string },
    @Request() req: RequestWithUser,
  ): Promise<DocumentMailDispatchResponseDto> {
    const { documentId, documentType, email } = body;
    const companyId = req.user?.company_id || req.user?.companyId;

    if (!documentId || !documentType || !email) {
      throw new BadRequestException(
        'documentId, documentType e email são obrigatórios.',
      );
    }

    try {
      // Tenta enfileirar para processamento assíncrono.
      await this.mailQueue.add(
        'send-document',
        {
          documentId,
          documentType,
          email,
          companyId,
        },
        defaultJobOptions,
      );

      this.logger.log({
        event: 'mail_document_dispatch_queued',
        documentType: documentType.toUpperCase().trim(),
        documentId,
        companyId,
        artifactType: 'governed_final_pdf',
        fallbackUsed: false,
        isOfficial: true,
        recipient: email,
      });

      return this.mailService.buildDocumentDispatchResponse({
        message:
          'Solicitação recebida. O documento final governado será enviado por e-mail em instantes.',
        deliveryMode: 'queued',
        artifactType: 'governed_final_pdf',
        isOfficial: true,
        fallbackUsed: false,
        documentType: documentType.toUpperCase().trim(),
        documentId,
      });
    } catch (error) {
      // Fallback: se Redis/fila estiver indisponível, envia no fluxo síncrono
      // para evitar erro 500 no front.
      this.logger.warn(
        `Fila de e-mail indisponível, aplicando fallback síncrono: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return this.mailService.sendStoredDocument(
        documentId,
        documentType,
        email,
        companyId,
      );
    }
  }

  @Post('send-uploaded-document')
  @Authorize('can_manage_mail')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: tmpdir(),
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname) || '.pdf';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: {
        fileSize: 25 * 1024 * 1024,
      },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          return cb(null, false);
        }
        cb(null, true);
      },
    }),
  )
  async sendUploadedDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { email: string; subject?: string; docName?: string },
    @Request() req: RequestWithUser,
  ): Promise<DocumentMailDispatchResponseDto> {
    const email = body.email?.trim();
    if (!email) {
      throw new BadRequestException('email é obrigatório.');
    }

    if (!file) {
      throw new BadRequestException(
        'Arquivo PDF é obrigatório e deve ser do tipo application/pdf.',
      );
    }

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Apenas arquivos PDF são permitidos.');
    }

    const companyId = req.user?.company_id || req.user?.companyId;
    const folder = companyId ? `mail/${companyId}` : 'mail';
    const fileKey = `uploads/${folder}/${randomUUID()}.pdf`;
    const resolvedDocName = body.docName?.trim() || file.originalname;
    let pdfBuffer!: Buffer;

    try {
      pdfBuffer = await readFile(file.path);
      await validatePdfMagicBytesFromPath(file.path);
    } finally {
      await unlink(file.path).catch(() => undefined);
    }

    try {
      await this.documentStorageService.uploadFile(
        fileKey,
        pdfBuffer,
        file.mimetype || 'application/pdf',
      );

      try {
        await this.mailQueue.add(
          'send-file-key',
          {
            fileKey,
            email,
            subject: body.subject,
            docName: resolvedDocName,
            expiresInSeconds: 604800,
            companyId,
            userId: req.user?.userId,
          },
          defaultJobOptions,
        );

        this.logger.warn({
          event: 'mail_document_local_fallback_queued',
          companyId,
          userId: req.user?.userId,
          artifactType: 'local_uploaded_pdf',
          fallbackUsed: true,
          isOfficial: false,
          recipient: email,
          fileKey,
        });

        return this.mailService.buildDocumentDispatchResponse({
          message:
            'Solicitação recebida. O PDF local será enviado por e-mail em instantes. Este envio não substitui o documento final governado.',
          deliveryMode: 'queued',
          artifactType: 'local_uploaded_pdf',
          isOfficial: false,
          fallbackUsed: true,
          fileKey,
        });
      } catch (error) {
        this.logger.warn(
          `Fila de e-mail indisponível para upload, aplicando fallback síncrono pelo arquivo já armazenado: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        try {
          return await this.mailService.sendStoredFileKey(fileKey, email, {
            subject: body.subject,
            docName: resolvedDocName,
            expiresInSeconds: 604800,
            companyId,
            userId: req.user?.userId,
          });
        } catch (sendError) {
          await cleanupUploadedFile(
            this.logger,
            'mail_uploaded_document_sync_fallback',
            fileKey,
            (key) => this.documentStorageService.deleteFile(key),
          );
          throw sendError;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Storage documental indisponível para upload, aplicando fallback síncrono por buffer: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return this.mailService.sendUploadedPdfBuffer(pdfBuffer, email, {
        subject: body.subject,
        docName: resolvedDocName,
        companyId,
        userId: req.user?.userId,
      });
    }
  }

  @Post('alerts/dispatch')
  @Authorize('can_manage_mail')
  async dispatchAlerts(
    @Body() body: DispatchAlertsDto,
    @Request() req: RequestWithUser,
  ) {
    const companyId = req.user?.companyId || req.user?.company_id;
    const result = await this.mailService.dispatchAlerts({
      to: body.to,
      includeWhatsapp: body.includeWhatsapp,
      companyId,
      userId: req.user?.userId,
    });

    if (!result.recipients.length) {
      throw new ServiceUnavailableException('Nenhum destinatário válido.');
    }

    return {
      success: true,
      recipients: result.recipients,
      previewUrl: result.previewUrl,
      usingTestAccount: result.usingTestAccount,
      whatsappSent: result.whatsappSent,
    };
  }
}
