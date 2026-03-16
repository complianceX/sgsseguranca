import { ConfigService } from '@nestjs/config';
import { IntegrationResilienceService } from '../common/resilience/integration-resilience.service';
import { requestOpenAiChatCompletionResponse } from './openai-request.util';

describe('openai-request.util', () => {
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'OPENAI_CHAT_COMPLETION_TIMEOUT_MS') return '250';
      return undefined;
    }),
  } as unknown as ConfigService;

  function createIntegrationMock(): jest.Mocked<
    Pick<IntegrationResilienceService, 'execute'>
  > {
    return {
      execute: jest.fn(async <T>(_name: string, fn: () => Promise<T>) => fn()),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('usa o wrapper de resiliencia para chamar a OpenAI', async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const fetchImpl: typeof fetch = jest.fn().mockResolvedValue(response);
    const integration = createIntegrationMock();

    const result = await requestOpenAiChatCompletionResponse({
      apiKey: 'key-1',
      body: { model: 'gpt-5-mini' },
      configService,
      integration,
      fetchImpl,
    });

    expect(result).toBe(response);
    expect(integration.execute).toHaveBeenCalledTimes(1);
    const [, integrationCallback, integrationOptions] = integration.execute.mock
      .calls[0] as [
      string,
      () => Promise<Response>,
      { timeoutMs: number; retry: { attempts: number; mode: string } },
    ];
    expect(typeof integrationCallback).toBe('function');
    expect(integrationOptions.timeoutMs).toBe(250);
    expect(integrationOptions.retry).toMatchObject({
      attempts: 2,
      mode: 'safe',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [fetchUrl, fetchOptions] = (fetchImpl as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(fetchUrl).toBe('https://api.openai.com/v1/chat/completions');
    expect(fetchOptions.method).toBe('POST');
    expect(fetchOptions.headers).toMatchObject({
      Authorization: 'Bearer key-1',
    });
  });

  it('transforma abort local em erro de timeout legivel', async () => {
    jest.useFakeTimers();
    const fetchImpl: typeof fetch = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );
    const integration = createIntegrationMock();

    const handled = requestOpenAiChatCompletionResponse({
      apiKey: 'key-1',
      body: { model: 'gpt-5-mini' },
      configService,
      integration,
      fetchImpl,
    }).catch((error: unknown) => error);

    await jest.advanceTimersByTimeAsync(260);

    const error = await handled;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(
      'OpenAI request timeout after 250ms',
    );

    jest.useRealTimers();
  });
});
