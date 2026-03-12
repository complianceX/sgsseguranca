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
import nodemailer, { SentMessageInfo, Transporter } from 'nodemailer';
import { Resend } from 'resend';
import { Repository, Between, LessThan, Not, In } from 'typeorm';
import { MailLog } from './entities/mail-log.entity';
import { EpisService } from '../epis/epis.service';
import { TrainingsService } from '../trainings/trainings.service';
import { PtsService } from '../pts/pts.service';
import { AprsService } from '../aprs/aprs.service';
import { ChecklistsService } from '../checklists/checklists.service';
import { NonConformitiesService } from '../nonconformities/nonconformities.service';
import { DdsService } from '../dds/dds.service';
import { InspectionsService } from '../inspections/inspections.service';
import { AuditsService } from '../audits/audits.service';
import { CompaniesService } from '../companies/companies.service';
import { TenantService } from '../common/tenant/tenant.service';
import { StorageService } from '../common/services/storage.service';
import { IntegrationResilienceService } from '../common/resilience/integration-resilience.service';
import { ReportsService } from '../reports/reports.service';
import { CompanyResponseDto } from '../companies/dto/company-response.dto';

type MailContext = { companyId?: string; userId?: string };

type MailProvider = 'smtp' | 'resend';

type MailDeliveryResult = {
  provider: MailProvider;
  messageId?: string;
  accepted: string[];
  rejected: string[];
  providerResponse?: string;
  raw: unknown;
};

type SendMailMetadata = {
  html?: string;
  filename?: string;
};

@Injectable()
export class MailService {
  private resend: Resend | null = null;
  private transporter: Transporter | null = null;
  private readonly logger = new Logger(MailService.name);
  private alertsRunning = false;
  private lastScheduledAlertsAt = 0;
  private scheduledAlertsCursor = 0;

  constructor(
    private configService: ConfigService,
    @InjectRepository(MailLog)
    private mailLogRepository: Repository<MailLog>,
    private episService: EpisService,
    private trainingsService: TrainingsService,
    private ptsService: PtsService,
    private aprsService: AprsService,
    @Inject(forwardRef(() => ChecklistsService))
    private checklistsService: ChecklistsService,
    private nonConformitiesService: NonConformitiesService,
    private ddsService: DdsService,
    private inspectionsService: InspectionsService,
    private auditsService: AuditsService,
    private companiesService: CompaniesService,
    private tenantService: TenantService,
    private storageService: StorageService,
    private reportsService: ReportsService,
    private readonly integration: IntegrationResilienceService,
  ) {
    const smtpHost = this.configService.get<string>('MAIL_HOST')?.trim();
    const smtpUser = this.configService.get<string>('MAIL_USER')?.trim();
    const smtpPass = this.configService.get<string>('MAIL_PASS')?.trim();
    const smtpPort = Number(this.configService.get<string>('MAIL_PORT') || '587');
    const smtpSecureRaw = this.configService.get<string>('MAIL_SECURE');
    const smtpSecure =
      smtpSecureRaw === 'true' ||
      this.configService.get<boolean>('MAIL_SECURE') === true;

    if (smtpHost && smtpUser && smtpPass) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number.isFinite(smtpPort) ? smtpPort : 587,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
      this.logger.log(`MailService configurado com SMTP (${smtpHost}).`);
      return;
    }

