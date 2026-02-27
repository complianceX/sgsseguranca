import { Injectable, Logger } from '@nestjs/common';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

@Injectable()
export class PdfCompressionService {
  private readonly logger = new Logger(PdfCompressionService.name);

  async compress(buffer: Buffer): Promise<Buffer> {
    try {
      const originalSize = buffer.length;
      const compressed = await gzip(buffer, { level: 9 });
      const compressedSize = compressed.length;
      const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(2);

      this.logger.log(
        `PDF comprimido: ${(originalSize / 1024 / 1024).toFixed(2)}MB → ${(compressedSize / 1024 / 1024).toFixed(2)}MB (${ratio}% redução)`,
      );

      return compressed;
    } catch (error) {
      this.logger.error('Erro ao comprimir PDF:', error);
      // Retornar buffer original se falhar
      return buffer;
    }
  }

  async decompress(buffer: Buffer): Promise<Buffer> {
    try {
      return await gunzip(buffer);
    } catch (error) {
      this.logger.error('Erro ao descomprimir PDF:', error);
      // Retornar buffer original se falhar
      return buffer;
    }
  }

  isCompressed(buffer: Buffer): boolean {
    // Verificar magic number do gzip (1f 8b)
    return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  }
}
