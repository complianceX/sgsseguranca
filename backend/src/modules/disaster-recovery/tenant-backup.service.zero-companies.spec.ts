import { TenantBackupService } from './tenant-backup.service';
import type { DataSource } from 'typeorm';
import type { ConfigService } from '@nestjs/config';
import type { DisasterRecoveryExecutionService } from './disaster-recovery-execution.service';
import type { PrivilegedDbService } from '../../shared/database/privileged-db.service';

function makeQueryRunner(queryResults: unknown[]) {
  let callCount = 0;
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    query: jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(queryResults[callCount++] ?? []),
      ),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  };
}

describe('TenantBackupService.backupAllActiveTenants — trava de sanidade RLS', () => {
  const configService = {} as ConfigService;
  const executionService = {} as DisasterRecoveryExecutionService;
  const privilegedDb = {
    isEnabled: jest.fn().mockReturnValue(false),
    withPrivilegedClient: jest.fn(),
  } as unknown as PrivilegedDbService;

  it('lança erro em vez de reportar sucesso vazio quando zero empresas ativas são encontradas', async () => {
    // Regressão: zero empresas ativas é o sintoma de contexto RLS ausente
    // (companies tem RLS FORCE) — confirmado empiricamente contra produção
    // que, sem SET LOCAL app.is_super_admin, a query abaixo retorna 0 linhas
    // mesmo havendo empresas ativas reais. Antes desta trava, o método
    // retornava silenciosamente `{ queued: [] }` como se fosse sucesso.
    const qr = makeQueryRunner([[], []]); // SET LOCAL → [], SELECT → []
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(qr),
    } as unknown as DataSource;

    const service = new TenantBackupService(
      dataSource,
      configService,
      executionService,
      privilegedDb,
    );

    await expect(service.backupAllActiveTenants()).rejects.toThrow(
      /Suspeita de contexto RLS ausente/,
    );
  });

  it('processa normalmente quando empresas ativas são encontradas', async () => {
    const qr = makeQueryRunner([[], [{ id: 'company-1' }]]); // SET LOCAL → [], SELECT → company
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(qr),
    } as unknown as DataSource;

    const service = new TenantBackupService(
      dataSource,
      configService,
      executionService,
      privilegedDb,
    );
    jest.spyOn(service, 'backupTenant').mockResolvedValue({} as never);

    const result = await service.backupAllActiveTenants();

    expect(result.queued).toEqual(['company-1']);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(service.backupTenant).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({ triggerSource: 'scheduled_daily' }),
    );
  });
});
