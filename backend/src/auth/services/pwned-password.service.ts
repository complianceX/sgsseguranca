import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';

/**
 * Serviço de verificação de senhas comprometidas via HaveIBeenPwned (k-anonimato).
 *
 * Protocolo k-anonimato:
 *   1. SHA-1 da senha em uppercase hex
 *   2. Envia apenas os primeiros 5 caracteres para a API (prefix)
 *   3. API retorna todos os sufixos que combinam com o prefix
 *   4. Verifica localmente se o sufixo completo está na lista
 *
 * Nenhum dado identificável da senha é enviado ao servidor externo.
 *
 * Comportamento em falha:
 *   - Se a API HIBP estiver indisponível ou lenta demais, o check é skipped
 *     (fail-open) para não bloquear fluxos legítimos de mudança de senha.
 *   - A falha é logada como WARNING para acompanhamento.
 */
@Injectable()
export class PwnedPasswordService {
  private readonly logger = new Logger(PwnedPasswordService.name);

  /** Timeout da requisição em ms. */
  private readonly timeoutMs: number;

  /** Se false, o serviço é desabilitado via HIBP_CHECK_ENABLED=false. */
  private readonly enabled: boolean;

  /** Mínimo de vezes que a senha deve aparecer em breaches para ser recusada. */
  private readonly minBreachCount = 1;

  constructor(private readonly configService: ConfigService) {
    this.enabled = !/^false$/i.test(
      this.configService.get<string>('HIBP_CHECK_ENABLED') || '',
    );
    this.timeoutMs = Number(
      this.configService.get<string>('HIBP_TIMEOUT_MS') || 4000,
    );
  }

  /**
   * Verifica se a senha aparece em vazamentos conhecidos.
   * Lança BadRequestException se comprometida.
   * Retorna silenciosamente se o check não puder ser completado.
   */
  async assertNotPwned(password: string): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const count = await this.lookupBreachCount(password);
      if (count >= this.minBreachCount) {
        this.logger.warn({
          event: 'pwned_password_rejected',
          breachCount: count,
        });
        throw new BadRequestException(
          `Esta senha foi encontrada em ${count.toLocaleString('pt-BR')} vazamento(s) de dados. ` +
            'Por segurança, escolha uma senha diferente.',
        );
      }
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      // Falha de rede ou timeout → fail-open, apenas loga
      this.logger.warn({
        event: 'hibp_check_failed',
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async lookupBreachCount(password: string): Promise<number> {
    const sha1 = createHash('sha1')
      .update(password)
      .digest('hex')
      .toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const body = await this.fetchWithTimeout(
      `https://api.pwnedpasswords.com/range/${prefix}`,
    );

    for (const line of body.split('\n')) {
      const [hashSuffix, countStr] = line.trim().split(':');
      if (hashSuffix === suffix) {
        return parseInt(countStr, 10) || 0;
      }
    }

    return 0;
  }

  private fetchWithTimeout(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const { get } = require('https') as typeof import('https');
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`HIBP request timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      const req = get(
        url,
        {
          headers: {
            'User-Agent': 'SGS-Seguranca/1.0',
            'Add-Padding': 'true',
          },
          signal: controller.signal as unknown as import('http').RequestOptions['signal'],
        },
        (res) => {
          if (res.statusCode !== 200) {
            clearTimeout(timer);
            reject(new Error(`HIBP API returned HTTP ${res.statusCode}`));
            res.resume();
            return;
          }

          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            clearTimeout(timer);
            resolve(Buffer.concat(chunks).toString('utf8'));
          });
          res.on('error', (err: Error) => {
            clearTimeout(timer);
            reject(err);
          });
        },
      );

      req.on('error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}
