import { AiRecoveryProcessor } from './ai-recovery.processor';

describe('AiRecoveryProcessor', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const interactionId = '22222222-2222-4222-8222-222222222222';

  it('restaura o contexto tenant antes de reprocessar', async () => {
    const recoverInteraction = jest.fn().mockResolvedValue(undefined);
    const run = jest
      .fn()
      .mockImplementation((_context: unknown, callback: () => Promise<void>) =>
        callback(),
      );
    const processor = new AiRecoveryProcessor(
      { run } as never,
      { recoverInteraction } as never,
    );

    await processor.process({
      id: 'job-1',
      timestamp: Date.now(),
      data: { tenantId, interactionId, queuedAt: new Date().toISOString() },
    } as never);

    expect(run).toHaveBeenCalledWith(
      { companyId: tenantId, isSuperAdmin: false },
      expect.any(Function),
    );
    expect(recoverInteraction).toHaveBeenCalledWith(interactionId);
  });

  it('descarta payload legado sem identificadores UUID válidos', async () => {
    const run = jest.fn();
    const processor = new AiRecoveryProcessor(
      { run } as never,
      { recoverInteraction: jest.fn() } as never,
    );

    await expect(
      processor.process({
        id: 'job-2',
        timestamp: Date.now(),
        data: { tenantId: 'invalid', interactionId },
      } as never),
    ).resolves.toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });

  it('não reprocessa interação expirada', async () => {
    const recoverInteraction = jest.fn();
    const run = jest.fn();
    const processor = new AiRecoveryProcessor(
      { run } as never,
      { recoverInteraction } as never,
    );

    await processor.process({
      id: 'job-stale',
      data: {
        tenantId,
        interactionId,
        queuedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      },
    } as never);

    expect(run).not.toHaveBeenCalled();
    expect(recoverInteraction).not.toHaveBeenCalled();
  });

  it('descarta job sem timestamp confiável', async () => {
    const run = jest.fn();
    const processor = new AiRecoveryProcessor(
      { run } as never,
      { recoverInteraction: jest.fn() } as never,
    );

    await expect(
      processor.process({
        id: 'job-without-timestamp',
        data: { tenantId, interactionId },
      } as never),
    ).resolves.toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });

  it('remove PII de payload legado antes de reprocessar', async () => {
    const queuedAt = new Date().toISOString();
    const recoverInteraction = jest.fn().mockResolvedValue(undefined);
    const run = jest
      .fn()
      .mockImplementation((_context: unknown, callback: () => Promise<void>) =>
        callback(),
      );
    const updateData = jest.fn().mockResolvedValue(undefined);
    const processor = new AiRecoveryProcessor(
      { run } as never,
      { recoverInteraction } as never,
    );

    await processor.process({
      id: 'legacy-job',
      timestamp: Date.now(),
      updateData,
      data: {
        tenantId,
        interactionId,
        queuedAt,
        reason: 'openai_circuit_breaker_open',
        userId: '33333333-3333-4333-8333-333333333333',
        question: 'Pergunta com dado pessoal',
        history: [{ role: 'user', content: 'Histórico sensível' }],
      },
    } as never);

    expect(updateData).toHaveBeenCalledWith({
      tenantId,
      interactionId,
      queuedAt,
      reason: 'openai_circuit_breaker_open',
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('remove campos legados até de job expirado antes de descartá-lo', async () => {
    const queuedAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const updateData = jest.fn().mockResolvedValue(undefined);
    const run = jest.fn();
    const processor = new AiRecoveryProcessor(
      { run } as never,
      { recoverInteraction: jest.fn() } as never,
    );

    await processor.process({
      id: 'legacy-stale-job',
      updateData,
      data: {
        tenantId,
        interactionId,
        queuedAt,
        question: 'Pergunta sensível antiga',
      },
    } as never);

    expect(updateData).toHaveBeenCalledWith({
      tenantId,
      interactionId,
      queuedAt,
    });
    expect(run).not.toHaveBeenCalled();
  });
});
