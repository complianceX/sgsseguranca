import { extractMailDispatchErrorMessage } from './mailService';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

describe('extractMailDispatchErrorMessage', () => {
  it('explica com clareza quando a Brevo bloqueia o IP atual', async () => {
    await expect(
      extractMailDispatchErrorMessage({
        isAxiosError: true,
        response: {
          status: 503,
          data: {
            message:
              'Brevo bloqueou o IP de saída do servidor (34.32.130.192). Autorize este IP em Brevo > Security > Authorised IPs e tente novamente.',
            code: 'BREVO_IP_NOT_AUTHORIZED',
            blockedIp: '34.32.130.192',
          },
        },
      }),
    ).resolves.toContain('34.32.130.192');
  });

  it('explica quando o circuit breaker do provedor esta aberto', async () => {
    await expect(
      extractMailDispatchErrorMessage({
        isAxiosError: true,
        response: {
          status: 503,
          data: {
            message:
              'A integracao de e-mail com a Brevo entrou em protecao apos falhas recentes.',
            code: 'MAIL_PROVIDER_CIRCUIT_OPEN',
            retryAfterSeconds: 30,
          },
        },
      }),
    ).resolves.toContain('30s');
  });

  it('mantem a mensagem original quando o erro nao e de e-mail estruturado', async () => {
    await expect(
      extractMailDispatchErrorMessage(new Error('Falha local inesperada')),
    ).resolves.toBe('Falha local inesperada');
  });
});
