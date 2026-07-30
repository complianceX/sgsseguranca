import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PdfRateLimitService } from './pdf-rate-limit.service';

describe('PdfRateLimitService', () => {
  it('pseudonimiza identificadores de auditoria com HMAC não reversível por dicionário simples', async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([51, 60]),
    };
    const configService = {
      get: jest
        .fn()
        .mockReturnValue('audit-hmac-key-with-at-least-32-characters'),
    } as unknown as ConfigService;
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const service = new PdfRateLimitService(redis as never, configService);

    await expect(
      service.checkDownloadLimit('user-123', '203.0.113.10'),
    ).rejects.toMatchObject({ status: 429 });

    expect(loggerSpy).toHaveBeenCalledTimes(1);
    const loggedValue: unknown = loggerSpy.mock.calls[0][0];
    expect(loggedValue).toEqual(
      expect.objectContaining({
        event: 'mass_pdf_download_detected',
      }),
    );
    if (
      !loggedValue ||
      typeof loggedValue !== 'object' ||
      !('userHash' in loggedValue) ||
      typeof loggedValue.userHash !== 'string' ||
      !('ipHash' in loggedValue) ||
      typeof loggedValue.ipHash !== 'string'
    ) {
      throw new Error('Entrada de auditoria inválida.');
    }
    expect(loggedValue.userHash).toMatch(/^[a-f0-9]{32}$/);
    expect(loggedValue.ipHash).toMatch(/^[a-f0-9]{32}$/);
    expect(loggedValue.ipHash).not.toBe(
      createHash('sha256').update('203.0.113.10').digest('hex').slice(0, 32),
    );
  });

  it('falha na inicialização sem segredo de auditoria forte', () => {
    const configService = {
      get: jest.fn().mockReturnValue('short'),
    } as unknown as ConfigService;

    expect(() => new PdfRateLimitService({} as never, configService)).toThrow(
      'SECURITY_AUDIT_HMAC_KEY',
    );
  });
});
