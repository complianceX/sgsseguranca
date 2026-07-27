import type { Repository } from 'typeorm';
import type { ForensicTrailService } from '../forensic-trail/forensic-trail.service';
import type { PrivilegedDbService } from '../../shared/database/privileged-db.service';
import type { TenantService } from '../../shared/tenant/tenant.service';
import { DisasterRecoveryExecutionService } from './disaster-recovery-execution.service';
import { DisasterRecoveryExecution } from './entities/disaster-recovery-execution.entity';

const EXECUTION_ID = '550e8400-e29b-41d4-a716-446655440000';

function buildExecution(
  overrides: Partial<DisasterRecoveryExecution> = {},
): DisasterRecoveryExecution {
  return Object.assign(new DisasterRecoveryExecution(), {
    id: EXECUTION_ID,
    operation_type: 'database_backup',
    scope: 'database',
    environment: 'production',
    target_environment: null,
    status: 'running',
    trigger_source: 'manual',
    requested_by_user_id: null,
    backup_name: null,
    artifact_path: null,
    artifact_storage_key: null,
    error_message: null,
    metadata: { mode: 'tenant' },
    started_at: new Date('2026-07-27T10:00:00.000Z'),
    completed_at: null,
    created_at: new Date('2026-07-27T10:00:00.000Z'),
    updated_at: new Date('2026-07-27T10:00:00.000Z'),
    ...overrides,
  });
}

function createHarness(privilegedEnabled: boolean) {
  const repository = {
    create: jest.fn((value: Partial<DisasterRecoveryExecution>) =>
      Object.assign(new DisasterRecoveryExecution(), value),
    ),
    save: jest.fn((value: DisasterRecoveryExecution) =>
      Promise.resolve(Object.assign(value, { id: value.id || EXECUTION_ID })),
    ),
    findOneByOrFail: jest.fn(() => Promise.resolve(buildExecution())),
  };
  const forensicTrailService = {
    append: jest.fn(() => Promise.resolve({ id: 'forensic-event' })),
  };
  const tenantService = {
    run: jest.fn(
      (
        _context: Record<string, unknown>,
        callback: () => Promise<DisasterRecoveryExecution>,
      ) => callback(),
    ),
  };
  const client = {
    query: jest.fn(),
  };
  const privilegedDb = {
    isEnabled: jest.fn(() => privilegedEnabled),
    withPrivilegedClient: jest.fn(
      (
        callback: (input: typeof client) => Promise<DisasterRecoveryExecution>,
      ) => callback(client),
    ),
  };

  const service = new DisasterRecoveryExecutionService(
    repository as unknown as Repository<DisasterRecoveryExecution>,
    forensicTrailService as unknown as ForensicTrailService,
    tenantService as unknown as TenantService,
    privilegedDb as unknown as PrivilegedDbService,
  );

  return {
    service,
    repository,
    forensicTrailService,
    tenantService,
    client,
    privilegedDb,
  };
}

describe('DisasterRecoveryExecutionService', () => {
  it('persiste o início pela conexão privilegiada após o REVOKE de sgs_app', async () => {
    const harness = createHarness(true);
    harness.client.query.mockResolvedValue({
      rows: [buildExecution()],
    });

    const result = await harness.service.startExecution({
      operationType: 'database_backup',
      scope: 'database',
      environment: 'production',
      triggerSource: 'manual',
      metadata: { mode: 'tenant' },
    });

    expect(result.id).toBe(EXECUTION_ID);
    expect(harness.privilegedDb.withPrivilegedClient).toHaveBeenCalledTimes(1);
    expect(harness.client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "disaster_recovery_executions"'),
      expect.any(Array),
    );
    expect(harness.repository.save).not.toHaveBeenCalled();
    expect(harness.forensicTrailService.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'dr_execution_started',
        entityId: EXECUTION_ID,
      }),
      { isSuperAdmin: true },
    );
  });

  it('finaliza a execução pela conexão privilegiada e preserva o metadata', async () => {
    const harness = createHarness(true);
    harness.client.query.mockResolvedValue({
      rows: [
        buildExecution({
          status: 'success',
          backup_name: 'tenant-backup',
          metadata: { mode: 'tenant', rowCounts: { companies: 1 } },
          completed_at: new Date('2026-07-27T10:01:00.000Z'),
        }),
      ],
    });

    const result = await harness.service.finalizeExecution(EXECUTION_ID, {
      status: 'success',
      backupName: 'tenant-backup',
      metadata: { rowCounts: { companies: 1 } },
    });

    expect(result.status).toBe('success');
    expect(harness.client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "disaster_recovery_executions"'),
      expect.arrayContaining([EXECUTION_ID, 'success', 'tenant-backup']),
    );
    expect(harness.repository.findOneByOrFail).not.toHaveBeenCalled();
    expect(harness.repository.save).not.toHaveBeenCalled();
    expect(harness.forensicTrailService.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'dr_execution_completed',
        entityId: EXECUTION_ID,
      }),
      { isSuperAdmin: true },
    );
  });

  it('mantém o fallback legado quando DATABASE_ADMIN_URL não está configurada', async () => {
    const harness = createHarness(false);

    const result = await harness.service.startExecution({
      operationType: 'database_backup',
      scope: 'database',
      environment: 'test',
      triggerSource: 'manual',
    });

    expect(result.id).toBe(EXECUTION_ID);
    expect(harness.repository.create).toHaveBeenCalledTimes(1);
    expect(harness.repository.save).toHaveBeenCalledTimes(1);
    expect(harness.privilegedDb.withPrivilegedClient).not.toHaveBeenCalled();
  });
});
