import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MailDlqService } from './mail-dlq.service';

describe('MailDlqService', () => {
  const createDlqJob = (overrides?: Partial<Record<string, unknown>>) => {
    const data = {
      originalQueue: 'mail',
      originalJobId: 'job-1',
      originalJobName: 'send-file-key',
      attemptsMade: 5,
      companyId: 'company-a',
      data: {
        fileKey: 'uploads/mail/company-a/documento.pdf',
        email: 'user@example.com',
      },
      error: {
        message: 'Nenhum provedor de e-mail configurado.',
      },
      failedAt: '2026-04-01T14:33:54.082Z',
      ...overrides,
    };

    return {
      id: 'dlq-1',
      data,
      remove: jest.fn().mockResolvedValue(undefined),
    };
  };

  let mailQueue: { add: jest.Mock };
  let mailDlqQueue: {
    getJobCounts: jest.Mock;
    getJobs: jest.Mock;
    getJob: jest.Mock;
  };
  let mailService: {
    hasConfiguredProvider: jest.Mock;
    getConfiguredProvider: jest.Mock;
  };
  let service: MailDlqService;

  beforeEach(() => {
    mailQueue = {
      add: jest.fn().mockResolvedValue({ id: 'retried-1' }),
    };
    mailDlqQueue = {
      getJobCounts: jest
        .fn()
        .mockResolvedValue({ wait: 1, failed: 0, active: 0, completed: 0 }),
      getJobs: jest
        .fn()
        .mockImplementation((states: string[]) =>
          Promise.resolve(states.includes('wait') ? [createDlqJob()] : []),
        ),
      getJob: jest.fn().mockResolvedValue(createDlqJob()),
    };
    mailService = {
      hasConfiguredProvider: jest.fn().mockReturnValue(true),
      getConfiguredProvider: jest.fn().mockReturnValue('smtp'),
    };

    service = new MailDlqService(
      mailQueue as never,
      mailDlqQueue as never,
      mailService as never,
    );
  });

  it('lista jobs do DLQ respeitando tenant do usuário', async () => {
    const result = await service.list({
      currentCompanyId: 'company-a',
      isSuperAdmin: false,
      page: 1,
      pageSize: 10,
    });

    expect(result.provider).toBe('smtp');
    expect(result.counts.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      companyId: 'company-a',
      recipient: 'user@example.com',
      fileKey: 'uploads/mail/company-a/documento.pdf',
      originalJobName: 'send-file-key',
    });
  });

  it('reenfileira job do DLQ quando provider está configurado', async () => {
    const job = createDlqJob();
    mailDlqQueue.getJob.mockResolvedValue(job);

    const result = await service.retry('dlq-1', {
      currentCompanyId: 'company-a',
      isSuperAdmin: false,
      actorId: 'user-1',
    });

    expect(mailQueue.add).toHaveBeenCalledWith(
      'send-file-key',
      {
        fileKey: 'uploads/mail/company-a/documento.pdf',
        email: 'user@example.com',
      },
      expect.any(Object),
    );
    expect(job.remove).toHaveBeenCalled();
    expect(result).toMatchObject({
      dlqJobId: 'dlq-1',
      retriedJobId: 'retried-1',
      provider: 'smtp',
    });
  });

  it('bloqueia retry entre tenants', async () => {
    await expect(
      service.retry('dlq-1', {
        currentCompanyId: 'company-b',
        isSuperAdmin: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bloqueia retry sem provedor configurado', async () => {
    mailService.hasConfiguredProvider.mockReturnValue(false);

    await expect(
      service.retry('dlq-1', {
        currentCompanyId: 'company-a',
        isSuperAdmin: false,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
