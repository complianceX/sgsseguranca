import { DocumentInterpreterService } from './document-interpreter.service';

describe('DocumentInterpreterService', () => {
  const aiService = {
    generateJson: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('usa apenas heurísticas locais sem autorização explícita para IA externa', async () => {
    const service = new DocumentInterpreterService(aiService as never);

    const result = await service.interpretDocument(
      'Empresa: Acme\nCNPJ: 12.345.678/0001-90\nNR-35\nCapacete e cinto',
      'APR',
    );

    expect(aiService.generateJson).not.toHaveBeenCalled();
    expect(result.cnpj).toBe('12345678000190');
    expect(result.nrsCitadas).toContain('NR-35');
  });
});