    const resendApiKey = this.configService.get<string>('RESEND_API_KEY')?.trim();
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
  ) {
    let fileKey: string | undefined;
    let subject = 'Documento Compartilhado - GST';
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
          const checklist = await this.checklistsService.findOne(documentId);
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
        default:
          // Tenta buscar em outros módulos se necessário ou lança erro
          throw new BadRequestException(
            `Tipo de documento não suportado: ${type}`,
          );
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
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

    const pdfBuffer = await this.storageService.downloadFileBuffer(fileKey);
    const attachmentFilename = this.buildAttachmentFilename(docName, fileKey);

    const html = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; max-width: 560px; margin: 0 auto; padding: 28px; background-color: #f8fafc; border: 1px solid #d9e2ec; border-radius: 18px;">
        <div style="display: inline-block; margin-bottom: 16px; padding: 6px 10px; border-radius: 999px; background-color: #dbeafe; color: #1d4ed8; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
          &lt;GST&gt; Gestão de Segurança do Trabalho
        </div>
        <h2 style="margin: 0 0 12px; color: #0f172a;">${docName}</h2>
        <p>Olá,</p>
        <p>Você recebeu o documento <strong>${docName}</strong> através da plataforma &lt;GST&gt; Gestão de Segurança do Trabalho.</p>
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
  ) {
    if (!fileKey || !email) {
      throw new BadRequestException('fileKey e email são obrigatórios.');
    }

    const docName = options?.docName?.trim() || 'Documento';
    const subject =
      options?.subject?.trim() || 'Documento Compartilhado - GST';
    const pdfBuffer = await this.storageService.downloadFileBuffer(fileKey);
    const attachmentFilename = this.buildAttachmentFilename(docName, fileKey);

    const html = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; max-width: 560px; margin: 0 auto; padding: 28px; background-color: #f8fafc; border: 1px solid #d9e2ec; border-radius: 18px;">
        <div style="display: inline-block; margin-bottom: 16px; padding: 6px 10px; border-radius: 999px; background-color: #dbeafe; color: #1d4ed8; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
          &lt;GST&gt; Gestão de Segurança do Trabalho
        </div>
        <h2 style="margin: 0 0 12px; color: #0f172a;">${docName}</h2>
        <p>Olá,</p>
        <p>Você recebeu o documento <strong>${docName}</strong> através da plataforma &lt;GST&gt; Gestão de Segurança do Trabalho.</p>
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
  }

  async sendMail(
    to: string,
    subject: string,
    text: string,
    html?: string,
    context?: MailContext & { filename?: string },
  ): Promise<void> {
    await this.sendMailSimple(
      to,
      subject,
      text,
      context,
      undefined,
      { html, filename: context?.filename },
    );
  }

  async sendMailSimple(
    to: string,
    subject: string,
    text: string,
    context?: MailContext,
    attachments?: any[],
    metadata?: SendMailMetadata,
  ): Promise<{
    info: any;
    previewUrl?: string;
    usingTestAccount: boolean;
  }> {
    const { fromName, fromEmail } = this.resolveFromAddress();
    const html = metadata?.html
      ? metadata.html
      : text
      ? `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1f2937;">${text.replace(
          /\n/g,
          '<br/>',
        )}</div>`
      : undefined;

    try {
      const delivery = await this.sendWithConfiguredProvider({
        to,
        subject,
        text,
        html,
        attachments,
      });
      const usingTestAccount =
        delivery.provider === 'resend' && fromEmail.endsWith('@resend.dev');

      const log = this.mailLogRepository.create({
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
      });

      await this.mailLogRepository.save(log);

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
    } catch (error) {
      const message = this.extractErrorMessage(error);

      const log = this.mailLogRepository.create({
        company_id: context?.companyId,
        user_id: context?.userId,
        to,
        subject,
        filename: metadata?.filename || 'alerta',
        using_test_account: false,
        status: 'error',
        error_message: message,
      });

      await this.mailLogRepository.save(log);

      this.logger.error(
        {
          event: 'mail_failed',
          companyId: context?.companyId,
          userId: context?.userId,
          error: message,
        },
        error instanceof Error ? error.stack : undefined,
      );

      throw new ServiceUnavailableException(
        `Falha ao enviar e-mail para ${to}: ${message}`,
      );
    }
  }

  private resolveFromAddress() {
    const fromName =
      this.configService.get<string>('MAIL_FROM_NAME')?.trim() ||
      'GST - Gestão de Segurança do Trabalho';
    const fromEmail =
      this.configService.get<string>('MAIL_FROM_EMAIL')?.trim() ||
      this.configService.get<string>('MAIL_USER')?.trim() ||
      'onboarding@resend.dev';
    return { fromName, fromEmail };
  }

  private async sendWithConfiguredProvider(options: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    attachments?: any[];
  }): Promise<MailDeliveryResult> {
    const { fromName, fromEmail } = this.resolveFromAddress();
    const recipients = this.normalizeRecipients(options.to);
    if (!recipients.length) {
      throw new BadRequestException(
        'Nenhum destinatário válido para envio de e-mail.',
      );
    }

    if (this.transporter) {
      const info = await this.integration.execute<SentMessageInfo>(
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
          timeoutMs: 10_000,
          retry: { attempts: 2, mode: 'safe' },
        },
      );

      return {
        provider: 'smtp',
        messageId: info?.messageId,
        accepted: this.toAddressList(info?.accepted, recipients),
        rejected: this.toAddressList(info?.rejected, []),
        providerResponse:
          typeof info?.response === 'string' ? info.response : undefined,
        raw: info,
      };
    }

    if (this.resend) {
      type ResendResponse = {
        data?: { id?: string } | null;
        error?: { message?: string } | null;
      };

      const data = await this.integration.execute<ResendResponse>(
        'resend_email',
        () =>
          this.resend!.emails.send({
            from: `${fromName} <${fromEmail}>`,
            to: recipients.length === 1 ? recipients[0] : recipients,
            subject: options.subject,
            text: options.text,
            html: options.html || options.text,
            attachments: this.normalizeAttachmentsForResend(options.attachments),
          }),
        {
          timeoutMs: 10_000,
          retry: { attempts: 2, mode: 'safe' },
        },
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
      'Nenhum provedor de e-mail configurado. Configure SMTP ou RESEND_API_KEY.',
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

  private normalizeAttachmentsForResend(attachments?: any[]) {
    if (!attachments?.length) {
      return undefined;
    }

    return attachments.map((attachment) => {
      const normalized = { ...attachment };
      if (Buffer.isBuffer(normalized.content)) {
        normalized.content = normalized.content.toString('base64');
      }
      return normalized;
    });
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
      ).padStart(2, '0')}/${year}.\n\nAtenciosamente,\nEquipe GST`;

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
      this.checklistsService.count({
        where: { status: 'Pendente', is_template: false },
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
    if (this.alertsRunning) {
      return;
    }

    const minIntervalMs = this.getEnvNumber(
      'MAIL_ALERT_SCHEDULE_MIN_INTERVAL_MS',
      5 * 60_000,
    );
    const now = Date.now();
    if (now - this.lastScheduledAlertsAt < minIntervalMs) {
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
      const maxParallel = this.getEnvNumber('MAIL_ALERT_COMPANY_MAX_PARALLEL', 2);
      const companyBatch = this.selectCompanyBatch(companies, batchSize);

      for (let i = 0; i < companyBatch.length; i += maxParallel) {
        const chunk = companyBatch.slice(i, i + maxParallel);
        await Promise.all(
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
      }
    } finally {
      this.alertsRunning = false;
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
