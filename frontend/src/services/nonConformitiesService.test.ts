import api from '@/lib/api';
import { nonConformitiesService, NcStatus } from './nonConformitiesService';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockedApi = api as jest.Mocked<typeof api>;

describe('nonConformitiesService offline action policy', () => {
  const originalOnLine = navigator.onLine;

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: originalOnLine });
    jest.clearAllMocks();
  });

  it('blocks status and removal offline without pretending to queue them', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

    await expect(nonConformitiesService.updateStatus('nc-1', NcStatus.EM_ANDAMENTO)).rejects.toMatchObject({
      code: 'ERR_OFFLINE_ACTION_UNAVAILABLE',
      action: 'update-status',
    });
    await expect(nonConformitiesService.remove('nc-1')).rejects.toMatchObject({
      code: 'ERR_OFFLINE_ACTION_UNAVAILABLE',
      action: 'remove',
    });
    expect(mockedApi.patch).not.toHaveBeenCalled();
    expect(mockedApi.delete).not.toHaveBeenCalled();
  });
});
