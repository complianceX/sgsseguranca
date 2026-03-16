import api from '@/lib/api';
import { dashboardService } from '@/services/dashboardService';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

describe('dashboardService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('degrada para fila vazia quando pending-queue retorna erro operacional', async () => {
    (api.get as jest.Mock).mockRejectedValue({
      response: { status: 500 },
    });

    await expect(dashboardService.getPendingQueue()).resolves.toEqual({
      degraded: true,
      failedSources: ['pending-queue'],
      summary: {
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        documents: 0,
        health: 0,
        actions: 0,
      },
      items: [],
    });
  });

  it('nao mascara erro de permissao como fila vazia', async () => {
    const permissionError = { response: { status: 403 } };
    (api.get as jest.Mock).mockRejectedValue(permissionError);

    await expect(dashboardService.getPendingQueue()).rejects.toBe(
      permissionError,
    );
  });
});
