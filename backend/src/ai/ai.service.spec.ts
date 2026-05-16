import { UnauthorizedException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Repository } from 'typeorm';
import { AiService } from './ai.service';
import { AiInteraction } from './entities/ai-interaction.entity';
import { requestContextStorage } from '../common/middleware/request-context.middleware';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440010';
const AUTH_USER_ID = '550e8400-e29b-41d4-a716-446655440011';
const INSPECTOR_ID = '550e8400-e29b-41d4-a716-446655440012';
const SITE_ID = '550e8400-e29b-41d4-a716-446655440013';

function withRequestContext<T>(
  values: Record<string, string>,
  callback: () => Promise<T>,
): Promise<T> {
  const store = new Map<string, string>(Object.entries(values));
  return new Promise<T>((resolve, reject) => {
    requestContextStorage.run(store, () => {
      callback().then(resolve).catch(reject);
    });
  });
}

function makeService() {
  const create = jest.fn((payload: Partial<AiInteraction>) => ({
    id: 'interaction-1',
    ...payload,
  }));
  const save = jest.fn((payload: Partial<AiInteraction>) =>
    Promise.resolve(payload as AiInteraction),
  );
  const interactionRepo = {
    create,
    save,
  } as unknown as Repository<AiInteraction>;

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'OPENAI_MODEL') return 'gpt-5-mini';
      if (key === 'OPENAI_REASONING_EFFORT') return 'medium';
      return undefined;
    }),
  };

  const tenantService = {
    getTenantId: jest.fn(() => TENANT_ID),
  };

  const rateLimitService = {
    checkAndConsume: jest.fn(() =>
      Promise.resolve({
        allowed: true,
        remaining: { perMinute: 9, perDay: 99 },
      }),
    ),
  };

  const pdfQueue = {
    add: jest.fn(() => Promise.resolve({ id: 'job-1' })),
  } as unknown as Queue;

  const service = new AiService(
    interactionRepo,
    configService as never,
    tenantService as never,
    rateLimitService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    pdfQueue,
  );

  return {
    service,
    interactionRepo,
    create,
    pdfQueue,
  };
}

describe('AiService', () => {
  it('queueMonthlyReport falha fechado sem usuário autenticado válido', async () => {
    const { service } = makeService();

    await expect(
      withRequestContext({ companyId: TENANT_ID }, () =>
        service.queueMonthlyReport({ ano: 2026, mes: 3 }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('generateChecklist persiste user_id do contexto autenticado, não inspetor_id', async () => {
    const { service, create } = makeService();
    jest.spyOn(service as never, 'callOpenAiJson' as never).mockResolvedValue({
      data: {
        titulo: 'Checklist gerado',
        itens: [{ item: 'Verificar guarda-corpo' }],
        confidence: 'medium',
        notes: [],
      },
      inputTokens: 10,
      outputTokens: 20,
    } as never);

    await withRequestContext(
      { companyId: TENANT_ID, userId: AUTH_USER_ID },
      async () => {
        await service.generateChecklist({
          titulo: 'Checklist',
          descricao: 'Desc',
          inspetor_id: INSPECTOR_ID,
          site_id: SITE_ID,
        });
      },
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: TENANT_ID,
        user_id: AUTH_USER_ID,
      }),
    );
  });

  it('generateStructuredJson falha fechado com userId sentinela', async () => {
    const { service } = makeService();

    await expect(
      withRequestContext(
        { companyId: TENANT_ID, userId: 'unknown' },
        async () =>
          service.generateStructuredJson({
            task: 'generic',
            prompt: 'teste',
          }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('generateAprDraft rejeita company_id vindo do client antes de montar contexto de IA', async () => {
    const { service } = makeService();

    await expect(
      withRequestContext(
        { companyId: TENANT_ID, userId: AUTH_USER_ID },
        async () =>
          service.generateAprDraft({
            site_id: SITE_ID,
            elaborador_id: AUTH_USER_ID,
            company_id: 'tenant-forjado',
          } as never),
      ),
    ).rejects.toThrow('company_id não é permitido no payload');
  });

  it('generatePtDraft rejeita company_id vindo do client antes de montar contexto de IA', async () => {
    const { service } = makeService();

    await expect(
      withRequestContext(
        { companyId: TENANT_ID, userId: AUTH_USER_ID },
        async () =>
          service.generatePtDraft({
            site_id: SITE_ID,
            responsavel_id: AUTH_USER_ID,
            company_id: 'tenant-forjado',
          } as never),
      ),
    ).rejects.toThrow('company_id não é permitido no payload');
  });
});
