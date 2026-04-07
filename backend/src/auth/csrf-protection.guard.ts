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
    private readonly reportOnlyLogWindowMs = 60_000;
    private readonly reportOnlyLogByRoute = new Map<string, number>();

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
                this.logReportOnlyEvent('missing', request.path);
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
                this.logReportOnlyEvent('invalid', request.path);
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

    private logReportOnlyEvent(kind: 'missing' | 'invalid', path: string): void {
        const normalizedPath = this.normalizePathForLog(path);
        if (this.shouldSkipReportOnlyPath(normalizedPath)) {
            return;
        }

        const key = `${kind}:${normalizedPath}`;
        const now = Date.now();
        const previous = this.reportOnlyLogByRoute.get(key) ?? 0;
        if (now - previous < this.reportOnlyLogWindowMs) {
            return;
        }

        this.reportOnlyLogByRoute.set(key, now);
        this.logger.warn(
            `CSRF token ${kind} (report-only): ${normalizedPath}`,
        );
    }

    private normalizePathForLog(path: unknown): string {
        const value = String(path || '').trim();
        if (!value) {
            return '/';
        }

        return value
            .replace(
                /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
                ':id',
            )
            .replace(/\/\d+\b/g, '/:id');
    }

    private shouldSkipReportOnlyPath(path: string): boolean {
        return (
            path === '/health/public' ||
            path === '/health' ||
            path.startsWith('/health/') ||
            path === '/metrics'
        );
    }
}
