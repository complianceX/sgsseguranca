import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { DelayedError, type Job, type Queue } from 'bullmq';
import { MailService } from './mail.service';
import { MetricsService } from '../common/observability/metrics.service';
import { TenantQuotaService } from '../common/queue/tenant-quota.service';
import { captureException } from '../common/monitoring/sentry';
import { maskEmail } from '../common/logging/log-sanitizer.util';
import {
  TenantService,
  type TenantContext,
} from '../common/tenant/tenant.service';

interface MailSendDocumentJobData {
  documentId: string;
  documentType: string;
  email: string;
  companyId?: string;
  tenantContext?: TenantContext;
}

interface MailSendFileKeyJobData {
  fileKey: string;
  email: string;
  subject?: string;
  docName?: string;
  expiresInSeconds?: number;
  companyId?: string;
  userId?: string;
}

interface MailDeadLetterPayload {
  originalQueue: string;
  originalJobId: string | undefined;
  originalJobName: string;
  attemptsMade: number;
  companyId?: string;
  data: unknown;
  error: {
    message: string;
    stack?: string;
  };
  failedAt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const getOptionalString = (
  record: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
};

const getOptionalNumber = (
  record: Record<string, unknown>,
  key: string,
): number | undefined => {
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
};

const parseSendDocumentJobData = (
  data: unknown,
): MailSendDocumentJobData | null => {
  if (!isRecord(data)) {
    return null;
  }

  const documentId = getOptionalString(data, 'documentId');
  const documentType = getOptionalString(data, 'documentType');
  const email = getOptionalString(data, 'email');
  const companyId = getOptionalString(data, 'companyId');
  const rawTenantContext = data.tenantContext;
  let tenantContext: TenantContext | undefined;

  if (!documentId || !documentType || !email || !companyId) {
    return null;
  }

  if (rawTenantContext !== undefined) {
    if (!isRecord(rawTenantContext)) {
      return null;
    }

    const contextCompanyId = getOptionalString(rawTenantContext, 'companyId');
    const contextUserId = getOptionalString(rawTenantContext, 'userId');
    const rawSiteScope = getOptionalString(rawTenantContext, 'siteScope');
    const rawIsSuperAdmin = rawTenantContext.isSuperAdmin;
    const rawSiteIds = rawTenantContext.siteIds;

    if (
      !contextCompanyId ||
      contextCompanyId !== companyId ||
      typeof rawIsSuperAdmin !== 'boolean' ||
      (rawSiteScope !== 'single' && rawSiteScope !== 'all')
    ) {
      return null;
    }

    let siteIds: string[] | undefined;
    if (rawSiteIds !== undefined) {
      if (!isStringArray(rawSiteIds)) {
        return null;
      }
      siteIds = rawSiteIds
        .map((siteId) => siteId.trim())
        .filter((siteId) => siteId.length > 0);
    }

    tenantContext = {
      companyId: contextCompanyId,
      isSuperAdmin: rawIsSuperAdmin,
      siteScope: rawSiteScope,
      ...(contextUserId ? { userId: contextUserId } : {}),
      ...(siteIds ? { siteIds } : {}),
    };
  }

  return {
    documentId,
    documentType,
    email,
    companyId,
    tenantContext,
  };
};

const parseSendFileKeyJobData = (
  data: unknown,
): MailSendFileKeyJobData | null => {
  if (!isRecord(data)) {
    return null;
  }

  const fileKey = getOptionalString(data, 'fileKey');
  const email = getOptionalString(data, 'email');
  const companyId = getOptionalString(data, 'companyId');

  if (!fileKey || !email || !companyId) {
    return null;
  }

  return {
    fileKey,
    email,
    subject: getOptionalString(data, 'subject'),
    docName: getOptionalString(data, 'docName'),
    expiresInSeconds: getOptionalNumber(data, 'expiresInSeconds'),
    companyId,
    userId: getOptionalString(data, 'userId'),
  };
};

const extractCompanyId = (data: unknown): string | undefined =>
  isRecord(data) ? getOptionalString(data, 'companyId') : undefined;

const isMailDisabledError = (error: Error): boolean =>
  /MAIL_ENABLED=false/i.test(error.message);

// concurrency: 5 — envio de e-mail é I/O-bound (SMTP), suporta mais paralelos.
@Processor('mail', { concurrency: 5 })
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    private readonly mailService: MailService,
    private readonly tenantService: TenantService,
    private readonly metricsService: MetricsService,
    private readonly tenantQuota: TenantQuotaService,
    @InjectQueue('mail-dlq') private readonly mailDlq: Queue,
  ) {
    super();
  }

  // BullMQ v5+: @Process() foi removido. Implementar process() e rotear por job.name.
  async process(
    job: Job<unknown, unknown, string>,
  ): Promise<void | { status: 'sent' }> {
    const start = Date.now();
    const companyId = extractCompanyId(job.data);
    const quota = await this.tenantQuota.tryAcquire('mail', companyId);
    if (!quota.acquired) {
      const delayMs = this.tenantQuota.getDelayMs('mail');
      await job.moveToDelayed(Date.now() + delayMs, job.token);
      this.metricsService.recordQueueJob(
        'mail',
        job.name,
        Date.now() - start,
        'delayed',
        companyId,
      );
      throw new DelayedError();
    }
    try {
      switch (job.name) {
        case 'send-document': {
          const data = parseSendDocumentJobData(job.data);
          if (!data) {
            throw new Error(
              `Payload inválido para job de mail ${job.id ?? 'sem-id'}.`,
            );
          }

          const result = await this.handleSendDocument(job, data);
          this.metricsService.recordQueueJob(
            'mail',
            job.name,
            Date.now() - start,
            'success',
            data.companyId,
          );
          return result;
        }
        case 'send-file-key': {
          const data = parseSendFileKeyJobData(job.data);
          if (!data) {
            throw new Error(
              `Payload inválido para job de mail ${job.id ?? 'sem-id'}.`,
            );
          }

          const result = await this.handleSendFileKey(job, data);
          this.metricsService.recordQueueJob(
            'mail',
            job.name,
            Date.now() - start,
            'success',
            companyId,
          );
          return result;
        }
        default:
          this.logger.warn(`[Job ${job.id}] Tipo desconhecido: ${job.name}`);
          this.metricsService.recordQueueJob(
            'mail',
            job.name,
            Date.now() - start,
            'error',
          );
      }
    } catch (err) {
      this.metricsService.recordQueueJob(
        'mail',
        job.name,
        Date.now() - start,
        'error',
        companyId,
      );
      await this.handleFailure(job, err, companyId);
      throw err;
    } finally {
      await this.tenantQuota.release('mail', companyId);
    }
  }

  private async handleSendDocument(
    job: Job<unknown, unknown, string>,
    data: MailSendDocumentJobData,
  ): Promise<{ status: 'sent' }> {
    const { documentId, documentType, email, companyId, tenantContext } = data;
    this.logger.log(
      `[Job ${job.id}] Processando envio de documento: ${documentType} para ${maskEmail(email)}`,
    );

    try {
      const dispatch = async () =>
        this.mailService.sendStoredDocument(
          documentId,
          documentType,
          email,
          companyId,
        );

      if (tenantContext) {
        await this.tenantService.run(tenantContext, dispatch);
      } else {
        await dispatch();
      }

      this.logger.log(`[Job ${job.id}] E-mail enviado com sucesso.`);
      return { status: 'sent' };
    } catch (error) {
      this.logger.error(
        `[Job ${job.id}] Falha ao enviar e-mail: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async handleSendFileKey(
    job: Job<unknown, unknown, string>,
    data: MailSendFileKeyJobData,
  ): Promise<{ status: 'sent' }> {
    const {
      fileKey,
      email,
      subject,
      docName,
      expiresInSeconds,
      companyId,
      userId,
    } = data;
    this.logger.log(
      `[Job ${job.id}] Processando envio de arquivo para ${maskEmail(email)}`,
    );

    try {
      await this.mailService.sendStoredFileKey(fileKey, email, {
        subject,
        docName,
        expiresInSeconds,
        companyId,
        userId,
      });
      this.logger.log(`[Job ${job.id}] E-mail enviado com sucesso.`);
      return { status: 'sent' };
    } catch (error) {
      this.logger.error(
        `[Job ${job.id}] Falha ao enviar e-mail: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async handleFailure(
    job: Job<unknown, unknown, string>,
    error: unknown,
    companyId: string | undefined,
  ) {
    if (!(error instanceof Error)) {
      return;
    }

    const maxAttempts = job.opts.attempts ?? 1;
    const attemptsAfterFailure = job.attemptsMade + 1;
    const isFinal = attemptsAfterFailure >= maxAttempts;

    this.logger.error(
      `[Job ${job.id}] Falhou${isFinal ? ' definitivamente' : ''}. Tipo: ${job.name}. Erro: ${error.message}`,
      error.stack,
    );

    if (!isFinal) return;

    if (isMailDisabledError(error)) {
      this.logger.warn(
        `[Job ${job.id}] Falha final ignorada para DLQ porque o runtime de e-mail esta explicitamente desabilitado.`,
      );
      return;
    }

    captureException(error, {
      tags: { queue: 'mail', jobName: job.name },
      extra: { jobId: job.id, companyId, attemptsMade: attemptsAfterFailure },
    });

    try {
      const deadLetterPayload: MailDeadLetterPayload = {
        originalQueue: 'mail',
        originalJobId: job.id,
        originalJobName: job.name,
        attemptsMade: attemptsAfterFailure,
        companyId,
        data: job.data,
        error: { message: error.message, stack: error.stack },
        failedAt: new Date().toISOString(),
      };

      await this.mailDlq.add('dead-letter', deadLetterPayload, {
        attempts: 1,
        backoff: undefined,
        removeOnComplete: 5000,
        removeOnFail: 5000,
      });
    } catch (dlqErr) {
      this.logger.error(
        `[Job ${job.id}] Falha ao publicar no DLQ: ${dlqErr instanceof Error ? dlqErr.message : String(dlqErr)}`,
        dlqErr instanceof Error ? dlqErr.stack : undefined,
      );
    }
  }
}
