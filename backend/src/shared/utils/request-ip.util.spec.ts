import type { Request } from 'express';
import { getRequestIp } from './request-ip.util';

describe('getRequestIp', () => {
  it('prefere request.ip em vez de headers forjáveis', () => {
    const request = {
      ip: '10.0.0.10',
      headers: {
        'x-forwarded-for': '203.0.113.10',
        'cf-connecting-ip': '198.51.100.20',
      },
      socket: {
        remoteAddress: '172.16.0.5',
      },
    } as unknown as Request;

    expect(getRequestIp(request)).toBe('10.0.0.10');
  });

  it('usa socket.remoteAddress como fallback', () => {
    const request = {
      socket: {
        remoteAddress: '172.16.0.5',
      },
    } as unknown as Request;

    expect(getRequestIp(request)).toBe('172.16.0.5');
  });
});
