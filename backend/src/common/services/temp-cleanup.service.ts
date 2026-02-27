import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class TempCleanupService implements OnModuleInit {
  private readonly logger = new Logger(TempCleanupService.name);
  private readonly tempDir = path.join(process.cwd(), 'temp');
  private readonly maxAge = 24 * 60 * 60 * 1000; // 24 horas

  async onModuleInit() {
    this.logger.log('🧹 Iniciando serviço de limpeza de arquivos temporários');

    // Criar diretório temp se não existir
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
      this.logger.log(`📁 Diretório temp criado: ${this.tempDir}`);
    }

    // Executar limpeza inicial
    await this.cleanupOldFiles();

    // Execução periódica será feita via @Cron
  }

  // SECURITY: execução agendada e controlada para limpeza segura de arquivos temporários
  @Cron(CronExpression.EVERY_6_HOURS)
  private async runCleanup() {
    await this.cleanupOldFiles();
  }

  private async cleanupOldFiles() {
    try {
      const now = Date.now();
      let deletedCount = 0;
      let totalSize = 0;

      if (!fs.existsSync(this.tempDir)) {
        return;
      }

      const files = fs.readdirSync(this.tempDir);

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtimeMs > this.maxAge) {
          try {
            const fileSize = stats.size;
            fs.unlinkSync(filePath);
            deletedCount++;
            totalSize += fileSize;
            this.logger.debug(
              `🗑️ Deletado: ${file} (${(fileSize / 1024).toFixed(2)}KB)`,
            );
          } catch (error) {
            this.logger.error(`Erro ao deletar ${file}:`, error);
          }
        }
      }

      if (deletedCount > 0) {
        this.logger.log(
          `✅ Limpeza concluída: ${deletedCount} arquivos deletados (${(totalSize / 1024 / 1024).toFixed(2)}MB liberados)`,
        );
      }
    } catch (error) {
      this.logger.error('Erro ao limpar arquivos temporários:', error);
    }
  }

  async getTempDirStats() {
    try {
      if (!fs.existsSync(this.tempDir)) {
        return {
          fileCount: 0,
          totalSize: 0,
          oldestFile: null,
          newestFile: null,
        };
      }

      const files = fs.readdirSync(this.tempDir);
      let totalSize = 0;
      let oldestTime = Date.now();
      let newestTime = 0;
      let oldestFile: string | null = null;
      let newestFile: string | null = null;

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;

        if (stats.mtimeMs < oldestTime) {
          oldestTime = stats.mtimeMs;
          oldestFile = file;
        }

        if (stats.mtimeMs > newestTime) {
          newestTime = stats.mtimeMs;
          newestFile = file;
        }
      }

      return {
        fileCount: files.length,
        totalSize,
        oldestFile: oldestFile
          ? { name: oldestFile, age: Date.now() - oldestTime }
          : null,
        newestFile: newestFile
          ? { name: newestFile, age: Date.now() - newestTime }
          : null,
      };
    } catch (error) {
      this.logger.error('Erro ao obter stats do temp dir:', error);
      return null;
    }
  }
}
