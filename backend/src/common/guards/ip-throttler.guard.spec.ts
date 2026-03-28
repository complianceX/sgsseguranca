import { IpThrottlerGuard } from './ip-throttler.guard';

describe('IpThrottlerGuard', () => {
  const guard = Object.create(IpThrottlerGuard.prototype) as IpThrottlerGuard;

  it('usa apenas IP em rotas não sensíveis', async () => {
    const tracker = await (guard as any).getTracker({
      ip: '10.0.0.10',
      path: '/users/me',
      headers: { 'user-agent': 'jest' },
    });

    expect(tracker).toBe('10.0.0.10');
  });

  it('combina IP e fingerprint hash em rotas públicas sensíveis', async () => {
    const tracker = await (guard as any).getTracker({
      ip: '10.0.0.10',
      path: '/public/documents/validate',
      headers: {
        'user-agent': 'Mozilla/5.0 test',
        'x-client-fingerprint': 'device-123',
      },
    });

    expect(tracker.startsWith('10.0.0.10:')).toBe(true);
    expect(tracker).toHaveLength('10.0.0.10:'.length + 16);
  });
});
