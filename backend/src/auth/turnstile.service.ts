import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface TurnstileVerifyResponse {
  success: boolean;
  action?: string;
  hostname?: string;
  'error-codes'?: string[];
}

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);
  private readonly verifyUrl =
    'https://challenges.cloudflare.com/turnstile/v0/siteverify';

  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    return (
      /^true$/i.test(this.configService.get<string>('TURNSTILE_ENABLED', 'false')) &&
      this.getSecretKey().length > 0
    );
  }

  async assertHuman(
    token: string | undefined,
    options?: { remoteIp?: string | null; expectedAction?: string },
  ): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    if (!token?.trim()) {
      throw new BadRequestException(
        'Confirme a verificação de segurança antes de entrar.',
      );
    }

    const payload = new URLSearchParams({
      secret: this.getSecretKey(),
      response: token.trim(),
    });

    if (options?.remoteIp?.trim()) {
      payload.set('remoteip', options.remoteIp.trim());
    }

    let verification: TurnstileVerifyResponse;
    try {
      const response = await axios.post<TurnstileVerifyResponse>(
        this.verifyUrl,
        payload.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: this.configService.get<number>(
            'TURNSTILE_VERIFY_TIMEOUT_MS',
            5000,
          ),
        },
      );
      verification = response.data;
    } catch (error) {
      this.logger.error({
        event: 'turnstile_verification_unavailable',
        message: error instanceof Error ? error.message : String(error),
      });
      throw new BadGatewayException(
        'Não foi possível validar a proteção anti-bot. Tente novamente em instantes.',
      );
    }

    if (!verification.success) {
      this.logger.warn({
        event: 'turnstile_verification_failed',
        errors: verification['error-codes'] || [],
        hostname: verification.hostname,
        action: verification.action,
      });
      throw new ForbiddenException(
        'Validação de segurança inválida. Atualize a página e tente novamente.',
      );
    }

    if (
      options?.expectedAction &&
      verification.action &&
      verification.action !== options.expectedAction
    ) {
      this.logger.warn({
        event: 'turnstile_action_mismatch',
        expectedAction: options.expectedAction,
        receivedAction: verification.action,
      });
      throw new ForbiddenException(
        'Validação de segurança inválida. Atualize a página e tente novamente.',
      );
    }

    const expectedHostname = this.getExpectedHostname();
    if (
      expectedHostname &&
      verification.hostname &&
      verification.hostname !== expectedHostname
    ) {
      this.logger.warn({
        event: 'turnstile_hostname_mismatch',
        expectedHostname,
        receivedHostname: verification.hostname,
      });
      throw new ForbiddenException(
        'Validação de segurança inválida. Atualize a página e tente novamente.',
      );
    }
  }

  private getSecretKey(): string {
    return this.configService.get<string>('TURNSTILE_SECRET_KEY', '').trim();
  }

  private getExpectedHostname(): string | null {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', '').trim();
    if (!frontendUrl) {
      return null;
    }

    try {
      return new URL(frontendUrl).hostname;
    } catch {
      return null;
    }
  }
}
