import { Injectable, CanActivate, ExecutionContext, BadRequestException, Logger } from '@nestjs/common';
import { CsrfProtectionService } from './csrf-protection.service';

/**
 * Guard de CSRF Protection
 * Use em rotas sensíveis:
 * 
 * @UseGuards(CsrfProtectionGuard)
 * @Post('auth/refresh')
 * async refresh() { ... }
 */
@Injectable()
export class CsrfProtectionGuard implements CanActivate {
    private readonly logger = new Logger(CsrfProtectionGuard.name);

    constructor(private readonly csrfService: CsrfProtectionService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();

        // Se não está habilitado, deixar passar
        if (!this.csrfService.isEnabled()) {
            return true;
        }

        // Extrair token CSRF do header ou body
        const token = this.extractToken(request);
        const sessionId = request.user?.sessionId || request.sessionID;

        if (!token || !sessionId) {
            if (this.csrfService.isReportOnly()) {
                this.logger.warn(`CSRF token missing (report-only): ${request.path}`);
                // Report-only: não bloqueia
                response.setHeader('X-CSRF-Report-Only', 'missing-token');
                return true;
            }

            throw new BadRequestException('CSRF token is required');
        }

        // Validar token
        const isValid = this.csrfService.validateToken(token, sessionId);

        if (!isValid) {
            if (this.csrfService.isReportOnly()) {
                this.logger.warn(`CSRF token invalid (report-only): ${request.path}`);
                response.setHeader('X-CSRF-Report-Only', 'invalid-token');
                return true;
            }

            throw new BadRequestException('CSRF token validation failed');
        }

        return true;
    }

    /**
     * Extrair token dos headers ou body
     * Prioridade: X-CSRF-Token header > x-csrf-token header > _csrf body
     */
    private extractToken(request: any): string | null {
        return (
            request.headers['x-csrf-token'] ||
            request.headers['x-xsrf-token'] ||
            request.body?._csrf ||
            request.query?._csrf ||
            null
        );
    }
}
