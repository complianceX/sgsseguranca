import {
  Controller,
  Get,
  Header,
  Logger,
  Param,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { DocumentDownloadGrantService } from '../common/services/document-download-grant.service';
import { DocumentStorageService } from '../common/services/document-storage.service';
import {
  SecurityAuditService,
} from '../common/security/security-audit.service';

@Controller('storage')
export class DocumentDownloadController {
  private readonly logger = new Logger(DocumentDownloadController.name);

  constructor(
    private readonly documentDownloadGrantService: DocumentDownloadGrantService,
    private readonly documentStorageService: DocumentStorageService,
    private readonly securityAudit: SecurityAuditService,
  ) {}

  @Public()
  @Get('download/:token')
  // 20 downloads por minuto por IP: suficiente para usuário legítimo,
  // impossibilita enumeração automática de tokens.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('X-Content-Type-Options', 'nosniff')
  async downloadDocument(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ip = req.ip ?? req.socket?.remoteAddress;

    let grant: Awaited<ReturnType<DocumentDownloadGrantService['consumeToken']>>;
    try {
      grant = await this.documentDownloadGrantService.consumeToken(token);
    } catch (err) {
      // Token inválido, expirado ou já consumido — registra tentativa suspeita.
      // Token de apenas 20 chars para evitar log de tokens válidos acidentalmente.
      this.securityAudit.bruteForceBlocked(ip, `token_prefix:${token.substring(0, 20)}`);
      throw err;
    }

    let buffer: Buffer;
    try {
      buffer = await this.documentStorageService.downloadFileBuffer(grant.file_key);
    } catch {
      throw new ServiceUnavailableException(
        'Documento indisponível temporariamente no storage governado.',
      );
    }

    // Trilha forense: qualquer download de documento governado é evento WARNING.
    this.securityAudit.sensitiveDownload(
      grant.issued_for_user_id ?? 'anonymous',
      'document-registry',
      grant.id,
      'PDF',
    );

    const filename =
      this.sanitizeFilename(grant.original_name) ||
      grant.file_key.split('/').pop() ||
      'documento.pdf';

    res.setHeader('Content-Type', grant.content_type || 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"`,
    );
    res.send(buffer);
  }

  private sanitizeFilename(value: string | null): string | null {
    const normalized = String(value || '').trim();
    if (!normalized) {
      return null;
    }

    return normalized.replace(/[^\w.\- ]+/g, '_');
  }
}
