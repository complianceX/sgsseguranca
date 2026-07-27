import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Repository, LessThan } from 'typeorm';
import type { Queue } from 'bullmq';
import { AuditLog } from '../audit-trail/entities/audit-log.entity';
import { CompaniesService } from '../companies/companies.service';
import { isApiCronDisabled } from '../../shared/utils/scheduler.util';
import * as uploadUtils from '../../shared/interceptors/file-upload.interceptor';
import {
  buildDeterministicJobId,
  getUtcDateJobKey,
  getUtcHourJobKey,
} from '../../infra/queue/default-job-options';
import { PrivilegedDbService } from '../../shared/database/privileged-db.service';

const DLQ_ALERT_THRESHOLD =
  parseInt(process.env.DLQ_MAX_WAITING || '2000', 10) * 0.75;

@Injectable()
export class CleanupTask {
  private readonly logger = new Logger(CleanupTask.name);
  private readonly redisDisabled = /^true$/i.test(
    process.env.REDIS_DISABLED || '',
  );

  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepo: Repository<AuditLog>,
    @InjectQueue('sla-escalation') private readonly slaQueue: Queue,
    @InjectQueue('expiry-notifications') private readonly expiryQueue: Queue,
    @InjectQueue('pdf-generation-dlq') private readonly pdfDlq: Queue,
    private readonly companiesService: CompaniesService,
    private readonly privilegedDb: PrivilegedDbService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldLogs() {
    if (isApiCronDisabled()) {
      this.logger.warn(
        'API_CRONS_DISABLED=true: limpeza agendada de logs foi pulada neste runtime.',
      );
      return;
    }

    const retentionDays = parseInt(
      process.env.AUDIT_LOG_RETENTION_DAYS || '365',
      10,
    );
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    // `audit_logs` tem RLS com FORCE. Este cron roda fora de requisição HTTP
    // sem contexto de tenant — a limpeza é intencionalmente global (todos os
    // tenants), então exige bypass de RLS.
    let eligible: number;
    let deleted: number;

    if (this.privilegedDb.isEnabled()) {
      ({ eligible, deleted } = await this.privilegedDb.withPrivilegedClient(
        async (client) => {
          // Verificação prévia: falha rápida se o papel de runtime perdeu sgs_rls_bypass.
          // Sem isso, SET LOCAL is_super_admin continua sendo emitido mas a policy
          // RESTRICTIVE de audit_logs ainda filtra por tenant, tornando o DELETE inócuo
          // (apaga 0 linhas) e o alerta pós-delete o único sinal do problema.
          const roleCheck = await client.query<{ has_role: boolean }>(
            `SELECT pg_has_role(current_user, 'sgs_rls_bypass', 'member') AS has_role`,
          );
          if (!roleCheck.rows[0]?.has_role) {
            this.logger.error(
              'CleanupTask: papel de runtime não possui sgs_rls_bypass — ' +
                'limpeza de audit_logs abortada para evitar exclusão parcial com RLS ativo.',
            );
            return { eligible: 0, deleted: 0 };
          }

          await client.query('BEGIN');
          try {
            await client.query("SET LOCAL app.is_super_admin = 'true'");
            const countResult = await client.query<{ cnt: number }>(
              `SELECT count(*)::int AS cnt FROM audit_logs WHERE timestamp < $1`,
              [cutoff],
            );
            const eligibleCount = countResult.rows[0]?.cnt ?? 0;
            const deleteResult = await client.query(
              `DELETE FROM audit_logs WHERE timestamp < $1`,
              [cutoff],
            );
            await client.query('COMMIT');
            return {
              eligible: eligibleCount,
              deleted: deleteResult.rowCount ?? 0,
            };
          } catch (err) {
            await client.query('ROLLBACK');
            throw err;
          }
        },
      ));
    } else {
      ({ eligible, deleted } = await this.auditLogRepo.manager.transaction(
        async (manager) => {
          const roleCheck = (await manager.query<{ has_role: boolean }[]>(
            `SELECT pg_has_role(current_user, 'sgs_rls_bypass', 'member') AS has_role`,
          )) as Array<{ has_role: boolean }>;
          if (!roleCheck[0]?.has_role) {
            this.logger.error(
              'CleanupTask: papel de runtime não possui sgs_rls_bypass — ' +
                'limpeza de audit_logs abortada para evitar exclusão parcial com RLS ativo.',
            );
            return { eligible: 0, deleted: 0 };
          }

          await manager.query(`SET LOCAL app.is_super_admin = 'true'`);
          const repo = manager.getRepository(AuditLog);
          const eligibleCount = await repo.count({
            where: { timestamp: LessThan(cutoff) },
          });
          const result = await repo.delete({ timestamp: LessThan(cutoff) });
          return { eligible: eligibleCount, deleted: result.affected ?? 0 };
        },
      ));
    }

    // Divergência aqui significa que o bypass deixou de valer (ex.: papel do
    // runtime perdeu `sgs_rls_bypass`). Sem este alerta a falha volta a ser
    // silenciosa, que foi exatamente o defeito original.
    if (eligible > 0 && deleted === 0) {
      this.logger.error(
        `Retenção de audit_logs não removeu nada apesar de ${eligible} registro(s) elegível(is) — ` +
          'verifique se o papel de runtime ainda possui bypass de RLS (sgs_rls_bypass).',
      );
      return;
    }

    this.logger.log(
      `Old audit logs cleaned up: ${deleted} rows (retention=${retentionDays}d, elegíveis=${eligible})`,
    );
  }

