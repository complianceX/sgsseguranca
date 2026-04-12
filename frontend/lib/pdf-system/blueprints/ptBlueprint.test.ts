import { drawPtBlueprint } from './ptBlueprint';

const drawDocumentIdentityRail = jest.fn();
const drawExecutiveSummaryStrip = jest.fn();
const drawGovernanceClosingBlock = jest.fn().mockResolvedValue(undefined);
const drawMetadataGrid = jest.fn();
const drawNarrativeSection = jest.fn();
const drawChecklistTable = jest.fn();
const drawParticipantTable = jest.fn();

jest.mock('../components', () => ({
  drawDocumentIdentityRail: (...args: unknown[]) =>
    drawDocumentIdentityRail(...args),
  drawExecutiveSummaryStrip: (...args: unknown[]) =>
    drawExecutiveSummaryStrip(...args),
  drawGovernanceClosingBlock: (...args: unknown[]) =>
    drawGovernanceClosingBlock(...args),
  drawMetadataGrid: (...args: unknown[]) => drawMetadataGrid(...args),
  drawNarrativeSection: (...args: unknown[]) => drawNarrativeSection(...args),
}));

jest.mock('../tables', () => ({
  drawChecklistTable: (...args: unknown[]) => drawChecklistTable(...args),
  drawParticipantTable: (...args: unknown[]) => drawParticipantTable(...args),
}));

describe('drawPtBlueprint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders only the checklist groups enabled for the PT activity flags', async () => {
    await drawPtBlueprint(
      {} as never,
      jest.fn() as never,
      {
        id: 'pt-1',
        numero: 'PT-001',
        titulo: 'Manutenção em altura',
        descricao: 'Troca de luminária',
        data_hora_inicio: '2026-03-16T08:00:00.000Z',
        data_hora_fim: '2026-03-16T12:00:00.000Z',
        status: 'Pendente',
        company_id: 'company-1',
        site_id: 'site-1',
        responsavel_id: 'user-1',
        executantes: [{ id: 'user-1', nome: 'João' }],
        trabalho_altura: true,
        espaco_confinado: false,
        trabalho_quente: false,
        eletricidade: false,
        escavacao: false,
        trabalho_altura_checklist: [{ id: 'a', pergunta: 'Linha de vida', resposta: 'Sim' }],
        trabalho_eletrico_checklist: [{ id: 'b', pergunta: 'Bloqueio', resposta: 'Sim' }],
        trabalho_quente_checklist: [{ id: 'c', pergunta: 'Extintor', resposta: 'Sim' }],
        trabalho_espaco_confinado_checklist: [{ id: 'd', pergunta: 'Atmosfera', resposta: 'Sim' }],
        trabalho_escavacao_checklist: [{ id: 'e', pergunta: 'Escoramento', resposta: 'Sim' }],
        created_at: '2026-03-16T08:00:00.000Z',
        updated_at: '2026-03-16T08:00:00.000Z',
        site: { nome: 'Obra Norte' },
        responsavel: { nome: 'Responsável' },
      } as never,
      [],
      'PT-2026-001',
      'https://example.com/verify/PT-2026-001',
    );

    expect(drawChecklistTable).toHaveBeenCalledTimes(1);
    expect(drawChecklistTable).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'Checklist trabalho em altura',
      expect.anything(),
      expect.anything(),
    );
  });

  it('keeps rendering a legacy checklist group with meaningful answers when flags are absent', async () => {
    await drawPtBlueprint(
      {} as never,
      jest.fn() as never,
      {
        id: 'pt-legacy',
        numero: 'PT-LEG-1',
        titulo: 'PT legada',
        descricao: 'Documento legado',
        data_hora_inicio: '2026-03-16T08:00:00.000Z',
        data_hora_fim: '2026-03-16T12:00:00.000Z',
        status: 'Aprovada',
        company_id: 'company-1',
        site_id: 'site-1',
        responsavel_id: 'user-1',
        executantes: [],
        trabalho_altura: false,
        espaco_confinado: false,
        trabalho_quente: false,
        eletricidade: false,
        escavacao: false,
        trabalho_altura_checklist: [{ id: 'a', pergunta: 'Linha de vida' }],
        trabalho_eletrico_checklist: [{ id: 'b', pergunta: 'Bloqueio', resposta: 'Sim' }],
        trabalho_quente_checklist: [{ id: 'c', pergunta: 'Extintor' }],
        trabalho_espaco_confinado_checklist: [{ id: 'd', pergunta: 'Atmosfera' }],
        trabalho_escavacao_checklist: [{ id: 'e', pergunta: 'Escoramento' }],
        created_at: '2026-03-16T08:00:00.000Z',
        updated_at: '2026-03-16T08:00:00.000Z',
      } as never,
      [],
      'PT-LEG-2026-001',
      'https://example.com/verify/PT-LEG-2026-001',
    );

    expect(drawChecklistTable).toHaveBeenCalledTimes(1);
    expect(drawChecklistTable).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'Checklist trabalho elétrico',
      expect.anything(),
      expect.anything(),
    );
  });
});
