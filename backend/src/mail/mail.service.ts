import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  Inject,
  forwardRef,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import nodemailer, { Transporter } from 'nodemailer';
import { Resend } from 'resend';
import { Repository, Between, LessThan, Not, In } from 'typeorm';
import { MailLog } from './entities/mail-log.entity';
import { Cat } from '../cats/entities/cat.entity';
import { EpisService } from '../epis/epis.service';
import { TrainingsService } from '../trainings/trainings.service';
import { PtsService } from '../pts/pts.service';
import { AprsService } from '../aprs/aprs.service';
import { NonConformitiesService } from '../nonconformities/nonconformities.service';
import { DdsService } from '../dds/dds.service';
import { InspectionsService } from '../inspections/inspections.service';
import { AuditsService } from '../audits/audits.service';
import { RdosService } from '../rdos/rdos.service';
import { CompaniesService } from '../companies/companies.service';
import { TenantService } from '../common/tenant/tenant.service';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { IntegrationResilienceService } from '../common/resilience/integration-resilience.service';
import { isApiCronDisabled } from '../common/utils/scheduler.util';
import { ReportsService } from '../reports/reports.service';
import { CompanyResponseDto } from '../companies/dto/company-response.dto';
import { Checklist } from '../checklists/entities/checklist.entity';
import {
  DocumentMailArtifactType,
  DocumentMailDispatchResponseDto,
} from './dto/document-mail-dispatch-response.dto';
import {
  DistributedLockHandle,
  DistributedLockService,
} from '../common/redis/distributed-lock.service';

type MailContext = { companyId?: string; userId?: string };

type MailProvider = 'smtp' | 'resend' | 'brevo';
type LooseRecord = Record<string, unknown>;
type MailAttachment = {
  filename: string;
  content: Buffer | string;
  contentType?: string;
};
type ResendAttachment = Omit<MailAttachment, 'content'> & {
  content: string;
};
type ResendSendResponse = {
  data?: { id?: string } | null;
  error?: { message?: string } | null;
};

type BrevoErrorBody = { message?: string; code?: string };

type MailDeliveryResult = {
  provider: MailProvider;
  messageId?: string;
  accepted: string[];
  rejected: string[];
  providerResponse?: string;
  raw: unknown;
};

type MailFailureDetails = {
  message: string;
  code:
    | 'MAIL_DELIVERY_FAILED'
    | 'MAIL_PROVIDER_TIMEOUT'
    | 'MAIL_PROVIDER_CIRCUIT_OPEN'
    | 'BREVO_IP_NOT_AUTHORIZED';
  provider?: MailProvider;
  blockedIp?: string;
  retryAfterSeconds?: number;
};

type SendMailMetadata = {
  html?: string;
  filename?: string;
};

const isLooseRecord = (value: unknown): value is LooseRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

@Injectable()
export class MailService {
  private resend: Resend | null = null;
  private transporter: Transporter | null = null;
  private brevoApiKey: string | null = null;
  private readonly logger = new Logger(MailService.name);
  private alertsRunning = false;
  private lastScheduledAlertsAt = 0;
  private scheduledAlertsCursor = 0;

  constructor(
    private configService: ConfigService,
    @InjectRepository(MailLog)
    private mailLogRepository: Repository<MailLog>,
    @InjectRepository(Cat)
    private readonly catsRepository: Repository<Cat>,
    private episService: EpisService,
    private trainingsService: TrainingsService,
    private ptsService: PtsService,
    private aprsService: AprsService,
    @InjectRepository(Checklist)
    private readonly checklistsRepository: Repository<Checklist>,
    private nonConformitiesService: NonConformitiesService,
    private ddsService: DdsService,
    private inspectionsService: InspectionsService,
    private auditsService: AuditsService,
    @Inject(forwardRef(() => RdosService))
    private rdosService: RdosService,
    private companiesService: CompaniesService,
    private tenantService: TenantService,
    private documentStorageService: DocumentStorageService,
    private reportsService: ReportsService,
    private readonly integration: IntegrationResilienceService,
    private readonly distributedLock: DistributedLockService,
  ) {
    const smtpHost = this.configService.get<string>('MAIL_HOST')?.trim();
    const smtpUser = this.configService.get<string>('MAIL_USER')?.trim();
    const smtpPass = this.configService.get<string>('MAIL_PASS')?.trim();
    const smtpPort = Number(
      this.configService.get<string>('MAIL_PORT') || '587',
    );
    const smtpSecureRaw = this.configService.get<string>('MAIL_SECURE');
    const smtpSecure =
      smtpSecureRaw === 'true' ||
      this.configService.get<boolean>('MAIL_SECURE') === true;
    const smtpTimeoutMs = this.resolveMailProviderTimeoutMs('smtp');

    const brevoApiKey = this.configService.get<string>('BREVO_API_KEY')?.trim();
    if (brevoApiKey) {
      this.brevoApiKey = brevoApiKey;
      this.logger.log('MailService configurado com Brevo API.');
      return;
    }

    if (smtpHost && smtpUser && smtpPass) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number.isFinite(smtpPort) ? smtpPort : 587,
        secure: smtpSecure,
        connectionTimeout: smtpTimeoutMs,
        greetingTimeout: smtpTimeoutMs,
        socketTimeout: smtpTimeoutMs,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
      this.logger.log(
        `MailService configurado com SMTP (${smtpHost}) timeout=${smtpTimeoutMs}ms.`,
      );
      return;
    }

    const resendApiKey = this.configService
      .get<string>('RESEND_API_KEY')
      ?.trim();
    if (resendApiKey) {
      this.resend = new Resend(resendApiKey);
      this.logger.log('MailService configurado com Resend.');
      return;
    }

