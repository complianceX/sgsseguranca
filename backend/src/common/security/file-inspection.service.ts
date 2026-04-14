import {
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket, connect } from 'node:net';

export interface FileInspectionResult {
  clean: boolean;
  threat?: string;
  provider: string;
}

export interface FileInspectionProvider {
  name: string;
  inspect(buffer: Buffer, filename: string): Promise<FileInspectionResult>;
}

export const FILE_INSPECTION_PROVIDERS = 'FILE_INSPECTION_PROVIDERS';

export class ClamAvFileInspectionProvider implements FileInspectionProvider {
  readonly name = 'clamav';

  constructor(
    private readonly options: {
      host: string;
      port: number;
      timeoutMs: number;
    },
  ) {}

  async inspect(
    buffer: Buffer,
    _filename: string,
  ): Promise<FileInspectionResult> {
    const response = this.normalizeResponse(
      await this.scanWithInstream(buffer),
    );

    if (/FOUND$/i.test(response)) {
      return {
        clean: false,
        threat: this.extractThreatName(response),
        provider: this.name,
      };
    }

    if (/OK$/i.test(response)) {
      return {
        clean: true,
        provider: this.name,
      };
    }

    throw new Error(
      `clamav_unexpected_response:${response || 'empty_response'}`,
    );
  }

  private async scanWithInstream(buffer: Buffer): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const socket = connect({
        host: this.options.host,
        port: this.options.port,
      });
      const chunks: Buffer[] = [];
      let settled = false;

      const finish = (fn: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        fn();
      };

      const fail = (error: unknown) => {
        finish(() => {
          socket.destroy();
          reject(
            error instanceof Error
              ? error
              : new Error(String(error || 'clamav_connection_failed')),
          );
        });
      };

      socket.setTimeout(this.options.timeoutMs);
      socket.on('timeout', () => fail(new Error('clamav_timeout')));
      socket.on('error', (error) => fail(error));
      socket.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk));
      });
      socket.on('end', () => {
        finish(() => {
          resolve(Buffer.concat(chunks).toString('utf8'));
        });
      });

      socket.once('connect', () => {
        void this.writeBuffer(socket, buffer).catch((error) => fail(error));
      });
    });
  }

  private normalizeResponse(response: string): string {
    return response.replace(/\0+$/g, '').trim();
  }

  private async writeBuffer(socket: Socket, buffer: Buffer): Promise<void> {
    await this.writeChunk(socket, Buffer.from('zINSTREAM\0', 'utf8'));

    const maxChunkSize = 64 * 1024;
    for (let offset = 0; offset < buffer.length; offset += maxChunkSize) {
      const chunk = buffer.subarray(offset, offset + maxChunkSize);
      const sizeBuffer = Buffer.alloc(4);
      sizeBuffer.writeUInt32BE(chunk.length, 0);
      await this.writeChunk(socket, sizeBuffer);
      await this.writeChunk(socket, chunk);
    }

    await this.writeChunk(socket, Buffer.alloc(4));
    socket.end();
  }

  private async writeChunk(socket: Socket, chunk: Buffer): Promise<void> {
    const flushed = socket.write(chunk);
    if (flushed) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const onDrain = () => {
        socket.off('error', onError);
        resolve();
      };
      const onError = (error: Error) => {
        socket.off('drain', onDrain);
        reject(error);
      };

      socket.once('drain', onDrain);
      socket.once('error', onError);
    });
  }

  private extractThreatName(response: string): string {
    const match = response.match(/:\s(.+)\sFOUND$/i);
    return match?.[1]?.trim() || 'unknown_threat';
  }
}

@Injectable()
export class FileInspectionService {
  private readonly logger = new Logger(FileInspectionService.name);
  private readonly isProduction: boolean;
  private readonly providerSlug: string | undefined;
  private readonly providersByName: Map<string, FileInspectionProvider>;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(FILE_INSPECTION_PROVIDERS)
    providers: FileInspectionProvider[] = [],
  ) {
    this.isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    this.providerSlug = this.configService
      .get<string>('ANTIVIRUS_PROVIDER')
      ?.trim()
      .toLowerCase();
    this.providersByName = new Map(
      providers.map((provider) => [provider.name.toLowerCase(), provider]),
    );
  }

  async inspect(
    buffer: Buffer,
    filename: string,
  ): Promise<FileInspectionResult> {
    if (!this.providerSlug) {
      return this.handleNoProvider(filename);
    }

    const provider = this.providersByName.get(this.providerSlug);
    if (!provider) {
      return this.handleProviderMisconfigured(filename);
    }

    try {
      const result = await provider.inspect(buffer, filename);
      if (!result.clean) {
        this.rejectThreat(filename, result.threat || 'unknown_threat');
      }

      return result;
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        throw error;
      }

      this.logger.error({
        event: 'file_inspection_provider_unavailable',
        severity: 'CRITICAL',
        filename,
        provider: provider.name,
        message: error instanceof Error ? error.message : String(error),
      });
      throw new ServiceUnavailableException(
        `Inspeção de arquivo indisponível no provedor ${provider.name}. Operação bloqueada até restauração do serviço de AV/CDR.`,
      );
    }
  }

  rejectThreat(filename: string, threat: string): never {
    this.logger.error({
      event: 'file_inspection_threat_detected',
      severity: 'HIGH',
      filename,
      threat,
    });
    throw new UnprocessableEntityException(
      `Arquivo rejeitado: ameaça detectada (${threat}). O upload foi descartado.`,
    );
  }

  private handleNoProvider(filename: string): FileInspectionResult {
    if (this.isProduction) {
      this.logger.error({
        event: 'file_inspection_provider_missing',
        severity: 'CRITICAL',
        filename,
        message:
          'Nenhum provedor de AV/CDR configurado. Produção não pode promover arquivos sem ANTIVIRUS_PROVIDER real.',
      });
      throw new ServiceUnavailableException(
        'Inspeção de arquivo indisponível. Produção exige ANTIVIRUS_PROVIDER real antes da promoção de arquivos.',
      );
    }

    this.logger.warn(
      `[FileInspection] ANTIVIRUS_PROVIDER não configurado. Arquivo "${filename}" aprovado sem inspeção apenas fora de produção.`,
    );
    return { clean: true, provider: 'none' };
  }

  private handleProviderMisconfigured(filename: string): FileInspectionResult {
    if (this.isProduction) {
      this.logger.error({
        event: 'file_inspection_provider_misconfigured',
        severity: 'CRITICAL',
        filename,
        provider: this.providerSlug,
      });
      throw new ServiceUnavailableException(
        `ANTIVIRUS_PROVIDER=${this.providerSlug} não possui provider válido carregado. Produção permanece bloqueada.`,
      );
    }

    this.logger.warn(
      `[FileInspection] Provider "${this.providerSlug}" não carregado. Aprovação sem inspeção liberada apenas fora de produção.`,
    );
    return { clean: true, provider: 'none' };
  }
}
