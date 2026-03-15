import { CleanupTask } from './cleanup.task';

describe('CleanupTask', () => {
  const originalRedisDisabled = process.env.REDIS_DISABLED;
  const originalApiCronsDisabled = process.env.API_CRONS_DISABLED;

  afterEach(() => {
    process.env.REDIS_DISABLED = originalRedisDisabled;
    process.env.API_CRONS_DISABLED = originalApiCronsDisabled;
    jest.clearAllMocks();
  });

  it('nao tenta enfileirar notificacoes quando REDIS_DISABLED=true', async () => {
    process.env.REDIS_DISABLED = 'true';
    const auditLogRepository = { delete: jest.fn() };
    const slaQueue = { add: jest.fn() };
    const expiryQueue = { add: jest.fn() };
    const companiesService = { findAllActive: jest.fn() };

    const task = new CleanupTask(
      auditLogRepository as never,
      slaQueue as never,
      expiryQueue as never,
      companiesService as never,
    );

    await task.runExpiryNotifications();
    await task.runCorrectiveActionsSlaEscalation();

    expect(companiesService.findAllActive).not.toHaveBeenCalled();
    expect(expiryQueue.add).not.toHaveBeenCalled();
    expect(slaQueue.add).not.toHaveBeenCalled();
  });

  it('nao executa crons quando API_CRONS_DISABLED=true', async () => {
    process.env.API_CRONS_DISABLED = 'true';
    const auditLogRepository = { delete: jest.fn() };
    const slaQueue = { add: jest.fn() };
    const expiryQueue = { add: jest.fn() };
    const companiesService = { findAllActive: jest.fn() };

    const task = new CleanupTask(
      auditLogRepository as never,
      slaQueue as never,
      expiryQueue as never,
      companiesService as never,
    );

    await task.cleanupOldLogs();
    task.generateWeeklyReports();
    await task.runExpiryNotifications();
    await task.runCorrectiveActionsSlaEscalation();

    expect(auditLogRepository.delete).not.toHaveBeenCalled();
    expect(companiesService.findAllActive).not.toHaveBeenCalled();
    expect(expiryQueue.add).not.toHaveBeenCalled();
    expect(slaQueue.add).not.toHaveBeenCalled();
  });
});
