import type { Request } from 'express';

export function getRequestIp(request: Request): string | null {
  if (typeof request.ip === 'string' && request.ip.trim()) {
    return request.ip.trim();
  }

  const socketIp = request.socket?.remoteAddress;
  if (typeof socketIp === 'string' && socketIp.trim()) {
    return socketIp.trim();
  }

  const connectionIp = (
    request.connection as { remoteAddress?: string } | undefined
  )?.remoteAddress;
  if (typeof connectionIp === 'string' && connectionIp.trim()) {
    return connectionIp.trim();
  }

  return null;
}
