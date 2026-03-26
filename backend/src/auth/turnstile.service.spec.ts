import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { TurnstileService } from './turnstile.service';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;
const createAxiosHttpError = (status: number, data?: unknown) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: {
      status,
      data,
    },
  });

describe('TurnstileService', () => {
  const createConfigService = (
    overrides: Record<string, string | number> = {},
  ): ConfigService =>
    ({
      get: jest.fn((key: string, defaultValue?: string | number) => {
        const values: Record<string, string | number> = {
          TURNSTILE_ENABLED: 'true',
          TURNSTILE_SECRET_KEY: 'secret-key',
          TURNSTILE_VERIFY_TIMEOUT_MS: 5000,
          FRONTEND_URL: 'https://app.sgsseguranca.com.br',
          ...overrides,
        };

        return values[key] ?? defaultValue;
      }),
    }) as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.isAxiosError.mockImplementation(
      (error: unknown): error is Error & { isAxiosError: true } =>
        Boolean(
          error &&
            typeof error === 'object' &&
            'isAxiosError' in error &&
            (error as { isAxiosError?: boolean }).isAxiosError,
        ),
    );
  });

  it('ignores validation when turnstile is disabled', async () => {
    const service = new TurnstileService(
      createConfigService({ TURNSTILE_ENABLED: 'false' }),
    );

    await expect(service.assertHuman(undefined)).resolves.toBeUndefined();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('rejects requests without token when enabled', async () => {
    const service = new TurnstileService(createConfigService());

    await expect(service.assertHuman('')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts valid turnstile verification', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        success: true,
        action: 'login',
        hostname: 'app.sgsseguranca.com.br',
      },
    } as never);
    const service = new TurnstileService(createConfigService());

    await expect(
      service.assertHuman('token-123', {
        remoteIp: '127.0.0.1',
        expectedAction: 'login',
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects invalid turnstile verification', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        success: false,
        'error-codes': ['timeout-or-duplicate'],
      },
    } as never);
    const service = new TurnstileService(createConfigService());

    await expect(service.assertHuman('token-123')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects hostname mismatch', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        success: true,
        hostname: 'evil.example.com',
      },
    } as never);
    const service = new TurnstileService(createConfigService());

    await expect(service.assertHuman('token-123')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('surfaces provider outages as bad gateway', async () => {
    mockedAxios.post.mockRejectedValue(new Error('network down'));
    const service = new TurnstileService(createConfigService());

    await expect(service.assertHuman('token-123')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('retries without remoteip when provider rejects it with 400', async () => {
    mockedAxios.post
      .mockRejectedValueOnce(
        createAxiosHttpError(400, 'remoteip invalid for challenge provider'),
      )
      .mockResolvedValueOnce({
        data: {
          success: true,
          action: 'login',
          hostname: 'app.sgsseguranca.com.br',
        },
      } as never);
    const service = new TurnstileService(createConfigService());

    await expect(
      service.assertHuman('token-123', {
        remoteIp: '::ffff:100.64.0.2',
        expectedAction: 'login',
      }),
    ).resolves.toBeUndefined();

    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });
});
