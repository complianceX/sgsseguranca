import { NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { ReportsController } from './reports.controller';
import type { ReportsService } from './reports.service';

type MockJob = {
  id: string;
  name: string;
  data: {
    companyId?: string;
    userId?: string;
    reportType?: string;
    params?: { month?: number; year?: number };
  };
  timestamp?: number;
  finishedOn?: number;
  failedReason?: string | null;
  attemptsMade: number;
  returnvalue?: unknown;
  getState: () => Promise<string>;
};

type QueueStatsResponse = {
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  delayed: number;
  total: number;
  scannedMaxPerState: number;
  warning: string;
};

type QueueListResponse = {
  items: Array<{
    id: string;
    state: string;
    failedReason?: string | null;
    result?: unknown;
  }>;
  page: number;
  limit: number;
  totalApprox: number;
  scannedMaxPerState: number;
  warning: string;
};

describe('ReportsController - tenant queue isolation', () => {
  let controller: ReportsController;
  let queue: Pick<Queue, 'getJob' | 'getJobs' | 'add'>;
  let reportsService: Pick<
    ReportsService,
    'findPaginated' | 'remove' | 'findOne'
  >;
  let getJob: jest.Mock;
  let getJobs: jest.Mock;
  let add: jest.Mock;
  let jobsByState: Record<string, MockJob[]>;

  const makeQueue = (): Pick<Queue, 'getJob' | 'getJobs' | 'add'> => ({
    getJob,
    getJobs,
    add,
  });

  const makeReportsService = (): Pick<
    ReportsService,
    'findPaginated' | 'remove' | 'findOne'
  > => ({
    findPaginated: jest.fn(),
    remove: jest.fn(),
    findOne: jest.fn(),
  });

  beforeEach(() => {
    getJob = jest.fn();
    getJobs = jest.fn();
    add = jest.fn();
    jobsByState = {};

    queue = makeQueue();
    reportsService = makeReportsService();

    controller = new ReportsController(
      queue as unknown as Queue,
      reportsService as unknown as ReportsService,
    );
  });

  const makeJob = (params: {
    id: string;
    companyId: string;
    state: string;
    timestamp?: number;
    result?: unknown;
  }): MockJob => ({
    id: params.id,
    name: 'generate',
    data: {
      companyId: params.companyId,
      reportType: 'monthly',
      params: { month: 3, year: 2026 },
    },
    timestamp: params.timestamp ?? Date.now(),
    finishedOn: (params.timestamp ?? Date.now()) + 1000,
    failedReason: null,
    attemptsMade: 1,
    returnvalue: params.result ?? null,
    getState: jest.fn().mockResolvedValue(params.state),
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('enfileira relatório mensal com jobId determinístico por tenant e período', async () => {
    add.mockResolvedValue({
      id: 'pdf-generation-monthly-company-1-2026-3-2026-04-27t12',
    });

    await expect(
      controller.generate(
        { user: { company_id: 'company-1', userId: 'user-1' } },
        { ano: 2026, mes: 3 },
      ),
    ).resolves.toEqual({
      jobId: 'pdf-generation-monthly-company-1-2026-3-2026-04-27t12',
      statusUrl:
        '/reports/status/pdf-generation-monthly-company-1-2026-3-2026-04-27t12',
    });

    expect(add).toHaveBeenCalledWith(
      'generate',
      expect.objectContaining({
        reportType: 'monthly',
        userId: 'user-1',
        companyId: 'company-1',
        params: { companyId: 'company-1', year: 2026, month: 3 },
      }),
      expect.objectContaining({
        jobId: expect.stringMatching(
          /^pdf-generation-monthly-company-1-2026-3-\d{4}-\d{2}-\d{2}t\d{2}$/,
        ) as unknown as string,
      }),
    );
  });

  it('permite consultar o proprio job', async () => {
    const job = makeJob({
      id: 'job-own',
      companyId: 'company-1',
      state: 'completed',
      result: { url: 'https://example.test/report.pdf' },
    });

    getJob.mockResolvedValue(job);

    await expect(
      controller.getStatus('job-own', {
        user: { company_id: 'company-1', userId: 'user-1' },
      }),
    ).resolves.toEqual({
      state: 'completed',
      result: { url: 'https://example.test/report.pdf' },
    });
  });

  it('nega acesso a job de outra empresa com NotFound', async () => {
    const job = makeJob({
      id: 'job-other',
      companyId: 'company-2',
      state: 'completed',
      result: { url: 'https://example.test/other.pdf' },
    });

    getJob.mockResolvedValue(job);

    await expect(
      controller.getStatus('job-other', {
        user: { company_id: 'company-1', userId: 'user-1' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lista apenas jobs do tenant autenticado', async () => {
    const ownNewest = makeJob({
      id: 'job-2',
      companyId: 'company-1',
      state: 'failed',
      timestamp: 200,
      result: { error: 'failed-own' },
    });
    ownNewest.failedReason = 'Falha interna';

    const otherTenant = makeJob({
      id: 'job-3',
      companyId: 'company-2',
      state: 'completed',
      timestamp: 300,
      result: { url: 'https://example.test/other.pdf' },
    });
    const ownOlder = makeJob({
      id: 'job-1',
      companyId: 'company-1',
      state: 'completed',
      timestamp: 100,
      result: { url: 'https://example.test/own.pdf' },
    });

    jobsByState = {
      completed: [ownOlder, otherTenant],
      failed: [ownNewest],
      active: [],
      wait: [],
      delayed: [],
    };
    getJobs.mockImplementation((states: string[]) => {
      const state = states[0];
      return Promise.resolve(jobsByState[state] ?? []);
    });

    const response = (await controller.listJobs(
      { page: 1, limit: 10 },
      {
        user: { company_id: 'company-1', userId: 'user-1' },
      },
    )) as QueueListResponse;

    expect(response.page).toBe(1);
    expect(response.limit).toBe(10);
    expect(response.totalApprox).toBe(2);
    expect(typeof response.scannedMaxPerState).toBe('number');
    expect(typeof response.warning).toBe('string');
    expect(response.items).toEqual([
      expect.objectContaining({
        id: 'job-2',
        state: 'failed',
        failedReason: 'Falha interna',
        result: { error: 'failed-own' },
      }),
      expect.objectContaining({
        id: 'job-1',
        state: 'completed',
        result: { url: 'https://example.test/own.pdf' },
      }),
    ]);
  });

  it('calcula stats sem vazar jobs de outros tenants', async () => {
    const activeOwn = makeJob({
      id: 'active-own',
      companyId: 'company-1',
      state: 'active',
    });
    const failedOwn = makeJob({
      id: 'failed-own',
      companyId: 'company-1',
      state: 'failed',
    });
    const otherWaiting = makeJob({
      id: 'other-waiting',
      companyId: 'company-2',
      state: 'wait',
    });
    const otherCompleted = makeJob({
      id: 'other-completed',
      companyId: 'company-2',
      state: 'completed',
    });

    jobsByState = {
      active: [activeOwn],
      failed: [failedOwn],
      wait: [otherWaiting],
      completed: [otherCompleted],
      delayed: [],
    };
    getJobs.mockImplementation((states: string[]) => {
      const state = states[0];
      return Promise.resolve(jobsByState[state] ?? []);
    });

    const stats = (await controller.getQueueStats({
      user: { company_id: 'company-1', userId: 'user-1' },
    })) as QueueStatsResponse;

    expect(stats.active).toBe(1);
    expect(stats.waiting).toBe(0);
    expect(stats.completed).toBe(0);
    expect(stats.failed).toBe(1);
    expect(stats.delayed).toBe(0);
    expect(stats.total).toBe(2);
    expect(typeof stats.scannedMaxPerState).toBe('number');
    expect(typeof stats.warning).toBe('string');
  });
});