    this.logger.warn(
      'Nenhum provedor de e-mail configurado. Configure SMTP (MAIL_HOST/MAIL_USER/MAIL_PASS) ou RESEND_API_KEY.',
    );
  }

  async sendStoredDocument(
    documentId: string,
    documentType: string,
    email: string,
    companyId?: string,
  ): Promise<DocumentMailDispatchResponseDto> {
    const resolvedCompanyId =
      companyId?.trim() || this.tenantService.getTenantId() || undefined;
    let fileKey: string | undefined;
    let subject = 'Documento Compartilhado - SGS';
    let docName = 'Documento';

    // Normaliza o tipo para evitar problemas de case
    const type = documentType.toUpperCase().trim();

    try {
      switch (type) {
        case 'PT': {
          const pt = await this.ptsService.findOne(documentId);
          if (pt) {
            fileKey = pt.pdf_file_key;
            docName = `Permissão de Trabalho #${pt.numero}`;
            subject = `${docName}`;
          }
          break;
        }
        case 'APR': {
          const apr = await this.aprsService.findOne(documentId);
          if (apr) {
            fileKey = apr.pdf_file_key;
            docName = `APR: ${apr.titulo}`;
            subject = `${docName}`;
          }
          break;
        }
        case 'CHECKLIST': {
          const checklist = await this.checklistsRepository.findOne({
            where: {
              id: documentId,
              ...(resolvedCompanyId ? { company_id: resolvedCompanyId } : {}),
            },
            select: ['id', 'pdf_file_key'],
          });
          if (checklist) {
            fileKey = checklist.pdf_file_key;
            docName = `Checklist`;
            subject = `${docName}`;
          }
          break;
        }
        case 'DDS': {
          const dds = await this.ddsService.findOne(documentId);
          if (dds) {
            fileKey = dds.pdf_file_key;
            docName = `DDS: ${dds.tema || 'Documento'}`;
            subject = `${docName}`;
          }
          break;
        }
        case 'CAT': {
          const cat = await this.catsRepository.findOne({
            where: {
              id: documentId,
              ...(resolvedCompanyId ? { company_id: resolvedCompanyId } : {}),
            },
            select: ['id', 'numero', 'pdf_file_key'],
          });
          if (!cat) {
            throw new NotFoundException(
              'CAT não encontrada para envio por e-mail.',
            );
          }
          if (!cat.pdf_file_key) {
            throw new NotFoundException(
              'A CAT ainda não possui PDF final governado emitido.',
            );
          }
          fileKey = cat.pdf_file_key;
          docName = `CAT #${cat.numero}`;
          subject = `${docName}`;
          break;
        }
        case 'NONCONFORMITY':
        case 'NC': {
          const nc = await this.nonConformitiesService.findOne(documentId);
          const access =
            await this.nonConformitiesService.getPdfAccess(documentId);
          if (!access.hasFinalPdf || !access.fileKey) {
            throw new NotFoundException(
              'A não conformidade ainda não possui PDF final emitido.',
            );
          }
          fileKey = access.fileKey;
          docName = `Não Conformidade: ${nc.codigo_nc}`;
          subject = `${docName}`;
          break;
        }
        case 'INSPECTION': {
          if (!resolvedCompanyId) {
            throw new BadRequestException(
              'companyId é obrigatório para enviar relatórios de inspeção.',
            );
          }
          const inspection = await this.inspectionsService.findOne(
            documentId,
            resolvedCompanyId,
          );
          const access = await this.inspectionsService.getPdfAccess(
            documentId,
            resolvedCompanyId,
          );
          if (!access.hasFinalPdf || !access.fileKey) {
            throw new NotFoundException(
              'O relatório de inspeção ainda não possui PDF final emitido.',
            );
          }
          fileKey = access.fileKey;
          docName = `Inspeção: ${inspection.tipo_inspecao} - ${inspection.setor_area}`;
          subject = `${docName}`;
          break;
        }
        case 'AUDIT': {
          if (!resolvedCompanyId) {
            throw new BadRequestException(
              'companyId é obrigatório para enviar auditorias.',
            );
          }
          const audit = await this.auditsService.findOne(
            documentId,
            resolvedCompanyId,
          );
          const access = await this.auditsService.getPdfAccess(
            documentId,
            resolvedCompanyId,
          );
          if (!access.hasFinalPdf || !access.fileKey) {
            throw new NotFoundException(
              'A auditoria ainda não possui PDF final emitido.',
            );
          }
          fileKey = access.fileKey;
          docName = `Auditoria: ${audit.titulo}`;
          subject = `${docName}`;
          break;
        }
        case 'RDO': {
          const rdo = await this.rdosService.findOne(documentId);
          const access = await this.rdosService.getPdfAccess(documentId);
          if (!access.hasFinalPdf || !access.fileKey) {
            throw new NotFoundException(
              'O RDO ainda não possui PDF final emitido.',
            );
          }
          fileKey = access.fileKey;
          docName = `RDO ${rdo.numero}`;
          subject = `${docName}`;
          break;
        }
        default:
          // Tenta buscar em outros módulos se necessário ou lança erro
          throw new BadRequestException(
            `Tipo de documento não suportado: ${type}`,
          );
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        const message = this.extractErrorMessage(error);
        if (
          /ainda nao possui pdf final|ainda não possui pdf final/i.test(message)
        ) {
          throw error;
        }
        throw new NotFoundException(
          `Documento do tipo ${type} com ID ${documentId} não encontrado.`,
        );
      }
      throw error;
    }

    if (!fileKey) {
      throw new NotFoundException(
        `O documento ${docName} não possui um arquivo PDF gerado/anexado.`,
      );
    }

    const pdfBuffer = await this.downloadMailAttachmentBuffer(fileKey, {
      companyId: resolvedCompanyId,
      userId: undefined,
      artifactLabel: docName,
    });
    const attachmentFilename = this.buildAttachmentFilename(docName, fileKey);

    const html = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; max-width: 560px; margin: 0 auto; padding: 28px; background-color: #f8fafc; border: 1px solid #d9e2ec; border-radius: 18px;">
        <div style="display: inline-block; margin-bottom: 16px; padding: 6px 10px; border-radius: 999px; background-color: #dbeafe; color: #1d4ed8; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
          SGS — Sistema de Gestão de Segurança
        </div>
        <h2 style="margin: 0 0 12px; color: #0f172a;">${docName}</h2>
        <p>Olá,</p>
        <p>Você recebeu o documento <strong>${docName}</strong> através da plataforma SGS — Sistema de Gestão de Segurança.</p>
        <p>O PDF está anexado neste e-mail para visualização e download.</p>
      </div>
    `;

    await this.sendMailSimple(
      email,
      subject,
      `Segue em anexo o documento ${docName}.`,
      { companyId },
      [
        {
          filename: attachmentFilename,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
      {
        html,
        filename: attachmentFilename,
      },
    );

    this.logger.log({
      event: 'mail_document_sent',
      documentType: type,
      documentId,
      companyId: resolvedCompanyId,
      artifactType: 'governed_final_pdf',
      fallbackUsed: false,
      isOfficial: true,
      recipient: email,
    });

    return this.buildDocumentDispatchResponse({
      message:
        'O documento final governado foi enviado por e-mail com sucesso.',
      deliveryMode: 'sent',
      artifactType: 'governed_final_pdf',
      isOfficial: true,
      fallbackUsed: false,
      documentId,
      documentType: type,
    });
  }

  async sendStoredFileKey(
    fileKey: string,
    email: string,
    options?: {
      subject?: string;
      docName?: string;
      expiresInSeconds?: number;
      companyId?: string;
      userId?: string;
    },
  ): Promise<DocumentMailDispatchResponseDto> {
    if (!fileKey || !email) {
      throw new BadRequestException('fileKey e email são obrigatórios.');
    }

    const docName = options?.docName?.trim() || 'Documento';
    const subject = options?.subject?.trim() || 'Documento Compartilhado - SGS';
    const pdfBuffer = await this.downloadMailAttachmentBuffer(fileKey, {
      companyId: options?.companyId,
      userId: options?.userId,
      artifactLabel: docName,
    });
    const attachmentFilename = this.buildAttachmentFilename(docName, fileKey);

    const html = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; max-width: 560px; margin: 0 auto; padding: 28px; background-color: #f8fafc; border: 1px solid #d9e2ec; border-radius: 18px;">
        <div style="display: inline-block; margin-bottom: 16px; padding: 6px 10px; border-radius: 999px; background-color: #dbeafe; color: #1d4ed8; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
          SGS — Sistema de Gestão de Segurança
        </div>
        <h2 style="margin: 0 0 12px; color: #0f172a;">${docName}</h2>
        <p>Olá,</p>
        <p>Você recebeu o documento <strong>${docName}</strong> através da plataforma SGS — Sistema de Gestão de Segurança.</p>
        <p>O PDF está anexado neste e-mail para visualização e download.</p>
      </div>
    `;

    await this.sendMailSimple(
      email,
      subject,
      `Segue em anexo o documento ${docName}.`,
      {
        companyId: options?.companyId,
        userId: options?.userId,
      },
      [
        {
          filename: attachmentFilename,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
      {
        html,
        filename: attachmentFilename,
      },
    );

    this.logger.warn({
      event: 'mail_document_sent_with_local_fallback',
      companyId: options?.companyId,
      userId: options?.userId,
      artifactType: 'local_uploaded_pdf',
      fallbackUsed: true,
      isOfficial: false,
      recipient: email,
      fileKey,
    });

    return this.buildDocumentDispatchResponse({
      message:
        'O PDF local foi enviado por e-mail. Este envio não substitui o documento final governado.',
      deliveryMode: 'sent',
      artifactType: 'local_uploaded_pdf',
      isOfficial: false,
      fallbackUsed: true,
      fileKey,
    });
  }

  async sendUploadedPdfBuffer(
    pdfBuffer: Buffer,
    email: string,
    options?: {
      subject?: string;
      docName?: string;
      companyId?: string;
      userId?: string;
    },
  ): Promise<DocumentMailDispatchResponseDto> {
    if (!email) {
      throw new BadRequestException('email é obrigatório.');
    }

    const docName = options?.docName?.trim() || 'Documento';
    const subject = options?.subject?.trim() || 'Documento Compartilhado - SGS';
    const attachmentFilename = this.buildAttachmentFilename(docName);

    const html = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; max-width: 560px; margin: 0 auto; padding: 28px; background-color: #f8fafc; border: 1px solid #d9e2ec; border-radius: 18px;">
        <div style="display: inline-block; margin-bottom: 16px; padding: 6px 10px; border-radius: 999px; background-color: #fef3c7; color: #b45309; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
          Envio local/degradado
        </div>
        <h2 style="margin: 0 0 12px; color: #0f172a;">${docName}</h2>
        <p>Olá,</p>
        <p>Você recebeu o documento <strong>${docName}</strong> através da plataforma SGS — Sistema de Gestão de Segurança.</p>
        <p>O PDF está anexado neste e-mail para visualização e download.</p>
        <p><strong>Importante:</strong> este envio utilizou um PDF local/degradado e não substitui o documento final governado.</p>
      </div>
    `;

    await this.sendMailSimple(
      email,
      subject,
      `Segue em anexo o documento ${docName}. Este envio utilizou um PDF local/degradado e não substitui o documento final governado.`,
      {
        companyId: options?.companyId,
        userId: options?.userId,
      },
      [
        {
          filename: attachmentFilename,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
      {
        html,
        filename: attachmentFilename,
      },
    );

    this.logger.warn({
      event: 'mail_document_sent_with_buffer_fallback',
      companyId: options?.companyId,
      userId: options?.userId,
      artifactType: 'local_uploaded_pdf',
      fallbackUsed: true,
      isOfficial: false,
      recipient: email,
    });

    return this.buildDocumentDispatchResponse({
      message:
        'O PDF local foi enviado por e-mail. Este envio não substitui o documento final governado.',
      deliveryMode: 'sent',
      artifactType: 'local_uploaded_pdf',
      isOfficial: false,
      fallbackUsed: true,
    });
  }

  buildDocumentDispatchResponse(input: {
    message: string;
    deliveryMode: 'queued' | 'sent';
    artifactType: DocumentMailArtifactType;
    isOfficial: boolean;
    fallbackUsed: boolean;
    documentType?: string;
    documentId?: string;
    fileKey?: string;
  }): DocumentMailDispatchResponseDto {
    return {
      success: true,
      message: input.message,
      deliveryMode: input.deliveryMode,
      artifactType: input.artifactType,
      isOfficial: input.isOfficial,
      fallbackUsed: input.fallbackUsed,
      documentType: input.documentType,
      documentId: input.documentId,
      fileKey: input.fileKey,
    };
  }

  async sendMail(
    to: string,
    subject: string,
    text: string,
    html?: string,
    context?: MailContext & { filename?: string },
  ): Promise<void> {
    await this.sendMailSimple(to, subject, text, context, undefined, {
      html,
      filename: context?.filename,
    });
  }

  async sendMailSimple(
    to: string,
    subject: string,
    text: string,
    context?: MailContext,
    attachments?: MailAttachment[],
    metadata?: SendMailMetadata,
  ): Promise<{
    info: unknown;
    previewUrl?: string;
    usingTestAccount: boolean;
  }> {
    const { fromEmail } = this.resolveFromAddress();
    const html = metadata?.html
      ? metadata.html
      : text
        ? `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1f2937;">${text.replace(
            /\n/g,
            '<br/>',
          )}</div>`
        : undefined;

    let delivery: MailDeliveryResult;
    try {
      delivery = await this.sendWithConfiguredProvider({
        to,
        subject,
        text,
        html,
        attachments,
      });
    } catch (error) {
      const failure = this.normalizeMailFailure(error);

      await this.persistMailLogSafely(
        {
          company_id: context?.companyId,
          user_id: context?.userId,
          to,
          subject,
          filename: metadata?.filename || 'alerta',
          using_test_account: false,
          status: 'error',
          error_message: failure.message,
        },
        {
          event: 'mail_log_persist_failed_after_send_error',
          companyId: context?.companyId,
          userId: context?.userId,
          to,
        },
      );

      this.logger.error(
        {
          event: 'mail_failed',
          companyId: context?.companyId,
          userId: context?.userId,
          provider: failure.provider,
          code: failure.code,
          blockedIp: failure.blockedIp,
          retryAfterSeconds: failure.retryAfterSeconds,
          error: failure.message,
        },
        error instanceof Error ? error.stack : undefined,
      );

      throw new ServiceUnavailableException({
        message: failure.message,
        code: failure.code,
        provider: failure.provider,
        blockedIp: failure.blockedIp,
        retryAfterSeconds: failure.retryAfterSeconds,
        degraded: true,
      });
    }

    const usingTestAccount =
      delivery.provider === 'resend' && fromEmail.endsWith('@resend.dev');

    await this.persistMailLogSafely(
      {
        company_id: context?.companyId,
        user_id: context?.userId,
        to,
        subject,
        filename: metadata?.filename || 'alerta',
        message_id: delivery.messageId,
        accepted: delivery.accepted,
        rejected: delivery.rejected,
        provider_response: delivery.providerResponse,
        using_test_account: usingTestAccount,
        status: 'success',
      },
      {
        event: 'mail_log_persist_failed_after_success',
        companyId: context?.companyId,
        userId: context?.userId,
        to,
        provider: delivery.provider,
        messageId: delivery.messageId,
      },
    );

    this.logger.log({
      event: 'mail_sent',
      companyId: context?.companyId,
      userId: context?.userId,
      messageId: delivery.messageId,
      provider: delivery.provider,
    });

    return {
      info: {
        data: { id: delivery.messageId },
        provider: delivery.provider,
        raw: delivery.raw,
      },
      previewUrl: undefined,
      usingTestAccount,
    };
  }

  private resolveFromAddress() {
    const fromName =
      this.configService.get<string>('MAIL_FROM_NAME')?.trim() ||
      'SGS - Sistema de Gestão de Segurança';
    const fromEmail =
      this.configService.get<string>('MAIL_FROM_EMAIL')?.trim() ||
      this.configService.get<string>('MAIL_USER')?.trim() ||
      'onboarding@resend.dev';
    return { fromName, fromEmail };
  }

  private async persistMailLogSafely(
    data: Partial<MailLog>,
    context: Record<string, unknown>,
  ): Promise<void> {
    try {
      const log = this.mailLogRepository.create(data);
      await this.mailLogRepository.save(log);
    } catch (error) {
      this.logger.warn({
        ...context,
        error: this.extractErrorMessage(error),
      });
    }
  }

  private async downloadMailAttachmentBuffer(
    fileKey: string,
    context: {
      companyId?: string;
      userId?: string;
      artifactLabel: string;
    },
  ): Promise<Buffer> {
    try {
      return await this.documentStorageService.downloadFileBuffer(fileKey);
    } catch (error) {
      const message = this.extractErrorMessage(error);
      this.logger.warn({
        event: 'mail_attachment_storage_failed',
        companyId: context.companyId,
        userId: context.userId,
        fileKey,
        artifactLabel: context.artifactLabel,
        error: message,
      });
      if (
        error instanceof NotFoundException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      throw new ServiceUnavailableException(
        `O artefato oficial de ${context.artifactLabel} não pôde ser obtido no storage governado para envio por e-mail.`,
      );
    }
  }

  private async sendWithConfiguredProvider(options: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    attachments?: MailAttachment[];
  }): Promise<MailDeliveryResult> {
    const { fromName, fromEmail } = this.resolveFromAddress();
    const recipients = this.normalizeRecipients(options.to);
    if (!recipients.length) {
      throw new BadRequestException(
        'Nenhum destinatário válido para envio de e-mail.',
      );
    }

    if (this.brevoApiKey) {
      const timeoutMs = this.resolveMailProviderTimeoutMs('brevo');
      const rawInfo = await this.integration.execute<unknown>(
        'brevo_email',
        async () => {
          const payload = {
            sender: { name: fromName, email: fromEmail },
            to: recipients.map((email) => ({ email })),
            subject: options.subject,
            textContent: options.text,
            htmlContent: options.html || options.text,
            attachment: this.normalizeAttachmentsForBrevo(options.attachments),
          };

          const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-key': this.brevoApiKey!,
            },
            body: JSON.stringify(payload),
          });

          const bodyText = await response.text();
          if (!response.ok) {
            let parsed: BrevoErrorBody | null = null;
            try {
              parsed = JSON.parse(bodyText) as BrevoErrorBody;
            } catch {
              parsed = null;
            }

            const message = parsed?.message || bodyText;
            const code = parsed?.code;
            if (
              response.status === 401 &&
              (code === 'unauthorized' ||
                /unrecognised ip address/i.test(message))
            ) {
              const ipMatch = message.match(
                /unrecognised ip address\s+([0-9a-f:.]+)/i,
              );
              const blockedIp = ipMatch?.[1]?.replace(/[.)\s]+$/g, '');
              throw new Error(
                `Brevo bloqueou o IP de saída do servidor (${blockedIp || 'desconhecido'}). Autorize este IP em Brevo (Security > Authorised IPs) e tente novamente.`,
              );
            }

            throw new Error(
              `Brevo API error: status=${response.status} body=${bodyText}`,
            );
          }

          try {
            return JSON.parse(bodyText) as unknown;
          } catch {
            return { raw: bodyText };
          }
        },
        { timeoutMs, retry: { attempts: 2, mode: 'safe' } },
      );

      const brevo = this.toBrevoInfo(rawInfo);
      return {
        provider: 'brevo',
        messageId: brevo.messageId,
        accepted: recipients,
        rejected: [],
        providerResponse: 'Brevo API',
        raw: rawInfo,
      };
    }

    if (this.transporter) {
      const timeoutMs = this.resolveMailProviderTimeoutMs('smtp');
      const rawInfo = await this.integration.execute<unknown>(
        'smtp_email',
        () =>
          this.transporter!.sendMail({
            from: `${fromName} <${fromEmail}>`,
            to: recipients.join(','),
            subject: options.subject,
            text: options.text,
            html: options.html || options.text,
            attachments: options.attachments,
          }),
        {
          timeoutMs,
          retry: { attempts: 2, mode: 'safe' },
        },
      );
      const info = this.toSmtpInfo(rawInfo);

      return {
        provider: 'smtp',
        messageId: info.messageId,
        accepted: this.toAddressList(info.accepted, recipients),
        rejected: this.toAddressList(info.rejected, []),
        providerResponse: info.response,
        raw: rawInfo,
      };
    }

    if (this.resend) {
      const timeoutMs = this.resolveMailProviderTimeoutMs('resend');
      const data = this.toResendSendResponse(
        await this.integration.execute<unknown>(
          'resend_email',
          () =>
            this.resend!.emails.send({
              from: `${fromName} <${fromEmail}>`,
              to: recipients.length === 1 ? recipients[0] : recipients,
              subject: options.subject,
              text: options.text,
              html: options.html || options.text,
              attachments: this.normalizeAttachmentsForResend(
                options.attachments,
              ),
            }),
          {
            timeoutMs,
            retry: { attempts: 2, mode: 'safe' },
          },
        ),
      );

      if (data?.error?.message) {
        throw new Error(`Resend Error: ${data.error.message}`);
      }

      return {
        provider: 'resend',
        messageId: data?.data?.id,
        accepted: recipients,
        rejected: [],
        providerResponse: 'Resend API',
        raw: data,
      };
    }

    throw new ServiceUnavailableException(
      'Nenhum provedor de e-mail configurado. Configure BREVO_API_KEY, SMTP ou RESEND_API_KEY.',
    );
  }

  private toAddressList(value: unknown, fallback: string[]): string[] {
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'address' in item) {
            const address = (item as { address?: string }).address;
            return typeof address === 'string' ? address : '';
          }
          return String(item ?? '');
        })
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (typeof value === 'string') {
      return [value].filter(Boolean);
    }
    return fallback;
  }

  private toSmtpInfo(value: unknown): {
    messageId?: string;
    accepted?: unknown;
    rejected?: unknown;
    response?: string;
  } {
    const record = isLooseRecord(value) ? value : null;

    return {
      messageId:
        typeof record?.messageId === 'string' ? record.messageId : undefined,
      accepted: record?.accepted,
      rejected: record?.rejected,
      response:
        typeof record?.response === 'string' ? record.response : undefined,
    };
  }

  private toResendSendResponse(value: unknown): ResendSendResponse {
    const record = isLooseRecord(value) ? value : null;
    const data = isLooseRecord(record?.data) ? record.data : null;
    const error = isLooseRecord(record?.error) ? record.error : null;

    return {
      data: data
        ? {
            id: typeof data.id === 'string' ? data.id : undefined,
          }
        : null,
      error: error
        ? {
            message:
              typeof error.message === 'string' ? error.message : undefined,
          }
        : null,
    };
  }

  private normalizeAttachmentsForResend(
    attachments?: MailAttachment[],
  ): ResendAttachment[] | undefined {
    if (!attachments?.length) {
      return undefined;
    }

    return attachments.map((attachment) => {
      const content = Buffer.isBuffer(attachment.content)
        ? attachment.content.toString('base64')
        : attachment.content;

      return {
        ...attachment,
        content,
      };
    });
  }

  private normalizeAttachmentsForBrevo(
    attachments?: MailAttachment[],
  ): { name: string; content: string }[] | undefined {
    if (!attachments?.length) {
      return undefined;
    }

    const mapped = attachments.map((attachment) => ({
      name: attachment.filename,
      content: Buffer.isBuffer(attachment.content)
        ? attachment.content.toString('base64')
        : Buffer.from(String(attachment.content || ''), 'utf8').toString(
            'base64',
          ),
    }));

    // Brevo aceita array; manter sempre array.
    return mapped;
  }

  private toBrevoInfo(value: unknown): { messageId?: string } {
    const record = isLooseRecord(value) ? value : null;
    const messageId =
      typeof record?.messageId === 'string' ? record.messageId : undefined;
    return { messageId };
  }

  private resolveMailProviderTimeoutMs(provider: MailProvider): number {
    const providerEnv =
      provider === 'smtp'
        ? 'SMTP_EMAIL_TIMEOUT_MS'
        : provider === 'resend'
          ? 'RESEND_EMAIL_TIMEOUT_MS'
          : 'BREVO_EMAIL_TIMEOUT_MS';
    const mailDeliveryTimeout = this.getEnvNumber(
      'MAIL_DELIVERY_TIMEOUT_MS',
      0,
    );
    const providerTimeout = this.getEnvNumber(providerEnv, 0);
    const integrationTimeout = this.getEnvNumber('INTEGRATION_TIMEOUT_MS', 0);
    const fallback = provider === 'smtp' ? 30_000 : 15_000;

    return Math.max(
      1_000,
      providerTimeout || mailDeliveryTimeout || integrationTimeout || fallback,
    );
  }

  private buildAttachmentFilename(docName: string, fileKey?: string): string {
    const keyName = fileKey?.split('/').pop()?.trim();
    if (keyName && keyName.toLowerCase().endsWith('.pdf')) {
      return keyName;
    }

    const normalized = docName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();

    return `${normalized || 'documento'}.pdf`;
  }

  async sendMonthlyReport(
    companyId: string,
    email: string,
    month?: number,
    year?: number,
  ) {
    const now = new Date();
    // Se não for especificado, gera do mês anterior
    if (!month || !year) {
      month = now.getMonth(); // 0-11. Se 0 (Jan), anterior é Dez (12)
      year = now.getFullYear();
      if (month === 0) {
        month = 12;
        year--;
      }
    }

    try {
      const pdfBuffer = await this.reportsService.generateMonthlyReport(
        companyId,
        year,
        month,
      );

      const subject = `Relatório Mensal de Conformidade - ${String(
        month,
      ).padStart(2, '0')}/${year}`;

      const text = `Olá,\n\nSegue em anexo o relatório mensal de conformidade referente a ${String(
        month,
      ).padStart(2, '0')}/${year}.\n\nAtenciosamente,\nEquipe SGS`;

      await this.sendMailSimple(email, subject, text, { companyId }, [
        {
          filename: `relatorio-mensal-${year}-${String(month).padStart(
            2,
            '0',
          )}.pdf`,
          content: pdfBuffer,
        },
      ]);
    } catch (error) {
      const message = this.extractErrorMessage(error);
      this.logger.error(
        `Erro ao enviar relatório mensal para ${email}: ${message}`,
      );
      throw error;
    }
  }

  async dispatchAlerts(options: {
    to?: string;
    includeWhatsapp?: boolean;
    companyId?: string;
    userId?: string;
  }) {
    const resolvedCompanyId = options.companyId;
    if (!resolvedCompanyId) {
      throw new ServiceUnavailableException(
        'Empresa não encontrada para o envio de alertas.',
      );
    }

    const recipients = this.normalizeRecipients(
      options.to || this.configService.get<string>('MAIL_ALERT_TO') || '',
    );

    if (!recipients.length) {
      throw new ServiceUnavailableException(
        'Nenhum destinatário configurado para alertas.',
      );
    }

    const summary = await this.tenantService.run(
      { companyId: resolvedCompanyId, isSuperAdmin: false },
      () => this.buildAlertSummary(),
    );

    const company = await this.findCompany(resolvedCompanyId);
    const subject = `Alertas de conformidade${
      company?.razao_social ? ` - ${company.razao_social}` : ''
    }`;

    const mailResult = await this.sendMailSimple(
      recipients.join(','),
      subject,
      summary,
      { companyId: resolvedCompanyId, userId: options.userId },
    );

    const whatsappEnabled =
      options.includeWhatsapp ||
      this.configService.get<string>('WHATSAPP_ALERTS_ENABLED') === 'true';

    const whatsappResult = whatsappEnabled
      ? await this.sendWhatsappWebhook({
          to: recipients,
          companyId: resolvedCompanyId,
          companyName: company?.razao_social,
          message: summary,
        })
      : { sent: false };

    return {
      recipients,
      previewUrl: mailResult.previewUrl,
      usingTestAccount: mailResult.usingTestAccount,
      whatsappSent: whatsappResult.sent,
    };
  }

  private normalizeRecipients(value: string | string[]) {
    if (Array.isArray(value)) {
      return value.map((item) => item.trim()).filter(Boolean);
    }
    return value
      .split(/[,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private async findCompany(
    companyId: string,
  ): Promise<CompanyResponseDto | undefined> {
    try {
      return await this.companiesService.findOne(companyId);
    } catch {
      this.logger.warn({
        event: 'company_not_found',
        companyId,
      });
      return undefined;
    }
  }

  private async buildAlertSummary(): Promise<string> {
    const now = new Date();
    const limitDate = new Date();
    limitDate.setDate(now.getDate() + 30);
    const companyId = this.tenantService.getTenantId() || '';

    const [
      episExpired,
      episExpiring,
      trainingsExpired,
      trainingsExpiring,
      pendingPts,
      urgentPts,
      pendingAprs,
      pendingChecklists,
      openNonconformities,
      ddsCount,
      inspectionActionItems,
      auditActionItems,
      nonconformityActionItems,
    ] = await Promise.all([
      this.episService.count({ where: { validade_ca: LessThan(now) } }),
      this.episService.count({
        where: { validade_ca: Between(now, limitDate) },
      }),
      this.trainingsService.count({
        where: { data_vencimento: LessThan(now) },
      }),
      this.trainingsService.count({
        where: { data_vencimento: Between(now, limitDate) },
      }),
      this.ptsService.count({ where: { status: 'Pendente' } }),
      this.ptsService.count({
        where: { status: 'Pendente', data_hora_inicio: LessThan(now) },
      }),
      this.aprsService.count({ where: { status: 'Pendente' } }),
      this.checklistsRepository.count({
        where: { status: 'Pendente', is_modelo: false },
      }),
      this.nonConformitiesService.count({
        where: { status: Not(In(['Encerrada', 'Concluída', 'Concluida'])) },
      }),
      this.ddsService.count(),
      this.inspectionsService.countPendingActionItems(companyId),
      this.auditsService.countPendingActionItems(companyId),
      this.nonConformitiesService.countPendingActionItems(companyId),
    ]);

    const actionItems =
      inspectionActionItems + auditActionItems + nonconformityActionItems;

    const reminders = [
      `Resumo de alertas (${now.toLocaleDateString('pt-BR')}):`,
      `- EPIs vencidos: ${episExpired}`,
      `- EPIs vencendo em 30 dias: ${episExpiring}`,
      `- Treinamentos vencidos: ${trainingsExpired}`,
      `- Treinamentos vencendo em 30 dias: ${trainingsExpiring}`,
      `- PTs pendentes: ${pendingPts}`,
      `- PTs iniciadas e pendentes: ${urgentPts}`,
      `- APRs pendentes: ${pendingAprs}`,
      `- Checklists pendentes: ${pendingChecklists}`,
      `- NCs em aberto: ${openNonconformities}`,
      `- Ações pendentes (inspeções/auditorias/NCs): ${actionItems}`,
      `- DDS registrados: ${ddsCount}`,
    ];

    return reminders.join('\n');
  }

  private async sendWhatsappWebhook(payload: {
    to: string[];
    companyId: string;
    companyName?: string;
    message: string;
  }) {
    const webhookUrl = this.configService
      .get<string>('WHATSAPP_WEBHOOK_URL')
      ?.trim();
    if (!webhookUrl) {
      return { sent: false };
    }

    const controller = new AbortController();
    const timeoutMs = 15000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.integration.execute(
        'whatsapp_webhook',
        () =>
          fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
          }),
        { timeoutMs, retry: { attempts: 2, mode: 'safe' } },
      );
      const sent = response.ok;
      if (!sent) {
        this.logger.warn({
          event: 'whatsapp_webhook_failed',
          status: response.status,
        });
      }
      return { sent };
    } catch (error) {
      const message = this.extractErrorMessage(error);
      this.logger.warn({
        event: 'whatsapp_webhook_error',
        error: message,
      });
      return { sent: false };
    } finally {
      clearTimeout(timeout);
    }
  }

  // SECURITY: uso de @Cron evita saturar o event loop com setInterval
  @Cron(CronExpression.EVERY_MINUTE)
  private async runScheduledAlerts() {
    if (isApiCronDisabled()) {
      this.logger.warn({
        event: 'mail_scheduled_alerts_skipped',
        reason: 'API_CRONS_DISABLED',
      });
      return;
    }

    if (this.alertsRunning) {
      return;
    }

    const minIntervalMs = this.getEnvNumber(
      'MAIL_ALERT_SCHEDULE_MIN_INTERVAL_MS',
      5 * 60_000,
    );
    const lockTtlMs = Math.max(
      minIntervalMs,
      this.getEnvNumber('MAIL_ALERT_SCHEDULE_LOCK_TTL_MS', 10 * 60_000),
    );
    const now = Date.now();
    if (now - this.lastScheduledAlertsAt < minIntervalMs) {
      return;
    }

    let lock: DistributedLockHandle | null = null;
    try {
      lock = await this.distributedLock.tryAcquire(
        'mail:scheduled-alerts',
        lockTtlMs,
      );
    } catch (error) {
      this.logger.error({
        event: 'mail_scheduled_alerts_lock_error',
        error: this.extractErrorMessage(error),
      });
      return;
    }

    if (!lock) {
      this.logger.debug({
        event: 'mail_scheduled_alerts_skipped',
        reason: 'LOCK_NOT_ACQUIRED',
      });
      return;
    }

    this.alertsRunning = true;
    try {
      this.lastScheduledAlertsAt = now;
      const recipients = this.normalizeRecipients(
        this.configService.get<string>('MAIL_ALERT_TO') || '',
      );
      if (!recipients.length) {
        return;
      }

      const companies = await this.companiesService.findAllActive();
      if (!companies.length) {
        return;
      }

      const batchSize = this.getEnvNumber('MAIL_ALERT_COMPANY_BATCH_SIZE', 10);
      const maxParallel = this.getEnvNumber(
        'MAIL_ALERT_COMPANY_MAX_PARALLEL',
        2,
      );
      const companyBatch = this.selectCompanyBatch(companies, batchSize);

      for (let i = 0; i < companyBatch.length; i += maxParallel) {
        const chunk = companyBatch.slice(i, i + maxParallel);
        const results = await Promise.allSettled(
          chunk.map((company) =>
            this.dispatchAlerts({
              to: recipients.join(','),
              includeWhatsapp:
                this.configService.get<string>('WHATSAPP_ALERTS_ENABLED') ===
                'true',
              companyId: company.id,
            }),
          ),
        );

        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            return;
          }

          this.logger.warn({
            event: 'mail_scheduled_alert_company_failed',
            companyId: chunk[index]?.id,
            error: this.extractErrorMessage(result.reason),
          });
        });
      }
    } finally {
      this.alertsRunning = false;
      try {
        await this.distributedLock.release(lock);
      } catch (error) {
        this.logger.warn({
          event: 'mail_scheduled_alerts_lock_release_failed',
          error: this.extractErrorMessage(error),
        });
      }
    }
  }

  async listLogs(filters: {
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
  }) {
    const page = Math.max(Number(filters.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(filters.pageSize) || 20, 1), 100);
    const skip = (page - 1) * pageSize;

    const query = this.mailLogRepository
      .createQueryBuilder('log')
      .orderBy('log.created_at', 'DESC')
      .skip(skip)
      .take(pageSize);

    if (filters.companyId) {
      query.andWhere('log.company_id = :companyId', {
        companyId: filters.companyId,
      });
    }

    if (filters.userId) {
      query.andWhere('log.user_id = :userId', { userId: filters.userId });
    }

    if (filters.status) {
      query.andWhere('log.status = :status', { status: filters.status });
    }

    if (filters.to) {
      query.andWhere('log.to ILIKE :to', { to: `%${filters.to}%` });
    }

    if (filters.subject) {
      query.andWhere('log.subject ILIKE :subject', {
        subject: `%${filters.subject}%`,
      });
    }

    if (filters.messageId) {
      query.andWhere('log.message_id ILIKE :messageId', {
        messageId: `%${filters.messageId}%`,
      });
    }

    const startDate = filters.startDate
      ? new Date(filters.startDate)
      : undefined;
    if (startDate && !Number.isNaN(startDate.getTime())) {
      query.andWhere('log.created_at >= :startDate', { startDate });
    }

    const endDate = filters.endDate ? new Date(filters.endDate) : undefined;
    if (endDate && !Number.isNaN(endDate.getTime())) {
      query.andWhere('log.created_at <= :endDate', { endDate });
    }

    const [items, total] = await query.getManyAndCount();

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  async exportLogs(filters: {
    startDate?: string;
    endDate?: string;
    status?: string;
    to?: string;
    subject?: string;
    messageId?: string;
    companyId?: string;
    userId?: string;
    limit?: string;
  }) {
    const limit = Math.min(Math.max(Number(filters.limit) || 1000, 1), 5000);
    const query = this.mailLogRepository
      .createQueryBuilder('log')
      .orderBy('log.created_at', 'DESC')
      .take(limit);

    if (filters.companyId) {
      query.andWhere('log.company_id = :companyId', {
        companyId: filters.companyId,
      });
    }

    if (filters.userId) {
      query.andWhere('log.user_id = :userId', { userId: filters.userId });
    }

    if (filters.status) {
      query.andWhere('log.status = :status', { status: filters.status });
    }

    if (filters.to) {
      query.andWhere('log.to ILIKE :to', { to: `%${filters.to}%` });
    }

    if (filters.subject) {
      query.andWhere('log.subject ILIKE :subject', {
        subject: `%${filters.subject}%`,
      });
    }

    if (filters.messageId) {
      query.andWhere('log.message_id ILIKE :messageId', {
        messageId: `%${filters.messageId}%`,
      });
    }

    const startDate = filters.startDate
      ? new Date(filters.startDate)
      : undefined;
    if (startDate && !Number.isNaN(startDate.getTime())) {
      query.andWhere('log.created_at >= :startDate', { startDate });
    }

    const endDate = filters.endDate ? new Date(filters.endDate) : undefined;
    if (endDate && !Number.isNaN(endDate.getTime())) {
      query.andWhere('log.created_at <= :endDate', { endDate });
    }

    const logs = await query.getMany();
    const header = [
      'id',
      'company_id',
      'user_id',
      'to',
      'subject',
      'filename',
      'message_id',
      'accepted',
      'rejected',
      'provider_response',
      'using_test_account',
      'status',
      'error_message',
      'created_at',
    ];

    const rows = logs.map((log) => [
      log.id,
      log.company_id,
      log.user_id,
      log.to,
      log.subject,
      log.filename,
      log.message_id,
      JSON.stringify(log.accepted || []),
      JSON.stringify(log.rejected || []),
      log.provider_response,
      String(log.using_test_account),
      log.status,
      log.error_message,
      log.created_at ? log.created_at.toISOString() : '',
    ]);

    const csv =
      [header, ...rows]
        .map((row) =>
          row
            .map((value) => {
              const text =
                value === undefined || value === null ? '' : String(value);
              const escaped = text.replace(/"/g, '""');
              return `"${escaped}"`;
            })
            .join(','),
        )
        .join('\n') + '\n';

    const filename = `mail-logs-${new Date().toISOString().slice(0, 10)}.csv`;

    return { csv, filename };
  }

  private getEnvNumber(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = raw ? Number(raw) : NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
  }

  private normalizeMailFailure(error: unknown): MailFailureDetails {
    const message =
      this.extractErrorMessage(error).trim() || 'Erro desconhecido';
    const blockedIpMatch = message.match(
      /Brevo bloqueou o IP de saída do servidor \(([^)]+)\)/i,
    );

    if (blockedIpMatch) {
      const blockedIp = blockedIpMatch[1].replace(/[.)\s]+$/g, '');
      return {
        message: `Brevo bloqueou o IP de saída do servidor (${blockedIp}). Autorize este IP em Brevo > Security > Authorised IPs e tente novamente.`,
        code: 'BREVO_IP_NOT_AUTHORIZED',
        provider: 'brevo',
        blockedIp,
      };
    }

    const circuitBreakerMatch = message.match(
      /Circuit breaker integration:brevo_email is OPEN(?:\.\s*Retry after\s*(\d+)ms\.)?/i,
    );
    if (circuitBreakerMatch) {
      const retryAfterMs = Number(circuitBreakerMatch[1] || '30000');
      const retryAfterSeconds = Number.isFinite(retryAfterMs)
        ? Math.max(1, Math.ceil(retryAfterMs / 1000))
        : 30;

      return {
        message:
          'A integracao de e-mail com a Brevo entrou em protecao apos falhas recentes. Aguarde alguns instantes e confirme os Authorised IPs da conta antes de tentar novamente.',
        code: 'MAIL_PROVIDER_CIRCUIT_OPEN',
        provider: 'brevo',
        retryAfterSeconds,
      };
    }

    if (
      /ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|timeout|timed out|socket hang up|connection reset/i.test(
        message,
      )
    ) {
      return {
        message:
          'A integracao de e-mail nao respondeu a tempo. O envio nao foi concluido. Tente novamente em instantes e valide a conectividade do provedor.',
        code: 'MAIL_PROVIDER_TIMEOUT',
      };
    }

    return {
      message,
      code: 'MAIL_DELIVERY_FAILED',
    };
  }

  private selectCompanyBatch<T extends { id: string }>(
    companies: T[],
    batchSize: number,
  ): T[] {
    if (!companies.length) {
      return [];
    }
    const size = Math.max(1, Math.min(batchSize, companies.length));
    const start = this.scheduledAlertsCursor % companies.length;
    const selected: T[] = [];

    for (let index = 0; index < size; index += 1) {
      selected.push(companies[(start + index) % companies.length]);
    }

    this.scheduledAlertsCursor = (start + size) % companies.length;
    return selected;
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Erro desconhecido';
  }
}
