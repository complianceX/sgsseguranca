import api from '@/lib/api';
import { sophieService } from '@/services/sophieService';

jest.mock('@/lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('@/lib/featureFlags', () => ({
  isAiEnabled: () => true,
}));

describe('sophieService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retorna fallback local quando insights falham no backend', async () => {
    (api.post as jest.Mock).mockRejectedValue({
      response: { status: 500 },
    });

    const result = await sophieService.getInsights();

    expect(result).toEqual(
      expect.objectContaining({
        safetyScore: 0,
        confidence: 'low',
        insights: [],
      }),
    );
  });

  it('nao mascara erro de permissao do backend como fallback local', async () => {
    const permissionError = { response: { status: 403 } };
    (api.post as jest.Mock).mockRejectedValue(permissionError);

    await expect(sophieService.getInsights()).rejects.toBe(permissionError);
  });
});
