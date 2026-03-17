import { DocumentClassifierService } from './document-classifier.service';

describe('DocumentClassifierService', () => {
  const aiService = {
    generateJson: jest.fn(),
  };

  let service: DocumentClassifierService;

  beforeEach(() => {
    jest.clearAllMocks();
    aiService.generateJson.mockRejectedValue(new Error('AI indisponivel'));
    service = new DocumentClassifierService(aiService as never);
  });

  it('classifica PT por palavras-chave quando a IA falha', async () => {
    const result = await service.classifyDocument(
      'Permissao de Trabalho para trabalho em altura com liberacao da atividade e uso de EPI.',
    );

    expect(result.tipoDocumento).toBe('PT');
    expect(result.score).toBeGreaterThan(0.3);
  });

  it('classifica DDS por palavras-chave quando a IA falha', async () => {
    const result = await service.classifyDocument(
      'Dialogo Diario de Seguranca com tema, facilitador e participantes registrados.',
    );

    expect(result.tipoDocumento).toBe('DDS');
    expect(result.score).toBeGreaterThan(0.3);
  });

  it('expõe a descrição correta para relatório fotográfico', () => {
    expect(service.getDocumentTypeDescription('INSPECTION')).toBe(
      'Relatório Fotográfico de Inspeção',
    );
  });
});
