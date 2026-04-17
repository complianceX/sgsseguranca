import {
  Injectable,
  NestMiddleware,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { getRequestIp } from '../utils/request-ip.util';

/**
 * Middleware de IP allowlist para rotas /admin/*.
 *
 * Configuração via env:
 *   ADMIN_IP_ALLOWLIST=<ip1>,<ip2>,<cidr/prefix>,...
 *
 * Exemplos de valores aceitos:
 *   - IPs exatos:   192.168.1.10, ::1, 10.0.0.5
 *   - Prefixo CIDR simplificado: 10.0., 192.168.1.
 *
 * Comportamento:
 *   - Se ADMIN_IP_ALLOWLIST não estiver configurado (vazio ou ausente), o middleware
 *     é transparente (não bloqueia nada). Isso permite deploy incremental.
 *   - Se configurado, apenas IPs da lista passam. IPs não reconhecidos recebem 403.
 *   - Erros internos do middleware NÃO bloqueiam o acesso (fail-open para allowlist)
 *     para evitar lock-out acidental de admins. O erro é logado como crítico.
 */
@Injectable()
export class AdminIpAllowlistMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AdminIpAllowlistMiddleware.name);
  private readonly allowedEntries: string[];
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const raw = this.configService.get<string>('ADMIN_IP_ALLOWLIST') || '';
    this.allowedEntries = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    this.enabled = this.allowedEntries.length > 0;

    if (this.enabled) {
      this.logger.log(
        `Admin IP allowlist ativa com ${this.allowedEntries.length} entrada(s)`,
      );
    } else {
      this.logger.warn(
        'ADMIN_IP_ALLOWLIST não configurado — rotas /admin/* acessíveis de qualquer IP',
      );
    }
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    if (!this.enabled) {
      next();
      return;
    }

    try {
      const ip = getRequestIp(req) || '';
      const normalized = ip.replace(/^::ffff:/, ''); // normaliza IPv4-mapped IPv6

      if (this.isAllowed(normalized)) {
        next();
        return;
      }

      this.logger.warn({
        event: 'admin_ip_blocked',
        severity: 'HIGH',
        ip: normalized,
        path: req.path,
        method: req.method,
      });

      throw new ForbiddenException('Acesso ao painel administrativo negado');
    } catch (err) {
      if (err instanceof ForbiddenException) {
        throw err;
      }
      // Fail-open para evitar lock-out acidental — loga como CRITICAL
      this.logger.error({
        event: 'admin_ip_allowlist_error',
        severity: 'CRITICAL',
        message: err instanceof Error ? err.message : String(err),
      });
      next();
    }
  }

  /**
   * Verifica se o IP está na lista de permitidos.
   * Suporta:
   *   - Correspondência exata (ex: "192.168.1.10")
   *   - Prefixo de string (ex: "10.0." cobre 10.0.0.0/16)
   */
  private isAllowed(ip: string): boolean {
    if (!ip) {
      return false;
    }
    return this.allowedEntries.some(
      (entry) => ip === entry || ip.startsWith(entry),
    );
  }
}
