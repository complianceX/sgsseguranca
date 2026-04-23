import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { IntegrationResilienceService } from '../common/resilience/integration-resilience.service';
import { requestOpenAiChatCompletionResponse } from './openai-request.util';
import { OpenAiCircuitBreakerService } from '../common/resilience/openai-circuit-breaker.service';

describe('openai-request.util', () => {
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'OPENAI_CHAT_COMPLETION_TIMEOUT_MS') return '250';
      return undefined;
    }),
  } as unknown as ConfigService;

  function createIntegrationMock(): {
    execute: jest.MockedFunction<IntegrationResilienceService['execute']>;
  } {
    return {
      execute: jest.fn(
        async <T>(_name: string, fn: () => Promise<T>, _opts?: unknown) => fn(),
      ) as unknown as jest.MockedFunction<
        IntegrationResilienceService['execute']
      >,
    };
  }

  function createCircuitBreakerMock(): jest.Mocked<
    Pick<
      OpenAiCircuitBreakerService,
      | 'assertRequestAllowed'
      | 'recordSuccess'
      | 'recordFailure'
      | 'isCountableFailureStatus'
      | 'isCountableFailureError'
    >
  > {
    return {
      assertRequestAllowed: jest.fn().mockResolvedValue(undefined),
      recordSuccess: jest.fn().mockResolvedValue(undefined),
      recordFailure: jest.fn().mockResolvedValue(undefined),
      isCountableFailureStatus: jest
        .fn()
        .mockImplementation((status: number) =>
          [500, 502, 503].includes(status),
        ),
      isCountableFailureError: jest.fn().mockReturnValue(false),
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
    const circuitBreaker = createCircuitBreakerMock();

    const result = await requestOpenAiChatCompletionResponse({
      apiKey: 'key-1',
      body: { model: 'gpt-5-mini' },
      configService,
      integration: integration as unknown as IntegrationResilienceService,
      circuitBreaker: circuitBreaker as unknown as OpenAiCircuitBreakerService,
      fetchImpl,
    });

    expect(result).toBe(response);
    expect(circuitBreaker.assertRequestAllowed).toHaveBeenCalledTimes(1);
    expect(circuitBreaker.recordSuccess).toHaveBeenCalledTimes(1);
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

  it('sanitiza PII e contexto sensível antes de enviar para a OpenAI', async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const fetchImpl: typeof fetch = jest.fn().mockResolvedValue(response);
    const integration = createIntegrationMock();
    const circuitBreaker = createCircuitBreakerMock();

    await requestOpenAiChatCompletionResponse({
      apiKey: 'key-1',
      body: {
        model: 'gpt-5-mini',
        metadata: {
          name: 'Wanderson',
          role: 'TST',
        },
        tools: [
          {
            type: 'function',
            function: {
              name: 'buscar_treinamentos_pendentes',
              description: 'Consulta treinamentos pendentes no tenant atual.',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                },
              },
            },
          },
        ],
        messages: [
          {
            role: 'user',
            content:
              'Participantes: {"nome":"Wanderson","funcao":"TST","site":"Obra Alfa","email":"w@sgs.com"} CPF 123.456.789-00',
          },
        ],
      },
      configService,
      integration: integration as unknown as IntegrationResilienceService,
      circuitBreaker: circuitBreaker as unknown as OpenAiCircuitBreakerService,
      fetchImpl,
    });

    const [, fetchOptions] = (fetchImpl as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const rawBody =
      typeof fetchOptions.body === 'string' ? fetchOptions.body : '{}';
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const messages = body.messages as Array<Record<string, unknown>>;
    const tools = body.tools as Array<{
      function: { name: string };
    }>;

    expect(messages[0].role).toBe('user');
    expect(tools[0].function.name).toBe('buscar_treinamentos_pendentes');
    expect(JSON.stringify(body)).not.toContain('Wanderson');
    expect(JSON.stringify(body)).not.toContain('Obra Alfa');
    expect(JSON.stringify(body)).not.toContain('TST');
    expect(JSON.stringify(body)).not.toContain('123.456.789-00');
    expect(JSON.stringify(body)).toContain('[REDACTED_NAME]');
    expect(JSON.stringify(body)).toContain('[REDACTED_ROLE]');
    expect(JSON.stringify(body)).toContain('[REDACTED_SITE]');
    expect(JSON.stringify(body)).toContain('[EMAIL]');
    expect(JSON.stringify(body)).toContain('[CPF]');
  });

  it('transforma abort local em erro de timeout legivel', async () => {
    jest.useFakeTimers();
    const fetchImpl: typeof fetch = jest.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );
    const integration = createIntegrationMock();
    const circuitBreaker = createCircuitBreakerMock();
    circuitBreaker.isCountableFailureError.mockReturnValue(true);

    const handled = requestOpenAiChatCompletionResponse({
      apiKey: 'key-1',
      body: { model: 'gpt-5-mini' },
      configService,
      integration: integration as unknown as IntegrationResilienceService,
      circuitBreaker: circuitBreaker as unknown as OpenAiCircuitBreakerService,
      fetchImpl,
    }).catch((error: unknown) => error);

    await jest.advanceTimersByTimeAsync(260);

    const error = await handled;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(
      'OpenAI request timeout after 250ms',
    );
    expect(circuitBreaker.recordFailure).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  it('falha imediatamente quando o circuit breaker esta aberto', async () => {
    const integration = createIntegrationMock();
    const circuitBreaker = createCircuitBreakerMock();
    const fetchImpl: typeof fetch = jest.fn();
    circuitBreaker.assertRequestAllowed.mockRejectedValue(
      new ServiceUnavailableException(
        'Serviço de IA temporariamente indisponível. Tente novamente em alguns instantes.',
      ),
    );

    await expect(
      requestOpenAiChatCompletionResponse({
        apiKey: 'key-1',
        body: { model: 'gpt-5-mini' },
        configService,
        integration: integration as unknown as IntegrationResilienceService,
        circuitBreaker:
          circuitBreaker as unknown as OpenAiCircuitBreakerService,
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(integration.execute).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('registra falha countable para status 503', async () => {
    const response = new Response(JSON.stringify({ error: 'upstream down' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
    const fetchImpl: typeof fetch = jest.fn().mockResolvedValue(response);
    const integration = createIntegrationMock();
    const circuitBreaker = createCircuitBreakerMock();

    const result = await requestOpenAiChatCompletionResponse({
      apiKey: 'key-1',
      body: { model: 'gpt-5-mini' },
      configService,
      integration: integration as unknown as IntegrationResilienceService,
      circuitBreaker: circuitBreaker as unknown as OpenAiCircuitBreakerService,
      fetchImpl,
    });

    expect(result.status).toBe(503);
    expect(circuitBreaker.recordFailure).toHaveBeenCalledWith({ status: 503 });
    expect(circuitBreaker.recordSuccess).not.toHaveBeenCalled();
  });
});
