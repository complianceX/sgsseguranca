import {
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationResilienceService } from '../common/resilience/integration-resilience.service';
import { OpenAiCircuitBreakerService } from '../common/resilience/openai-circuit-breaker.service';
import { sanitizeOpenAiRequestBody } from './openai-payload-boundary.util';

type OpenAiChatRequestInput = {
  apiKey: string;
  body: Record<string, unknown>;
  configService: ConfigService;
  integration: IntegrationResilienceService;
  circuitBreaker: OpenAiCircuitBreakerService;
  fetchImpl?: typeof fetch;
};

function resolveOpenAiTimeoutMs(configService: ConfigService): number {
  const candidates = [
    configService.get<string>('OPENAI_CHAT_COMPLETION_TIMEOUT_MS'),
    configService.get<string>('OPENAI_TIMEOUT_MS'),
    configService.get<string>('INTEGRATION_TIMEOUT_MS'),
    '30000',
  ];

  for (const raw of candidates) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 30_000;
}

export async function requestOpenAiChatCompletionResponse(
  input: OpenAiChatRequestInput,
): Promise<Response> {
  const timeoutMs = resolveOpenAiTimeoutMs(input.configService);
  const fetchImpl = input.fetchImpl ?? fetch;
  const sanitizedBody = sanitizeOpenAiRequestBody(input.body);

  await input.circuitBreaker.assertRequestAllowed();

  try {
    const response = await input.integration.execute(
      'openai_chat_completion',
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
          return await fetchImpl('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${input.apiKey}`,
            },
            body: JSON.stringify(sanitizedBody),
            signal: controller.signal,
          });
        } catch (error) {
          if (controller.signal.aborted) {
            throw new GatewayTimeoutException(
              `OpenAI request timeout after ${timeoutMs}ms`,
            );
          }
          throw error;
        } finally {
          clearTimeout(timeout);
        }
      },
      {
        timeoutMs,
        retry: {
          attempts: 2,
          mode: 'safe',
        },
      },
    );

    if (response.ok) {
      await input.circuitBreaker.recordSuccess();
      return response;
    }

    if (input.circuitBreaker.isCountableFailureStatus(response.status)) {
      await input.circuitBreaker.recordFailure({ status: response.status });
    } else {
      await input.circuitBreaker.recordSuccess();
    }

    return response;
  } catch (error) {
    if (error instanceof ServiceUnavailableException) {
      throw error;
    }

    if (input.circuitBreaker.isCountableFailureError(error)) {
      await input.circuitBreaker.recordFailure({ error });
    }

    throw error;
  }
}
