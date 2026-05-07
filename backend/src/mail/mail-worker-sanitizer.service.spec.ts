import { MailService } from './mail.service';
import { MailWorkerSanitizerService } from './mail-worker-sanitizer.service';

describe('MailWorkerSanitizerService', () => {
  const buildJob = (
    input: Partial<{
      failedReason: string;
      data: unknown;
    }> = {},
  ) => ({
    failedReason: input.failedReason,
    data: input.data,
    remove: jest.fn().mockResolvedValue(undefined),
  });

  it('remove residuos MAIL_DISABLED do failed e da mail-dlq no boot', async () => {
    const failedJob = buildJob({
      failedReason:
        'Envio de e-mail desabilitado por MAIL_ENABLED=false neste runtime.',
    });
    const dlqJob = buildJob({
      data: {
        error: {
          message:
            'Envio de e-mail desabilitado por MAIL_ENABLED=false neste runtime.',
        },
      },
    });

    const mailQueue = {
      getJobCounts: jest.fn().mockResolvedValue({ failed: 1 }),
      getJobs: jest.fn().mockResolvedValue([failedJob]),
    };
    const mailDlqQueue = {
      getJobCounts: jest.fn().mockResolvedValue({ wait: 1, failed: 0 }),
      getJobs: jest
        .fn()
        .mockResolvedValueOnce([dlqJob])
        .mockResolvedValueOnce([]),
    };
    const mailService = {
      isDeliveryEnabled: jest.fn().mockReturnValue(false),
    } as Pick<MailService, 'isDeliveryEnabled'> as MailService;

    const service = new MailWorkerSanitizerService(
      mailQueue as never,
      mailDlqQueue as never,
      mailService,
    );

    await service.onModuleInit();

    expect(failedJob.remove).toHaveBeenCalledTimes(1);
    expect(dlqJob.remove).toHaveBeenCalledTimes(1);
  });

  it('nao remove nada quando o runtime de e-mail esta habilitado', async () => {
    const mailQueue = {
      getJobCounts: jest.fn(),
      getJobs: jest.fn(),
    };
    const mailDlqQueue = {
      getJobCounts: jest.fn(),
      getJobs: jest.fn(),
    };
    const mailService = {
      isDeliveryEnabled: jest.fn().mockReturnValue(true),
    } as Pick<MailService, 'isDeliveryEnabled'> as MailService;

    const service = new MailWorkerSanitizerService(
      mailQueue as never,
      mailDlqQueue as never,
      mailService,
    );

    await service.onModuleInit();

    expect(mailQueue.getJobCounts).not.toHaveBeenCalled();
    expect(mailDlqQueue.getJobCounts).not.toHaveBeenCalled();
  });
});
