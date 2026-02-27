import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class QueueMonitorService {
  private readonly logger = new Logger(QueueMonitorService.name);

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
      const pdfStats = await this.pdfQueue.getJobCounts();
      const mailStats = await this.mailQueue.getJobCounts();

      const pdfTotal = Object.values(pdfStats).reduce(
        (a: number, b: number) => a + b,
        0,
      );
      const mailTotal = Object.values(mailStats).reduce(
        (a: number, b: number) => a + b,
        0,
      );

      this.logger.log(
        `📊 FILA PDF: ${pdfStats.active || 0} ativo, ${pdfStats.waiting || 0} aguardando, ${pdfStats.completed || 0} completo, ${pdfStats.failed || 0} falhou (Total: ${pdfTotal})`,
      );

      this.logger.log(
        `📧 FILA MAIL: ${mailStats.active || 0} ativo, ${mailStats.waiting || 0} aguardando, ${mailStats.completed || 0} completo, ${mailStats.failed || 0} falhou (Total: ${mailTotal})`,
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

      if ((pdfStats.waiting || 0) > 20) {
        this.logger.warn(
          `⚠️ ALERTA: ${pdfStats.waiting} jobs de PDF aguardando (possível gargalo)!`,
        );
      }

      if ((mailStats.waiting || 0) > 20) {
        this.logger.warn(
          `⚠️ ALERTA: ${mailStats.waiting} jobs de email aguardando (possível gargalo)!`,
        );
      }
    } catch (error) {
      this.logger.error('Erro ao monitorar filas:', error);
    }
  }

  async getQueueStats() {
    const pdfStats = await this.pdfQueue.getJobCounts();
    const mailStats = await this.mailQueue.getJobCounts();

    return {
      pdf: {
        active: pdfStats.active || 0,
        waiting: pdfStats.waiting || 0,
        completed: pdfStats.completed || 0,
        failed: pdfStats.failed || 0,
        total: Object.values(pdfStats).reduce(
          (a: number, b: number) => a + b,
          0,
        ),
      },
      mail: {
        active: mailStats.active || 0,
        waiting: mailStats.waiting || 0,
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
