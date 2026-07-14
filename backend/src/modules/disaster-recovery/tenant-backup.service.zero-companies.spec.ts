import { TenantBackupService } from './tenant-backup.service';
import type { DataSource } from 'typeorm';
import type { ConfigService } from '@nestjs/config';
import type { DisasterRecoveryExecutionService } from './disaster-recovery-execution.service';

describe('TenantBackupService.backupAllActiveTenants — trava de sanidade RLS', () => {
  it('lança erro em vez de reportar sucesso vazio quando zero empresas ativas são encontradas', async () => {
    // Regressão: zero empresas ativas é o sintoma de contexto RLS ausente
    // (companies tem RLS FORCE) — confirmado empiricamente contra produção
    // que, sem SET LOCAL app.is_super_admin, a query abaixo retorna 0 linhas
    // mesmo havendo empresas ativas reais. Antes desta trava, o método
    // retornava silenciosamente `{ queued: [] }` como se fosse sucesso.
    const dataSource = {
      query: jest.fn().mockResolvedValue([]),
    } as unknown as DataSource;
    const configService = {} as ConfigService;
    const executionService = {} as DisasterRecoveryExecutionService;

    const service = new TenantBackupService(
      dataSource,
      configService,
      executionService,
    );

    await expect(service.backupAllActiveTenants()).rejects.toThrow(
      /Suspeita de contexto RLS ausente/,
    );
  });

  it('processa normalmente quando empresas ativas são encontradas', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ id: 'company-1' }]),
    } as unknown as DataSource;
    const configService = {} as ConfigService;
    const executionService = {} as DisasterRecoveryExecutionService;

    const service = new TenantBackupService(
      dataSource,
      configService,
      executionService,
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
