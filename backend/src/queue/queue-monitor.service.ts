import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class QueueMonitorService {
  private readonly logger = new Logger(QueueMonitorService.name);
  private getQueueWaitingThreshold(): number {
    const raw = process.env.ALERTS_QUEUE_WAITING_THRESHOLD;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : 20;
  }

  constructor(
    @InjectQueue('pdf-generation') private pdfQueue: Queue,
    @InjectQueue('mail') private mailQueue: Queue,
    @InjectQueue('pdf-generation-dlq') private pdfDlqQueue: Queue,
    @InjectQueue('mail-dlq') private mailDlqQueue: Queue,
  ) {}

  // SECURITY: monitoramento periódico das filas sem bloquear o servidor HTTP
  @Cron(CronExpression.EVERY_MINUTE)
  private async runQueueMonitor() {
    await this.logQueueStats();
  }

  private async logQueueStats() {
    try {
      // BullMQ usa 'wait' em vez de 'waiting' para jobs na fila
      const pdfStats = await this.pdfQueue.getJobCounts(
        'active',
        'wait',
        'completed',
        'failed',
      );
      const mailStats = await this.mailQueue.getJobCounts(
        'active',
        'wait',
        'completed',
        'failed',
      );
      const pdfDlqStats = await this.pdfDlqQueue.getJobCounts('wait', 'failed');
      const mailDlqStats = await this.mailDlqQueue.getJobCounts(
        'wait',
        'failed',
      );

      const pdfTotal = Object.values(pdfStats).reduce(
        (a: number, b: number) => a + b,
        0,
      );
      const mailTotal = Object.values(mailStats).reduce(
        (a: number, b: number) => a + b,
        0,
      );

      this.logger.log(
        `📊 FILA PDF: ${pdfStats.active || 0} ativo, ${pdfStats.wait || 0} aguardando, ${pdfStats.completed || 0} completo, ${pdfStats.failed || 0} falhou (Total: ${pdfTotal})`,
      );

      this.logger.log(
        `📧 FILA MAIL: ${mailStats.active || 0} ativo, ${mailStats.wait || 0} aguardando, ${mailStats.completed || 0} completo, ${mailStats.failed || 0} falhou (Total: ${mailTotal})`,
      );

      this.logger.log(
        `🧯 DLQ PDF: ${pdfDlqStats.wait || 0} aguardando, ${pdfDlqStats.failed || 0} falhou`,
      );
      this.logger.log(
        `🧯 DLQ MAIL: ${mailDlqStats.wait || 0} aguardando, ${mailDlqStats.failed || 0} falhou`,
      );

      // Alertas
      if ((pdfStats.failed || 0) > 5) {
        this.logger.warn(`⚠️ ALERTA: ${pdfStats.failed} jobs de PDF falharam!`);
      }

      if ((mailStats.failed || 0) > 5) {
        this.logger.warn(
          `⚠️ ALERTA: ${mailStats.failed} jobs de email falharam!`,
        );
      }

      const threshold = this.getQueueWaitingThreshold();
      if ((pdfStats.wait || 0) > threshold) {
        this.logger.warn({
          alert: 'QUEUE_WAITING_HIGH',
          queue: 'pdf-generation',
          waiting: pdfStats.wait || 0,
          threshold,
          action:
            'Escalar worker e/ou reduzir concorrência; verificar gargalos (PDF/DB) e DLQ.',
          runbook: 'backend/OPERATIONS_RUNBOOK.md',
        });
      }

      if ((mailStats.wait || 0) > threshold) {
        this.logger.warn({
          alert: 'QUEUE_WAITING_HIGH',
          queue: 'mail',
          waiting: mailStats.wait || 0,
          threshold,
          action:
            'Escalar worker e/ou reduzir concorrência; verificar provedor de e-mail e DLQ.',
          runbook: 'backend/OPERATIONS_RUNBOOK.md',
        });
      }

      if ((pdfDlqStats.wait || 0) > 0) {
        this.logger.warn({
          alert: 'DLQ_NOT_EMPTY',
          queue: 'pdf-generation-dlq',
          waiting: pdfDlqStats.wait || 0,
          action:
            'Inspecionar jobs no Bull Board, corrigir causa raiz e reprocessar manualmente se necessário.',
          runbook: 'backend/OPERATIONS_RUNBOOK.md',
        });
      }

      if ((mailDlqStats.wait || 0) > 0) {
        this.logger.warn({
          alert: 'DLQ_NOT_EMPTY',
          queue: 'mail-dlq',
          waiting: mailDlqStats.wait || 0,
          action:
            'Inspecionar jobs no Bull Board, corrigir causa raiz e reprocessar manualmente se necessário.',
          runbook: 'backend/OPERATIONS_RUNBOOK.md',
        });
      }
    } catch (error) {
      this.logger.error('Erro ao monitorar filas:', error);
    }
  }

  async getQueueStats() {
    const pdfStats = await this.pdfQueue.getJobCounts(
      'active',
      'wait',
      'completed',
      'failed',
    );
    const mailStats = await this.mailQueue.getJobCounts(
      'active',
      'wait',
      'completed',
      'failed',
    );
    const pdfDlqStats = await this.pdfDlqQueue.getJobCounts('wait', 'failed');
    const mailDlqStats = await this.mailDlqQueue.getJobCounts('wait', 'failed');

    return {
      pdf: {
        active: pdfStats.active || 0,
        waiting: pdfStats.wait || 0,
        completed: pdfStats.completed || 0,
        failed: pdfStats.failed || 0,
        total: Object.values(pdfStats).reduce(
          (a: number, b: number) => a + b,
          0,
        ),
      },
      mail: {
        active: mailStats.active || 0,
        waiting: mailStats.wait || 0,
        completed: mailStats.completed || 0,
        failed: mailStats.failed || 0,
        total: Object.values(mailStats).reduce(
          (a: number, b: number) => a + b,
          0,
        ),
      },
      dlq: {
        pdf: {
          waiting: pdfDlqStats.wait || 0,
          failed: pdfDlqStats.failed || 0,
        },
        mail: {
          waiting: mailDlqStats.wait || 0,
          failed: mailDlqStats.failed || 0,
        },
      },
    };
  }
}
