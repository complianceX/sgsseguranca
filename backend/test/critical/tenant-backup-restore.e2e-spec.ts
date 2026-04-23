import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Role } from '../../src/auth/enums/roles.enum';
import { TenantBackupService } from '../../src/disaster-recovery/tenant-backup.service';
import { createApr } from '../factories/apr.factory';
import { TestApp } from '../helpers/test-app';

const describeE2E =
  process.env.E2E_INFRA_AVAILABLE === 'false' ? describe.skip : describe;

function buildRestorePhrase(companyId: string): string {
  return `RESTORE ${companyId}`;
}

describeE2E('E2E Critical - Tenant backup/restore DR', () => {
  let testApp: TestApp;
  let backupRoot: string;
  let csrfHeaders: Record<string, string>;
  let tenantBackupService: TenantBackupService;
  const previousBackupRoot = process.env.TENANT_BACKUP_ROOT;

  beforeAll(async () => {
    backupRoot = path.join(tmpdir(), 'sgs-dr-e2e', randomUUID());
    process.env.TENANT_BACKUP_ROOT = backupRoot;

    testApp = await TestApp.create();
    await testApp.resetDatabase();
    csrfHeaders = await testApp.csrfHeaders();
    tenantBackupService = testApp.app.get(TenantBackupService);
  });

  afterAll(async () => {
    if (testApp) {
      await testApp.close();
    }
    await fs.rm(backupRoot, { recursive: true, force: true });

    if (previousBackupRoot === undefined) {
      delete process.env.TENANT_BACKUP_ROOT;
    } else {
      process.env.TENANT_BACKUP_ROOT = previousBackupRoot;
    }
  });

  it('deve exportar tenant, permitir perda lógica e restaurar dados no mesmo tenant', async () => {
    const adminSession = await testApp.loginAs(Role.ADMIN_EMPRESA, 'tenantA');
    const superAdminSession = await testApp.loginAs(
      Role.ADMIN_GERAL,
      'tenantA',
    );
    const tenantA = testApp.getTenant('tenantA');
    const tecnicA = testApp.getUser('tenantA', Role.TST);

    const createdApr = await createApr(testApp, adminSession, {
      numero: 'APR-DR-001',
      titulo: 'APR DR Restore',
      siteId: tenantA.siteId,
      elaboradorId: tecnicA.id,
    });
    expect(createdApr.id).toBeTruthy();

    const superAdminHeaders = testApp.authHeaders(superAdminSession);
    const backupTriggerResponse = await testApp
      .request()
      .post(`/admin/tenants/${tenantA.companyId}/backup`)
      .set(superAdminHeaders)
      .set(csrfHeaders);
    expect([200, 201]).toContain(backupTriggerResponse.status);

    let backupId = '';
    let backupFilePath = '';
    const backupBody = backupTriggerResponse.body as
      | {
          job_id?: string;
          mode?: 'inline';
          result?: { backupId?: string; filePath?: string };
        }
      | undefined;

    if (backupBody?.mode === 'inline') {
      backupId = String(backupBody.result?.backupId ?? '');
      backupFilePath = String(backupBody.result?.filePath ?? '');
    } else if (backupBody?.job_id) {
      const materialized = await tenantBackupService.backupTenant(
        tenantA.companyId,
        {
          triggerSource: 'manual',
          requestedByUserId: superAdminSession.userId,
        },
      );
      backupId = materialized.backupId;
      backupFilePath = materialized.filePath;
    }

    if (!backupId || !backupFilePath) {
      const materialized = await tenantBackupService.backupTenant(
        tenantA.companyId,
        {
          triggerSource: 'manual',
          requestedByUserId: superAdminSession.userId,
        },
      );
      backupId = materialized.backupId;
      backupFilePath = materialized.filePath;
    }

    expect(backupId.length).toBeGreaterThan(5);
    expect(backupFilePath.length).toBeGreaterThan(10);

    const backupListResponse = await testApp
      .request()
      .get(`/admin/tenants/${tenantA.companyId}/backups`)
      .set(superAdminHeaders);
    expect(backupListResponse.status).toBe(200);
    const listBody = backupListResponse.body as Array<{ backupId?: string }>;
    expect(Array.isArray(listBody)).toBe(true);
    expect(listBody.some((item) => item.backupId === backupId)).toBe(true);

    const deleteResponse = await testApp
      .request()
      .delete(`/aprs/${createdApr.id}`)
      .set(testApp.authHeaders(adminSession))
      .set(csrfHeaders);
    expect(deleteResponse.status).toBe(200);

    const missingAfterDelete = await testApp
      .request()
      .get(`/aprs/${createdApr.id}`)
      .set(testApp.authHeaders(adminSession));
    expect(missingAfterDelete.status).toBe(404);

    const deletedRowsRaw: unknown = await testApp.dataSource.query(
      'SELECT deleted_at FROM aprs WHERE id = $1',
      [createdApr.id],
    );
    expect(Array.isArray(deletedRowsRaw)).toBe(true);
    if (!Array.isArray(deletedRowsRaw)) {
      throw new Error('Expected query result to be an array');
    }
    const deletedRows = deletedRowsRaw as Array<{
      deleted_at?: string | null;
    }>;
    expect(deletedRows[0]?.deleted_at).toBeTruthy();

    const restoreResponse = await testApp
      .request()
      .post(`/admin/tenants/${tenantA.companyId}/restore`)
      .set(superAdminHeaders)
      .set(csrfHeaders)
      .field('mode', 'overwrite_same_tenant')
      .field('backup_id', backupId)
      .field('confirm_company_id', tenantA.companyId)
      .field('confirm_phrase', buildRestorePhrase(tenantA.companyId))
      .attach('file', backupFilePath);
    expect([200, 201]).toContain(restoreResponse.status);

    const restoreBody = restoreResponse.body as
      | {
          mode?: 'inline';
          result?: {
            targetCompanyId?: string;
            mode?: 'overwrite_same_tenant' | 'clone_to_new_tenant';
          };
        }
      | undefined;

    expect(restoreBody?.mode).toBe('inline');
    expect(restoreBody?.result?.mode).toBe('overwrite_same_tenant');
    expect(restoreBody?.result?.targetCompanyId).toBe(tenantA.companyId);

    const restoredAprResponse = await testApp
      .request()
      .get(`/aprs/${createdApr.id}`)
      .set(testApp.authHeaders(adminSession));
    expect(restoredAprResponse.status).toBe(200);
    const restoredApr = restoredAprResponse.body as {
      id?: string;
      titulo?: string;
    };
    expect(restoredApr.id).toBe(createdApr.id);
    expect(restoredApr.titulo).toBe('APR DR Restore');

    const restoredRowsRaw: unknown = await testApp.dataSource.query(
      'SELECT deleted_at FROM aprs WHERE id = $1',
      [createdApr.id],
    );
    expect(Array.isArray(restoredRowsRaw)).toBe(true);
    if (!Array.isArray(restoredRowsRaw)) {
      throw new Error('Expected query result to be an array');
    }
    const restoredRows = restoredRowsRaw as Array<{
      deleted_at?: string | null;
    }>;
    expect(restoredRows[0]?.deleted_at ?? null).toBeNull();
  }, 120_000);
});