  @Cron(CronExpression.EVERY_WEEK)
  generateWeeklyReports() {
    if (isApiCronDisabled()) {
      this.logger.warn(
        'API_CRONS_DISABLED=true: geração semanal agendada foi pulada neste runtime.',
      );
      return;
    }

    this.logger.log('Starting weekly reports generation...');
    // Lógica de geração de relatórios semanais
  }

  @Cron('0 8 * * *') // Daily at 08:00
  async runExpiryNotifications() {
    if (isApiCronDisabled()) {
      this.logger.warn(
        'API_CRONS_DISABLED=true: notificações agendadas de vencimento foram puladas neste runtime.',
      );
      return;
    }

    if (this.redisDisabled) {
      this.logger.warn(
        'REDIS_DISABLED=true: notificações assíncronas de vencimento foram puladas neste runtime.',
      );
      return;
    }

    const tenants = await this.companiesService.findAllActive();
    const dateKey = getUtcDateJobKey();
    for (const tenant of tenants) {
      await this.expiryQueue.add(
        'training-check',
        { tenantId: tenant.id, type: 'training-check' },
        {
          jobId: buildDeterministicJobId(
            'expiry-notifications:training-check',
            tenant.id,
            dateKey,
          ),
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: 1000,
        },
      );
      await this.expiryQueue.add(
        'epi-check',
        { tenantId: tenant.id, type: 'epi-check' },
        {
          jobId: buildDeterministicJobId(
            'expiry-notifications:epi-check',
            tenant.id,
            dateKey,
          ),
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: 1000,
        },
      );
      await this.expiryQueue.add(
        'medical-exam-check',
        { tenantId: tenant.id, type: 'medical-exam-check' },
        {
          jobId: buildDeterministicJobId(
            'expiry-notifications:medical-exam-check',
            tenant.id,
            dateKey,
          ),
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          removeOnFail: 1000,
        },
      );
    }
    this.logger.log(
      `Expiry notifications enqueued for ${tenants.length} tenants`,
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupStaleTempUploads() {
    if (isApiCronDisabled()) {
      this.logger.warn(
        'API_CRONS_DISABLED=true: limpeza agendada de uploads temporários foi pulada neste runtime.',
      );
      return;
    }

    await uploadUtils.runTempUploadCleanupBestEffort(this.logger);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async runCorrectiveActionsSlaEscalation() {
    if (isApiCronDisabled()) {
      this.logger.warn(
        'API_CRONS_DISABLED=true: varredura agendada de SLA foi pulada neste runtime.',
      );
      return;
    }

    if (this.redisDisabled) {
      this.logger.warn(
        'REDIS_DISABLED=true: varredura assíncrona de SLA foi pulada neste runtime.',
      );
      return;
    }

    const tenants = await this.companiesService.findAllActive();
    const hourKey = getUtcHourJobKey();
    for (const tenant of tenants) {
      await this.slaQueue.add(
        'run-sla-sweep',
        { tenantId: tenant.id },
        {
          jobId: buildDeterministicJobId(
            'sla-escalation:run-sla-sweep',
            tenant.id,
            hourKey,
          ),
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
          // Evita retenção infinita no Redis em caso de falhas repetidas.
          removeOnFail: 1000,
        },
      );
    }
    this.logger.log(`SLA sweep enqueued for ${tenants.length} tenants`);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async checkPdfDlqDepth() {
    if (this.redisDisabled) return;

    try {
      const waiting = await this.pdfDlq.getWaitingCount();
      if (waiting >= DLQ_ALERT_THRESHOLD) {
        this.logger.warn({
          event: 'pdf_dlq_depth_high',
          waiting,
          threshold: DLQ_ALERT_THRESHOLD,
          message:
            'PDF DLQ próxima do limite — investigate falhas recorrentes de geração de PDF',
        });
      }
    } catch (err) {
      this.logger.error(
        `Falha ao checar profundidade do PDF DLQ: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
