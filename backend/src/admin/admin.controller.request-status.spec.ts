import { NotFoundException } from '@nestjs/common';
import { AdminController } from './admin.controller';

describe('AdminController#getGDPRStatus', () => {
  const makeController = (status: unknown) => {
    const gdprDeletionService = {
      deleteUserData: jest.fn(),
      deleteExpiredData: jest.fn(),
      getDeleteRequestStatus: jest.fn().mockResolvedValue(status),
      getPendingRequests: jest.fn(),
      getRetentionCleanupRuns: jest.fn(),
    };

    return {
      controller: new AdminController(
        { refreshDashboard: jest.fn() } as never,
        gdprDeletionService as never,
        { validateRLSPolicies: jest.fn() } as never,
        { getFullHealthCheck: jest.fn() } as never,
      ),
      gdprDeletionService,
    };
  };

  it('retorna o status quando a requisição existe', async () => {
    const { controller } = makeController({ id: 'req-1', status: 'done' });

    await expect(
      controller.getGDPRStatus('11111111-1111-4111-8111-111111111111'),
    ).resolves.toEqual({ id: 'req-1', status: 'done' });
  });

  it('retorna 404 quando a requisição não existe', async () => {
    const { controller } = makeController(undefined);

    await expect(
      controller.getGDPRStatus('11111111-1111-4111-8111-111111111111'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
