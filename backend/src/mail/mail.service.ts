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
import { CircuitBreakerService } from '../common/resilience/circuit-breaker.service';
import { ReportsService } from '../reports/reports.service';
import { InspectionResponseDto } from '../inspections/dto/inspection-response.dto';
import { Audit } from '../audits/entities/audit.entity';
import { CompanyResponseDto } from '../companies/dto/company-response.dto';
import { NonConformity } from '../nonconformities/entities/nonconformity.entity';

@Injectable()
export class MailService {
  private resend: Resend;
  private readonly logger = new Logger(MailService.name);
  private alertsRunning = false;

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
    private circuitBreaker: CircuitBreakerService,
  ) {
    this.resend = new Resend(this.configService.get<string>('RESEND_API_KEY'));
  }

  async sendStoredDocument(
    documentId: string,
    documentType: string,
    email: string,
    _companyId?: string,
  ) {
    let fileKey: string | undefined;
    let subject = 'Documento Compartilhado - COMPLIANCE X';
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

    // Gera URL assinada (7 dias de validade)
    const downloadUrl = await this.storageService.getPresignedDownloadUrl(
      fileKey,
      604800,
    );

    const html = `
      <div style="font-family: sans-serif; color: #333;">
        <h2>${docName}</h2>
        <p>Olá,</p>
        <p>Você recebeu o documento <strong>${docName}</strong> através da plataforma COMPLIANCE X.</p>
        <p>Clique no botão abaixo para visualizar ou baixar o arquivo:</p>
        <div style="margin: 25px 0;">
          <a href="${downloadUrl}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Acessar Documento
          </a>
        </div>
        <p style="font-size: 12px; color: #666;">Este link é seguro e expira em 7 dias.</p>
      </div>
    `;

    await this.sendMail(
      email,
      subject,
      `Acesse seu documento aqui: ${downloadUrl}`,
      html,
    );
  }

  async sendStoredFileKey(
    fileKey: string,
    email: string,
    options?: {
      subject?: string;
      docName?: string;
      expiresInSeconds?: number;
    },
  ) {
    if (!fileKey || !email) {
      throw new BadRequestException('fileKey e email são obrigatórios.');
    }

    const docName = options?.docName?.trim() || 'Documento';
    const subject =
      options?.subject?.trim() || 'Documento Compartilhado - COMPLIANCE X';
    const expiresInSeconds = options?.expiresInSeconds ?? 604800;

    const downloadUrl = await this.storageService.getPresignedDownloadUrl(
      fileKey,
      expiresInSeconds,
    );

    const html = `
      <div style="font-family: sans-serif; color: #333;">
        <h2>${docName}</h2>
        <p>Olá,</p>
        <p>Você recebeu o documento <strong>${docName}</strong> através da plataforma COMPLIANCE X.</p>
        <p>Clique no botão abaixo para visualizar ou baixar o arquivo:</p>
        <div style="margin: 25px 0;">
          <a href="${downloadUrl}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Acessar Documento
          </a>
        </div>
        <p style="font-size: 12px; color: #666;">Este link é seguro e expira em 7 dias.</p>
      </div>
    `;

    await this.sendMail(
      email,
      subject,
      `Acesse seu documento aqui: ${downloadUrl}`,
      html,
    );
  }

  async sendMail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<void> {
    const fromName =
      this.configService.get<string>('MAIL_FROM_NAME')?.trim() ||
      'COMPLIANCE X';
    const fromEmail =
      this.configService.get<string>('MAIL_FROM_EMAIL')?.trim() ||
      'onboarding@resend.dev';

    await this.circuitBreaker.execute(
      'resend-email',
      () =>
        this.resend.emails.send({
          from: `${fromName} <${fromEmail}>`,
          to,
          subject,
          text,
          html: html || text,
        }),
      { failureThreshold: 5, resetTimeout: 60000, timeout: 10000 },
    );
  }

  async sendMailSimple(
    to: string,
    subject: string,
    text: string,
    context?: { companyId?: string; userId?: string },
    attachments?: any[],
  ): Promise<{
    info: any;
    previewUrl?: string;
    usingTestAccount: boolean;
  }> {
    const fromName =
      this.configService.get<string>('MAIL_FROM_NAME')?.trim() ||
      'COMPLIANCE X';
    const fromEmail =
      this.configService.get<string>('MAIL_FROM_EMAIL')?.trim() ||
      'onboarding@resend.dev';

    const html = text
      ? `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1f2937;">${text.replace(
          /\n/g,
          '<br/>',
        )}</div>`
      : undefined;

    try {
      const data = await this.circuitBreaker.execute(
        'resend-email',
        () =>
          this.resend.emails.send({
            from: `${fromName} <${fromEmail}>`,
            to,
            subject,
            text,
            html,
            attachments,
          }),
        { failureThreshold: 5, resetTimeout: 60000, timeout: 10000 },
      );

      if (data.error) {
        throw new Error(`Resend Error: ${data.error.message}`);
      }

      const log = this.mailLogRepository.create({
        company_id: context?.companyId,
        user_id: context?.userId,
        to,
        subject,
        filename: 'alerta',
        message_id: data.data?.id,
        accepted: [to],
        rejected: [],
        provider_response: 'Resend API',
        using_test_account: false,
        status: 'success',
      });

      await this.mailLogRepository.save(log);

      this.logger.log({
        event: 'mail_sent',
        companyId: context?.companyId,
        userId: context?.userId,
        messageId: data.data?.id,
        provider: 'Resend',
      });

      return { info: data, previewUrl: undefined, usingTestAccount: false };
    } catch (error) {
      const message = this.extractErrorMessage(error);

      const log = this.mailLogRepository.create({
        company_id: context?.companyId,
        user_id: context?.userId,
        to,
        subject,
        filename: 'alerta',
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
      ).padStart(2, '0')}/${year}.\n\nAtenciosamente,\nEquipe Compliance X`;

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
    ]);

    // RISCO: A contagem de "action items" ainda usa `findAll()`, pois exige uma lógica complexa
    // para consultar campos JSON. Isso ainda representa um risco de performance e deve ser
    // otimizado no futuro, criando métodos de contagem específicos nos seus respectivos serviços.
    const companyId = this.tenantService.getTenantId() || '';
    const inspections = await this.inspectionsService.findAll(companyId);
    const audits = await this.auditsService.findAll(companyId);
    const nonconformitiesForActions =
      await this.nonConformitiesService.findAll();
    const actionItems = this.countActionItems(
      inspections,
      audits,
      nonconformitiesForActions,
    );

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

  private countActionItems(
    inspections: InspectionResponseDto[],
    audits: Audit[],
    nonconformities: NonConformity[],
  ) {
    const isDone = (status?: string) => {
      if (!status) return false;
      const value = status.toLowerCase();
      return value.includes('conclu') || value.includes('encerr');
    };

    const inspectionActions = inspections.reduce((total, inspection) => {
      const planoAcao =
        (inspection.plano_acao as Array<{ status?: string }>) || [];
      const pending = planoAcao.filter((item) => !isDone(item.status)).length;
      return total + pending;
    }, 0);

    const auditActions = audits.reduce((total, audit) => {
      const planoAcao = (audit.plano_acao as Array<{ status?: string }>) || [];
      const pending = planoAcao.filter((item) => !isDone(item.status)).length;
      return total + pending;
    }, 0);

    const nonconformityActions = nonconformities.reduce((total, item) => {
      const immediate = item.acao_imediata_status
        ? isDone(item.acao_imediata_status)
          ? 0
          : 1
        : 0;
      const definitive = item.status ? (isDone(item.status) ? 0 : 1) : 0;
      return total + immediate + definitive;
    }, 0);

    return inspectionActions + auditActions + nonconformityActions;
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
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
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
    this.alertsRunning = true;
    try {
      const recipients = this.normalizeRecipients(
        this.configService.get<string>('MAIL_ALERT_TO') || '',
      );
      if (!recipients.length) {
        return;
      }

      // RISCO: `findAll` pode causar problemas de memória com muitas empresas.
      // RECOMENDAÇÃO: Implementar paginação no `companiesService.findAll` e processar em lotes.
      const companies = await this.companiesService.findAll();
      for (const company of companies) {
        await this.dispatchAlerts({
          to: recipients.join(','),
          includeWhatsapp:
            this.configService.get<string>('WHATSAPP_ALERTS_ENABLED') ===
            'true',
          companyId: company.id,
        });
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

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Erro desconhecido';
  }
}
