import {
  Injectable,
  NestMiddleware,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { getRequestIp } from '../utils/request-ip.util';
import { isIP } from 'node:net';

type AllowlistEntry =
  | { kind: 'exact'; value: string }
  | { kind: 'ipv4-cidr'; network: number; mask: number }
  | { kind: 'legacy-prefix'; value: string };

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
 *   - Em produção, configure ADMIN_IP_ALLOWLIST_REQUIRED=true para falhar fechado
 *     quando ADMIN_IP_ALLOWLIST estiver ausente.
 *   - Se configurado, apenas IPs da lista passam. IPs não reconhecidos recebem 403.
 *   - Erros internos falham fechado quando ADMIN_IP_ALLOWLIST_REQUIRED=true.
 */
@Injectable()
export class AdminIpAllowlistMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AdminIpAllowlistMiddleware.name);
  private readonly allowedEntries: AllowlistEntry[];
  private readonly enabled: boolean;
  private readonly required: boolean;

  constructor(private readonly configService: ConfigService) {
    const raw = this.configService.get<string>('ADMIN_IP_ALLOWLIST') || '';
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const requiredRaw = this.configService.get<string>(
      'ADMIN_IP_ALLOWLIST_REQUIRED',
    );
    this.allowedEntries = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => this.parseEntry(entry))
      .filter((entry): entry is AllowlistEntry => entry !== null);
    this.enabled = this.allowedEntries.length > 0;
    this.required =
      requiredRaw === undefined ? isProduction : parseBooleanFlag(requiredRaw);

    if (this.enabled) {
      this.logger.log({
        event: 'admin_ip_allowlist_enabled',
        entries: this.allowedEntries.length,
      });
    } else if (this.required) {
      this.logger.error(
        'ADMIN_IP_ALLOWLIST_REQUIRED=true, mas ADMIN_IP_ALLOWLIST não foi configurado — rotas /admin/* serão bloqueadas',
      );
    } else {
      this.logger.warn(
        'ADMIN_IP_ALLOWLIST não configurado — rotas /admin/* acessíveis de qualquer IP',
      );
    }
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    if (!this.enabled) {
      if (this.required) {
        this.logger.error({
          event: 'admin_ip_allowlist_missing',
          severity: 'CRITICAL',
          path: req.path,
          method: req.method,
        });
        throw new ForbiddenException(
          'Acesso administrativo bloqueado: allowlist de IP não configurada.',
        );
      }
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
      if (this.required) {
        throw new ForbiddenException(
          'Acesso administrativo bloqueado por falha na allowlist de IP.',
        );
      }
      next();
    }
  }

  /**
   * Verifica se o IP está na lista de permitidos. Suporta IP exato, CIDR IPv4
   * e prefixo legado apenas quando a entrada termina em ponto (ex.: "10.0.").
   */
  private isAllowed(ip: string): boolean {
    if (!ip) {
      return false;
    }
    const normalized = ip.replace(/^::ffff:/, '');
    const ipv4 = ipv4ToNumber(normalized);

    return this.allowedEntries.some((entry) => {
      if (entry.kind === 'exact') {
        return normalized === entry.value;
      }

      if (entry.kind === 'legacy-prefix') {
        return normalized.startsWith(entry.value);
      }

      return ipv4 !== null && (ipv4 & entry.mask) === entry.network;
    });
  }

  private parseEntry(rawEntry: string): AllowlistEntry | null {
    const entry = rawEntry.trim().replace(/^::ffff:/, '');
    if (!entry) {
      return null;
    }

    if (entry.includes('/')) {
      const [address, prefixRaw] = entry.split('/');
      const prefix = Number(prefixRaw);
      const addressNumber = ipv4ToNumber(address);
      if (
        addressNumber === null ||
        !Number.isInteger(prefix) ||
        prefix < 0 ||
        prefix > 32
      ) {
        this.logger.warn({
          event: 'admin_ip_allowlist_invalid_entry',
          entry,
        });
        return null;
      }

      const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
      return {
        kind: 'ipv4-cidr',
        network: addressNumber & mask,
        mask,
      };
    }

    if (entry.endsWith('.') && /^[0-9.]+$/.test(entry)) {
      return { kind: 'legacy-prefix', value: entry };
    }

    if (isIP(entry)) {
      return { kind: 'exact', value: entry };
    }

    this.logger.warn({
      event: 'admin_ip_allowlist_invalid_entry',
      entry,
    });
    return null;
  }
}

function ipv4ToNumber(value: string | undefined): number | null {
  if (!value || isIP(value) !== 4) {
    return null;
  }

  const octets = value.split('.').map((part) => Number(part));
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }

  return (
    ((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]
  );
}

function parseBooleanFlag(value: string | boolean | undefined): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  return /^true$/i.test(String(value ?? '').trim());
}
