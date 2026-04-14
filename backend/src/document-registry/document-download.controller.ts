import {
  Controller,
  Get,
  Header,
  Param,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { DocumentDownloadGrantService } from '../common/services/document-download-grant.service';
import { DocumentStorageService } from '../common/services/document-storage.service';

@Controller('storage')
export class DocumentDownloadController {
  constructor(
    private readonly documentDownloadGrantService: DocumentDownloadGrantService,
    private readonly documentStorageService: DocumentStorageService,
  ) {}

  @Public()
  @Get('download/:token')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('X-Content-Type-Options', 'nosniff')
  async downloadDocument(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const grant = await this.documentDownloadGrantService.consumeToken(token);

    let buffer: Buffer;
    try {
      buffer = await this.documentStorageService.downloadFileBuffer(grant.file_key);
    } catch {
      throw new ServiceUnavailableException(
        'Documento indisponível temporariamente no storage governado.',
      );
    }

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
