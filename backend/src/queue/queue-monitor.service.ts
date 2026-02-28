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
        });
      }

      if ((mailStats.wait || 0) > threshold) {
        this.logger.warn({
          alert: 'QUEUE_WAITING_HIGH',
          queue: 'mail',
          waiting: mailStats.wait || 0,
          threshold,
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
    };
  }
}
