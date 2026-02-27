import { Injectable, Logger, BadRequestException } from '@nestjs/common';

const MAX_PDF_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_EMAIL_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB
const MIN_PDF_SIZE = 100; // 100 bytes

@Injectable()
export class PdfValidatorService {
  private readonly logger = new Logger(PdfValidatorService.name);

  validatePdfBuffer(
    buffer: Buffer,
    context: 'generation' | 'email' | 'sign' = 'generation',
  ): void {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new BadRequestException('Buffer inválido');
    }

    if (buffer.length < MIN_PDF_SIZE) {
      throw new BadRequestException('PDF muito pequeno (< 100 bytes)');
    }

    const maxSize =
      context === 'email' ? MAX_EMAIL_ATTACHMENT_SIZE : MAX_PDF_SIZE;

    if (buffer.length > maxSize) {
      const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
      const maxMB = (maxSize / 1024 / 1024).toFixed(2);
      throw new BadRequestException(
        `PDF muito grande: ${sizeMB}MB (máximo: ${maxMB}MB)`,
      );
    }

    // Validar magic number do PDF (%PDF-)
    // Verifica os primeiros 5 bytes para garantir que é um PDF válido
    const header = buffer.subarray(0, 5).toString('ascii');
    if (!header.startsWith('%PDF-')) {
      this.logger.warn(
        `Cabeçalho inválido detectado: ${header.substring(0, 10)}...`,
      );
      throw new BadRequestException(
        'Arquivo inválido: Cabeçalho PDF não encontrado (%PDF-)',
      );
    }

    // Validar EOF (End of File)
    // Verifica se o marcador %%EOF existe nos últimos 1024 bytes
    const tail = buffer
      .subarray(Math.max(0, buffer.length - 1024))
      .toString('ascii');
    if (!tail.includes('%%EOF')) {
      this.logger.warn(
        'PDF pode estar incompleto ou corrompido (sem marcador %%EOF)',
      );
    }

    // Verificação de segurança: Conteúdo malicioso
    if (this.hasSuspiciousContent(buffer)) {
      throw new BadRequestException(
        'PDF rejeitado: Contém scripts ou ações automáticas não permitidas (/JavaScript, /Launch, etc).',
      );
    }

    this.logger.log(
      `PDF validado: ${(buffer.length / 1024).toFixed(2)}KB (contexto: ${context})`,
    );
  }

  private hasSuspiciousContent(buffer: Buffer): boolean {
    // Keywords que indicam scripts ou ações automáticas que podem ser maliciosas
    const suspiciousKeywords = [
      '/JavaScript',
      '/JS',
      '/Launch',
      '/OpenAction',
      '/AA', // Additional Actions
    ];

    for (const keyword of suspiciousKeywords) {
      if (buffer.includes(keyword)) {
        this.logger.warn(`PDF contém conteúdo suspeito: ${keyword}`);
        return true;
      }
    }
    return false;
  }

  validateHtmlContent(html: string): void {
    if (!html || typeof html !== 'string') {
      throw new BadRequestException('HTML inválido');
    }

    if (html.length === 0) {
      throw new BadRequestException('HTML vazio');
    }

    if (html.length > 10 * 1024 * 1024) {
      throw new BadRequestException('HTML muito grande (> 10MB)');
    }

    // Validar tags HTML básicas
    if (!html.includes('<html') && !html.includes('<HTML')) {
      this.logger.warn('HTML não contém tag <html>');
    }

    this.logger.log(`HTML validado: ${(html.length / 1024).toFixed(2)}KB`);
  }

  validateEmailAttachment(
    filename: string,
    buffer: Buffer,
  ): { valid: boolean; message?: string } {
    try {
      // Validar nome do arquivo
      if (!filename || filename.length === 0) {
        return { valid: false, message: 'Nome do arquivo vazio' };
      }

      if (filename.length > 255) {
        return { valid: false, message: 'Nome do arquivo muito longo' };
      }

      // Validar caracteres perigosos
      if (/[<>:"|?*]/.test(filename)) {
        return {
          valid: false,
          message: 'Nome do arquivo contém caracteres inválidos',
        };
      }

      // Validar extensão
      if (!filename.toLowerCase().endsWith('.pdf')) {
        return { valid: false, message: 'Arquivo deve ser PDF' };
      }

      // Reutiliza a validação robusta de buffer (tamanho, estrutura e segurança)
      this.validatePdfBuffer(buffer, 'email');

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        message:
          error instanceof Error
            ? error.message
            : 'Erro desconhecido na validação do anexo',
      };
    }
  }

  getFileSizeCategory(buffer: Buffer): 'small' | 'medium' | 'large' {
    const sizeMB = buffer.length / 1024 / 1024;
    if (sizeMB < 1) return 'small';
    if (sizeMB < 5) return 'medium';
    return 'large';
  }
}
