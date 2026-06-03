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

  it('envia contexto tenant-scoped ao gerar sugestao de DDS', async () => {
    (api.post as jest.Mock).mockResolvedValue({
      data: { tema: 'DDS seguro', conteudo: 'Conteudo sugerido' },
    });

    await sophieService.generateDds(
      { contexto: 'atividade de campo' },
      'company-1',
    );

    expect(api.post).toHaveBeenCalledWith(
      '/ai/generate-dds',
      { contexto: 'atividade de campo' },
      {
        timeout: expect.any(Number),
        headers: { 'x-company-id': 'company-1' },
      },
    );
  });
});
