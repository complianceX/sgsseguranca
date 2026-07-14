import { TenantBackupProcessor } from './tenant-backup.processor';
import { TenantBackupService } from './tenant-backup.service';
import { TenantService } from '../../shared/tenant/tenant.service';
import type { Job } from 'bullmq';
import type { TenantBackupJobData } from './tenant-backup.types';

describe('TenantBackupProcessor', () => {
  function makeProcessor() {
    const tenantBackupService = {
      backupTenant: jest.fn().mockResolvedValue({}),
      backupAllActiveTenants: jest.fn().mockResolvedValue({ queued: [] }),
      restoreBackup: jest.fn().mockResolvedValue({}),
      pruneBackups: jest.fn().mockResolvedValue({}),
    } as unknown as TenantBackupService;

    const tenantService = {
      run: jest.fn((_ctx: unknown, callback: () => unknown) => callback()),
    } as unknown as TenantService;

    const processor = new TenantBackupProcessor(
      tenantBackupService,
      tenantService,
    );

    return { processor, tenantBackupService, tenantService };
  }

  function makeJob(data: TenantBackupJobData): Job<TenantBackupJobData> {
    return { id: 'job-1', data } as unknown as Job<TenantBackupJobData>;
  }

  it('executa backup_all_active_tenants dentro de contexto super-admin', async () => {
    // Regressão: este processor roda fora de qualquer request HTTP (sem
    // TenantInterceptor). companies/aprs/pts/... têm RLS FORCE — sem
    // isSuperAdmin=true no contexto, toda leitura via dataSource.query()
    // retorna 0 linhas silenciosamente e o backup diário "termina com
    // sucesso" vazio (confirmado empiricamente contra produção).
    const { processor, tenantService } = makeProcessor();
    const job = makeJob({
      type: 'backup_all_active_tenants',
      triggerSource: 'scheduled_daily',
      requestedByUserId: undefined,
    });

    await processor.process(job);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(tenantService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: undefined,
        isSuperAdmin: true,
        siteScope: 'all',
      }),
      expect.any(Function),
    );
  });

  it('executa backup_tenant dentro de contexto super-admin', async () => {
    const { processor, tenantService, tenantBackupService } = makeProcessor();
    const job = makeJob({
      type: 'backup_tenant',
      companyId: 'company-1',
      triggerSource: 'manual',
      requestedByUserId: 'user-1',
    });

    await processor.process(job);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(tenantService.run).toHaveBeenCalledWith(
      expect.objectContaining({ isSuperAdmin: true }),
      expect.any(Function),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(tenantBackupService.backupTenant).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({ triggerSource: 'manual' }),
    );
  });

  it('executa prune_tenant_backups dentro de contexto super-admin', async () => {
    const { processor, tenantService } = makeProcessor();
    const job = makeJob({ type: 'prune_tenant_backups' });

    await processor.process(job);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(tenantService.run).toHaveBeenCalledWith(
      expect.objectContaining({ isSuperAdmin: true }),
      expect.any(Function),
    );
  });
});
