import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Serviço de CSRF Protection
 * Valida tokens CSRF em operações sensíveis (POST, PUT, DELETE)
 */
@Injectable()
export class CsrfProtectionService {
    private readonly tokenSecret: string;
    private readonly enabled: boolean;
    private readonly reportOnly: boolean;

    constructor(private readonly configService: ConfigService) {
        this.enabled = this.configService.get<boolean>('REFRESH_CSRF_ENFORCED', false);
        this.reportOnly = this.configService.get<boolean>('REFRESH_CSRF_REPORT_ONLY', true);
        this.tokenSecret =
            this.configService.get<string>('CSRF_TOKEN_SECRET') ??
            this.configService.get<string>('JWT_SECRET') ??
            'default-csrf-secret-change-in-production';
    }

    /**
     * Gerar novo token CSRF
     * Para ser colocado em forms ou headers
     */
    generateToken(sessionId: string): string {
        const timestamp = Date.now();
        const random = crypto.randomBytes(32).toString('hex');
        const data = `${sessionId}:${timestamp}:${random}`;

        const signature = crypto
            .createHmac('sha256', this.tokenSecret)
            .update(data)
            .digest('hex');

        return `${Buffer.from(data).toString('base64')}.${signature}`;
    }

    /**
     * Validar token CSRF
     */
    validateToken(token: string, sessionId: string): boolean {
        try {
            const [encodedData, signature] = token.split('.');

            if (!encodedData || !signature) {
                return false;
            }

            const data = Buffer.from(encodedData, 'base64').toString();
            const [tokenSessionId] = data.split(':');

            // Verificar se a sessão é a mesma
            if (tokenSessionId !== sessionId) {
                return false;
            }

            // Verificar assinatura
            const expectedSignature = crypto
                .createHmac('sha256', this.tokenSecret)
                .update(data)
                .digest('hex');

            return signature === expectedSignature;
        } catch (error) {
            return false;
        }
    }

    /**
     * Verificar se CSRF está habilitado
     */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Verificar se estamos em report-only (não bloqueia, apenas loga)
     */
    isReportOnly(): boolean {
        return this.reportOnly;
    }
}
