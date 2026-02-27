import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { MailService } from './mail.service';

@Processor('mail')
export class MailProcessor {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mailService: MailService) {}

  @Process('send-document')
  async handleSendDocument(
    job: Job<{
      documentId: string;
      documentType: string;
      email: string;
      companyId?: string;
    }>,
  ) {
    const { documentId, documentType, email, companyId } = job.data;
    this.logger.log(
      `[Job ${job.id}] Processando envio de documento: ${documentType} para ${email}`,
    );

    try {
      await this.mailService.sendStoredDocument(
        documentId,
        documentType,
        email,
        companyId,
      );
      this.logger.log(`[Job ${job.id}] E-mail enviado com sucesso.`);
    } catch (error) {
      this.logger.error(
        `[Job ${job.id}] Falha ao enviar e-mail: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Lançar o erro faz com que o Bull acione o mecanismo de retry (attempts: 3)
      throw error;
    }
  }

  @Process('send-file-key')
  async handleSendFileKey(
    job: Job<{
      fileKey: string;
      email: string;
      subject?: string;
      docName?: string;
      expiresInSeconds?: number;
    }>,
  ) {
    const { fileKey, email, subject, docName, expiresInSeconds } = job.data;
    this.logger.log(
      `[Job ${job.id}] Processando envio de arquivo: ${fileKey} para ${email}`,
    );

    try {
      await this.mailService.sendStoredFileKey(fileKey, email, {
        subject,
        docName,
        expiresInSeconds,
      });
      this.logger.log(`[Job ${job.id}] E-mail enviado com sucesso.`);
    } catch (error) {
      this.logger.error(
        `[Job ${job.id}] Falha ao enviar e-mail: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `[Job ${job.id}] Falhou definitivamente após todas as tentativas. Tipo: ${job.name}. Erro: ${error.message}`,
      error.stack,
    );
  }
}
