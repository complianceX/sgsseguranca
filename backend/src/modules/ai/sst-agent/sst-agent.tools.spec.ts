import { SstToolsExecutor } from './sst-agent.tools';
import type { AprsService } from '../../aprs/aprs.service';
import type { PtsService } from '../../pts/pts.service';

/**
 * Cobre as tools buscar_aprs / buscar_permissoes_trabalho — adicionadas para
 * o agente conseguir contar/resumir APRs e PTs (antes ele admitia não
 * conseguir contar APRs). Verifica agregação por status e ausência de PII.
 */
describe('SstToolsExecutor — tools de APR e PT', () => {
  function makeExecutor(overrides: {
    aprs?: Partial<AprsService>;
    pts?: Partial<PtsService>;
  }) {
    return new SstToolsExecutor(
      {} as never, // trainings
      {} as never, // medicalExams
      {} as never, // cats
      {} as never, // nonConformities
      {} as never, // serviceOrders
      (overrides.aprs ?? {}) as AprsService,
      (overrides.pts ?? {}) as PtsService,
      {} as never, // epis
      {} as never, // dds
    );
  }

  it('buscar_aprs agrega por status e não vaza dados individuais identificáveis', async () => {
    const findPaginated = jest.fn().mockResolvedValue({
      total: 4,
      data: [
        {
          id: 'a1',
          numero: 'APR-1',
          status: 'Pendente',
          elaborador: { nome: 'Fulano', cpf: '111' },
        },
        { id: 'a2', numero: 'APR-2', status: 'Pendente' },
        { id: 'a3', numero: 'APR-3', status: 'Aprovada' },
        { id: 'a4', numero: 'APR-4', status: 'Encerrada' },
      ],
    });
    const executor = makeExecutor({ aprs: { findPaginated } });

    const result = await executor.execute('buscar_aprs', {});

    expect(result.success).toBe(true);
    expect(result.is_stub).toBe(false);
    const data = result.data as Record<string, unknown>;
    expect(data.total).toBe(4);
    expect(data.por_status).toEqual({ Pendente: 2, Aprovada: 1, Encerrada: 1 });
    // não deve conter nome/cpf de ninguém
    expect(JSON.stringify(data)).not.toMatch(/Fulano|cpf|111/i);
  });

  it('buscar_aprs repassa filtro de status ao service', async () => {
    const findPaginated = jest.fn().mockResolvedValue({ total: 0, data: [] });
    const executor = makeExecutor({ aprs: { findPaginated } });

    await executor.execute('buscar_aprs', { status: 'Pendente' });

    expect(findPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'Pendente', limit: 100 }),
    );
  });

  it('buscar_permissoes_trabalho agrega PTs por status', async () => {
    const findPaginated = jest.fn().mockResolvedValue({
      total: 3,
      data: [
        { id: 'p1', status: 'Aprovada' },
        { id: 'p2', status: 'Aprovada' },
        { id: 'p3', status: 'Expirada' },
      ],
    });
    const executor = makeExecutor({ pts: { findPaginated } });

    const result = await executor.execute('buscar_permissoes_trabalho', {});

    const data = result.data as Record<string, unknown>;
    expect(data.total).toBe(3);
    expect(data.por_status).toEqual({ Aprovada: 2, Expirada: 1 });
    expect(data.link).toBe('/dashboard/pts');
  });

  it('captura erro do service sem propagar exceção ao agente', async () => {
    const findPaginated = jest
      .fn()
      .mockRejectedValue(new Error('db indisponível'));
    const executor = makeExecutor({ aprs: { findPaginated } });

    const result = await executor.execute('buscar_aprs', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('db indisponível');
  });
});
