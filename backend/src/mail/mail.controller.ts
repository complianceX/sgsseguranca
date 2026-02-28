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
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { unlink } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { UploadedFile } from '@nestjs/common';
import { MailService } from './mail.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { DispatchAlertsDto } from './dto/dispatch-alerts.dto';
import { StorageService } from '../common/services/storage.service';

type RequestWithUser = {
  user?: { company_id?: string; companyId?: string; userId?: string };
};

@Controller('mail')
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantInterceptor)
export class MailController {
  constructor(
    private readonly mailService: MailService,
    @InjectQueue('mail') private readonly mailQueue: Queue,
    private readonly storageService: StorageService,
  ) {}

  @Get('logs/export')
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
    const { csv, filename } = await this.mailService.exportLogs({
      startDate: query.startDate,
      endDate: query.endDate,
      status: query.status,
      to: query.to,
      subject: query.subject,
      messageId: query.messageId,
      companyId: req.user?.company_id || query.companyId,
      userId: query.userId || req.user?.userId,
      limit: query.limit,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('logs')
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
    return this.mailService.listLogs({
      page: query.page,
      pageSize: query.pageSize,
      startDate: query.startDate,
      endDate: query.endDate,
      status: query.status,
      to: query.to,
      subject: query.subject,
      messageId: query.messageId,
      companyId: req.user?.company_id || query.companyId,
      userId: query.userId || req.user?.userId,
    });
  }

  @Post('send-stored-document')
  async sendStoredDocument(
    @Body() body: { documentId: string; documentType: string; email: string },
    @Request() req: RequestWithUser,
  ) {
    const { documentId, documentType, email } = body;

    if (!documentId || !documentType || !email) {
      throw new BadRequestException(
        'documentId, documentType e email são obrigatórios.',
      );
    }

    // Adiciona o job na fila para processamento assíncrono
    await this.mailQueue.add(
      'send-document',
      {
        documentId,
        documentType,
        email,
        companyId: req.user?.company_id || req.user?.companyId,
      },
      {
        attempts: 3, // Tenta 3 vezes em caso de falha
        backoff: 5000, // Espera 5 segundos entre tentativas
        removeOnComplete: true, // Limpa o Redis após sucesso
      },
    );

    return {
      success: true,
      message:
        'Solicitação recebida. O documento será enviado por e-mail em instantes.',
    };
  }

  @Post('send-uploaded-document')
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
  ) {
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

    try {
      await this.storageService.upload(
        fileKey,
        createReadStream(file.path),
        file.mimetype || 'application/pdf',
      );
    } finally {
      await unlink(file.path).catch(() => undefined);
    }

    await this.mailQueue.add(
      'send-file-key',
      {
        fileKey,
        email,
        subject: body.subject,
        docName: body.docName || file.originalname,
        expiresInSeconds: 604800,
      },
      {
        attempts: 3,
        backoff: 5000,
        removeOnComplete: true,
      },
    );

    return {
      success: true,
      message:
        'Solicitação recebida. O documento será enviado por e-mail em instantes.',
      fileKey,
    };
  }

  @Post('alerts/dispatch')
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
