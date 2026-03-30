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
    getJobs.mockImplementation(async (states: string[]) => {
      const state = states[0];
      return jobsByState[state] ?? [];
    });

    const response = await controller.listJobs(
      1,
      10,
      {
        user: { company_id: 'company-1', userId: 'user-1' },
      },
    );

    expect(response).toEqual({
      items: [
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
      ],
      page: 1,
      limit: 10,
      totalApprox: 2,
      scannedMaxPerState: expect.any(Number),
      warning: expect.any(String),
    });
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
    getJobs.mockImplementation(async (states: string[]) => {
      const state = states[0];
      return jobsByState[state] ?? [];
    });

    await expect(
      controller.getQueueStats({
        user: { company_id: 'company-1', userId: 'user-1' },
      }),
    ).resolves.toEqual({
      active: 1,
      waiting: 0,
      completed: 0,
      failed: 1,
      delayed: 0,
      total: 2,
      scannedMaxPerState: expect.any(Number),
      warning: expect.any(String),
    });
  });
});
