import { TenantBackupService } from './tenant-backup.service';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { DisasterRecoveryExecutionService } from './disaster-recovery-execution.service';
import { PrivilegedDbService } from '../../shared/database/privileged-db.service';

function makeQueryRunner(selectRows: Array<{ id?: string }>) {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    query: jest
      .fn()
      .mockResolvedValueOnce(undefined) // SET LOCAL app.is_super_admin
      .mockResolvedValueOnce(selectRows), // SELECT id FROM companies
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  };
}

describe('TenantBackupService.backupAllActiveTenants — trava de sanidade RLS', () => {
  // PrivilegedDbService com isEnabled()=false: ativa o fallback via QueryRunner
  // (comportamento enquanto DATABASE_ADMIN_URL não está configurada em Coolify).
  const privilegedDb = {
    isEnabled: jest.fn().mockReturnValue(false),
  } as unknown as PrivilegedDbService;

  it('lança erro em vez de reportar sucesso vazio quando zero empresas ativas são encontradas', async () => {
    // Regressão: zero empresas ativas é o sintoma de contexto RLS ausente
    // (companies tem RLS FORCE) — confirmado empiricamente contra produção
    // que, sem SET LOCAL app.is_super_admin, a query abaixo retorna 0 linhas
    // mesmo havendo empresas ativas reais. Antes desta trava, o método
    // retornava silenciosamente `{ queued: [] }` como se fosse sucesso.
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(makeQueryRunner([])),
    } as unknown as DataSource;
    const configService = {} as ConfigService;
    const executionService = {} as DisasterRecoveryExecutionService;

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
    const dataSource = {
      createQueryRunner: jest
        .fn()
        .mockReturnValue(makeQueryRunner([{ id: 'company-1' }])),
    } as unknown as DataSource;
    const configService = {} as ConfigService;
    const executionService = {} as DisasterRecoveryExecutionService;

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
