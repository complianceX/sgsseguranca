import { DashboardRevalidateProcessor } from './dashboard-revalidate.processor';

describe('DashboardRevalidateProcessor', () => {
  it('executa a revalidação dentro do contexto tenant', async () => {
    const revalidateDashboardQuery = jest.fn().mockResolvedValue(undefined);
    const run = jest
      .fn()
      .mockImplementation((_context: unknown, callback: () => Promise<void>) =>
        callback(),
      );
    const processor = new DashboardRevalidateProcessor(
      { revalidateDashboardQuery } as never,
      { run } as never,
    );

    await processor.process({
      id: 'job-1',
      data: {
        companyId: '11111111-1111-4111-8111-111111111111',
        queryType: 'kpis',
      },
    } as never);

    expect(run).toHaveBeenCalledWith(
      {
        companyId: '11111111-1111-4111-8111-111111111111',
        isSuperAdmin: false,
      },
      expect.any(Function),
    );
    expect(revalidateDashboardQuery).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'kpis',
    );
  });

  it('descarta payload com tenant ou query inválidos', async () => {
    const run = jest.fn();
    const revalidateDashboardQuery = jest.fn();
    const processor = new DashboardRevalidateProcessor(
      { revalidateDashboardQuery } as never,
      { run } as never,
    );

    await processor.process({
      id: 'job-invalid',
      data: {
        companyId: 'not-a-uuid',
        queryType: 'unknown',
      },
    } as never);

    expect(run).not.toHaveBeenCalled();
    expect(revalidateDashboardQuery).not.toHaveBeenCalled();
  });
});
