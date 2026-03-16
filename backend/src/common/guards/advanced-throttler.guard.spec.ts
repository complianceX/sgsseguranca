import { Reflector } from '@nestjs/core';
import { AdvancedThrottlerGuard } from './advanced-throttler.guard';

describe('AdvancedThrottlerGuard', () => {
  it('prefere o IP resolvido pelo request em vez de headers forjaveis', () => {
    const guard = new AdvancedThrottlerGuard(
      {},
      {},
      new Reflector(),
    ) as unknown as {
      getRequestIP: (request: Record<string, unknown>) => string;
    };

    const ip = guard.getRequestIP({
      ip: '10.0.0.10',
      headers: {
        'x-forwarded-for': '203.0.113.10',
        'cf-connecting-ip': '198.51.100.20',
      },
      socket: {
        remoteAddress: '172.16.0.5',
      },
    });

    expect(ip).toBe('10.0.0.10');
  });
});
