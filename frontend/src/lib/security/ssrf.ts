import { createHash, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';

const PRIVATE_RANGES = [
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },
  { start: '127.0.0.0', end: '127.255.255.255' },
  { start: '0.0.0.0', end: '0.255.255.255' },
  { start: '169.254.0.0', end: '169.254.255.255' },
];

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isPrivateIPv4(hostname: string): boolean {
  if (isIP(hostname) !== 4) return false;
  const ipInt = ipToInt(hostname);
  return PRIVATE_RANGES.some(({ start, end }) => {
    const startInt = ipToInt(start);
    const endInt = ipToInt(end);
    return ipInt >= startInt && ipInt <= endInt;
  });
}

function isPrivateIPv6(hostname: string): boolean {
  if (isIP(hostname) !== 6) return false;
  const normalized = hostname.toLowerCase().replace('[', '').replace(']', '');
  
  if (normalized === '::1' || normalized === '::') return true;
  
  const fc00 = 'fc00:0000:0000:0000:0000:0000:0000:0000';
  const fdff = 'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff';
  const fe80 = 'fe80:0000:0000:0000:0000:0000:0000:0000';
  const febf = 'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff';
  
  const padded = normalized.split(':').map(p => p.padStart(4, '0')).join(':');
  
  if (padded >= fc00 && padded <= fdff) return true;
  if (padded >= fe80 && padded <= febf) return true;
  
  return false;
}

function isPrivateIP(hostname: string): boolean {
  return isPrivateIPv4(hostname) || isPrivateIPv6(hostname);
}

const LOCAL_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  'host.docker.internal',
  'host.internal',
]);

const ALLOWED_PROXY_PATHS = [
  '/api/',
  '/auth/refresh',
  '/auth/csrf',
  '/auth/logout',
  '/auth/me',
  '/health',
  '/public/',
  '/validation/',
  '/validar',
  '/privacy-governance/',
  '/uploads/',
];

export function isAllowedProxyPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  return ALLOWED_PROXY_PATHS.some((prefix) => path.startsWith(prefix));
}

export function validateTargetUrl(targetUrl: URL): {
  valid: boolean;
  reason?: string;
} {
  const hostname = targetUrl.hostname.toLowerCase();

  if (LOCAL_HOSTNAMES.has(hostname)) {
    return { valid: false, reason: 'Resolved to localhost' };
  }

  if (isPrivateIP(hostname)) {
    return { valid: false, reason: 'Resolved to private IP range' };
  }

  const protocol = targetUrl.protocol.toLowerCase();
  if (protocol !== 'https:' && protocol !== 'http:') {
    return { valid: false, reason: `Unsupported protocol: ${protocol}` };
  }

  return { valid: true };
}

const ALLOWED_FORWARD_HEADERS = new Set([
  'content-type',
  'content-encoding',
  'accept',
  'authorization',
  'x-csrf-token',
  'x-refresh-csrf',
  'x-company-id',
  'x-idempotency-key',
  'sentry-trace',
  'baggage',
  'user-agent',
  'cache-control',
  'if-none-match',
  'if-modified-since',
]);

export function filterProxyHeaders(
  source: Headers,
  allowlist: Set<string> = ALLOWED_FORWARD_HEADERS,
): Headers {
  const filtered = new Headers();
  for (const [key, value] of source) {
    const lower = key.toLowerCase();
    if (allowlist.has(lower)) {
      filtered.set(key, value);
    }
  }
  return filtered;
}

export class TokenValidator {
  private static validTokens = new Map<string, number>();
  private static readonly MAX_TOKENS = 10000;
  private static readonly CLEANUP_INTERVAL_MS = 60_000;
  private static lastCleanup = Date.now();

  private static cleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanup < this.CLEANUP_INTERVAL_MS) return;
    this.lastCleanup = now;
    
    for (const [token, expiry] of this.validTokens) {
      if (Date.now() > expiry) {
        this.validTokens.delete(token);
      }
    }
  }

  static registerToken(prefix: string, expiryMs: number): string {
    this.cleanup();
    
    if (this.validTokens.size >= this.MAX_TOKENS) {
      // Evicção por expiração — remover o token mais antigo (menor expiry)
      let evictKey: string | undefined;
      let evictExpiry = Infinity;
      for (const [k, exp] of this.validTokens) {
        if (exp < evictExpiry) { evictExpiry = exp; evictKey = k; }
      }
      if (evictKey) this.validTokens.delete(evictKey);
    }
    
    const raw = `${prefix}-${Date.now()}-${randomBytes(16).toString('hex')}`;
    const hash = createHash('sha256').update(raw).digest('hex');
    const token = `${prefix}_${hash.slice(0, 16)}`;
    const expiry = Date.now() + expiryMs;
    
    this.validTokens.set(token, expiry);
    return token;
  }

  static validate(token: string): boolean {
    const expiry = this.validTokens.get(token);
    if (!expiry) return false;
    
    if (Date.now() > expiry) {
      this.validTokens.delete(token);
      return false;
    }
    
    return true;
  }

  static invalidate(token: string): void {
    this.validTokens.delete(token);
  }

  static clear(): void {
    this.validTokens.clear();
  }
}
