import { GdprRetentionCleanupScheduler } from './gdpr-retention-cleanup.scheduler';

describe('GdprRetentionCleanupScheduler', () => {
  const originalApiCronsDisabled = process.env.API_CRONS_DISABLED;

  afterEach(() => {
    process.env.API_CRONS_DISABLED = originalApiCronsDisabled;
    jest.clearAllMocks();
  });

  it('executa limpeza LGPD agendada com metadados de worker', async () => {
    const gdprDeletionService = {
      deleteExpiredData: jest.fn().mockResolvedValue({
        status: 'success',
        run_id: 'run-1',
        total_rows_deleted: 3,
      }),
    };

    const scheduler = new GdprRetentionCleanupScheduler(
      gdprDeletionService as never,
    );

    await scheduler.runDailyCleanup();

    expect(gdprDeletionService.deleteExpiredData).toHaveBeenCalledWith({
      triggeredBy: 'scheduled',
      triggerSource: 'worker:gdpr-retention-cleanup',
    });
  });

  it('nao executa quando API_CRONS_DISABLED=true', async () => {
    process.env.API_CRONS_DISABLED = 'true';
    const gdprDeletionService = { deleteExpiredData: jest.fn() };
    const scheduler = new GdprRetentionCleanupScheduler(
      gdprDeletionService as never,
    );

    await scheduler.runDailyCleanup();

    expect(gdprDeletionService.deleteExpiredData).not.toHaveBeenCalled();
  });
});
