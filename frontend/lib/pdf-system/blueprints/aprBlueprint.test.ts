import { drawAprBlueprint, resolveAprRiskRows } from './aprBlueprint';

const drawDocumentIdentityRail = jest.fn();
const drawEvidenceGallery = jest.fn().mockResolvedValue(undefined);
const drawExecutiveSummaryStrip = jest.fn();
const drawGovernanceClosingBlock = jest.fn().mockResolvedValue(undefined);
const drawMetadataGrid = jest.fn();
const drawNarrativeSection = jest.fn();
const drawParticipantTable = jest.fn();
const drawRiskTable = jest.fn();

jest.mock('../components', () => ({
  drawDocumentIdentityRail: (...args: unknown[]) => drawDocumentIdentityRail(...args),
  drawEvidenceGallery: (...args: unknown[]) => drawEvidenceGallery(...args),
  drawExecutiveSummaryStrip: (...args: unknown[]) => drawExecutiveSummaryStrip(...args),
  drawGovernanceClosingBlock: (...args: unknown[]) => drawGovernanceClosingBlock(...args),
  drawMetadataGrid: (...args: unknown[]) => drawMetadataGrid(...args),
  drawNarrativeSection: (...args: unknown[]) => drawNarrativeSection(...args),
}));

jest.mock('../tables', () => ({
  drawParticipantTable: (...args: unknown[]) => drawParticipantTable(...args),
  drawRiskTable: (...args: unknown[]) => drawRiskTable(...args),
}));

describe('resolveAprRiskRows', () => {
  it('usa itens_risco como fallback quando risk_items não existe', () => {
    const rows = resolveAprRiskRows({
      itens_risco: [
        {
          atividade_processo: 'Montagem de linha',
          agente_ambiental: 'Queda',
          condicao_perigosa: 'Trabalho em altura',
          probabilidade: '3',
          severidade: '4',
          categoria_risco: 'Critico',
          medidas_prevencao: 'Linha de vida e talabarte',
        },
      ],
    } as never);

    expect(rows).toEqual([
      expect.objectContaining({
        activity: 'Montagem de linha',
        hazard: 'Agente: Queda • Condição: Trabalho em altura',
        score: 12,
        level: 'Critico',
        control: 'Medidas: Linha de vida e talabarte',
      }),
    ]);
  });
});

describe('drawAprBlueprint', () => {
  const createPdfContextMock = () =>
    ({
      doc: {
        setDrawColor: jest.fn(),
        setLineWidth: jest.fn(),
        rect: jest.fn(),
        setFont: jest.fn(),
        setFontSize: jest.fn(),
        setTextColor: jest.fn(),
        text: jest.fn(),
        roundedRect: jest.fn(),
        setFillColor: jest.fn(),
        addPage: jest.fn(),
      },
      pageWidth: 297,
      pageHeight: 210,
      margin: 10,
      contentWidth: 277,
      y: 20,
      pageTop: 20,
      theme: {
        tone: {
          border: [210, 210, 210],
          surfaceMuted: [240, 244, 248],
          brand: [16, 132, 132],
          textPrimary: [20, 20, 20],
        },
        typography: {
          headingSm: 10,
        },
        spacing: {
          sectionGap: 4,
        },
      },
    }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('monta a matriz pelo itens_risco e inclui a galeria de evidências', async () => {
    const resolveImageDataUrl = jest.fn().mockResolvedValue('data:image/jpeg;base64,AAA');

    await drawAprBlueprint(
      createPdfContextMock(),
      jest.fn() as never,
      {
        id: 'apr-1',
        numero: 'APR-001',
        titulo: 'Troca de luminárias',
        descricao: 'Execução em área industrial.',
        data_inicio: '2026-03-16',
        data_fim: '2026-03-17',
        status: 'Aprovada',
        versao: 2,
        company: { razao_social: 'Gandra' },
        site: { nome: 'Obra Sul' },
        elaborador: { nome: 'Maria' },
        participants: [{ nome: 'Joao' }],
        classificacao_resumo: {
          total: 1,
          aceitavel: 0,
          atencao: 0,
          substancial: 0,
          critico: 1,
        },
        itens_risco: [
          {
            atividade_processo: 'Troca de luminárias',
            agente_ambiental: 'Eletricidade',
            condicao_perigosa: 'Circuito energizado',
            probabilidade: '2',
            severidade: '4',
            categoria_risco: 'Critico',
            medidas_prevencao: 'Bloqueio e etiquetagem',
          },
        ],
      } as never,
      [
        {
          type: 'digital',
          user: { nome: 'Joao' },
          signed_at: '2026-03-16T10:00:00.000Z',
          created_at: '2026-03-16T10:00:00.000Z',
          signature_data: 'assinatura',
        },
      ] as never,
      'APR-2026-APR001',
      'https://example.com/validar/APR-2026-APR001',
      [
        {
          id: 'evidence-1',
          apr_risk_item_id: 'risk-item-1',
          original_name: 'quadro-eletrico.jpg',
          uploaded_at: '2026-03-16T09:30:00.000Z',
          captured_at: '2026-03-16T09:20:00.000Z',
          url: 'https://example.com/evidence-1.jpg',
          risk_item_ordem: 0,
        },
      ],
      resolveImageDataUrl,
    );

    expect(drawRiskTable).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [
        expect.objectContaining({
          activity: 'Troca de luminárias',
          hazard: 'Agente: Eletricidade • Condição: Circuito energizado',
          score: 8,
          level: 'Critico',
        }),
      ],
      expect.anything(),
    );

    expect(drawEvidenceGallery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: 'Evidências visuais',
        items: [
          expect.objectContaining({
            title: 'quadro-eletrico.jpg',
            source: 'https://example.com/evidence-1.jpg',
          }),
        ],
      }),
    );

    const galleryOptions = drawEvidenceGallery.mock.calls[0]?.[1];
    await galleryOptions.resolveImageDataUrl(galleryOptions.items[0], 0);
    expect(resolveImageDataUrl).toHaveBeenCalled();
  });
});
