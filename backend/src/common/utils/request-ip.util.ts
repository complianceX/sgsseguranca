import type { Request } from 'express';

function firstHeaderValue(value: string | string[] | undefined): string | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    const first = value.find((item) => item?.trim());
    return first?.trim() || null;
  }

  const first = value
    .split(',')
    .map((item) => item.trim())
    .find(Boolean);

  return first || null;
}

export function getRequestIp(request: Request): string | null {
  const forwardedIp = firstHeaderValue(request.headers['cf-connecting-ip']);
  if (forwardedIp) return forwardedIp;

  const realIp = firstHeaderValue(request.headers['x-real-ip']);
  if (realIp) return realIp;

  const proxyIp = firstHeaderValue(request.headers['x-forwarded-for']);
  if (proxyIp) return proxyIp;

  if (typeof request.ip === 'string' && request.ip.trim()) {
    return request.ip.trim();
  }

  const socketIp = request.socket?.remoteAddress;
  if (typeof socketIp === 'string' && socketIp.trim()) {
    return socketIp.trim();
  }

  const connectionIp = (request.connection as { remoteAddress?: string } | undefined)
    ?.remoteAddress;
  if (typeof connectionIp === 'string' && connectionIp.trim()) {
    return connectionIp.trim();
  }

  return null;
}
