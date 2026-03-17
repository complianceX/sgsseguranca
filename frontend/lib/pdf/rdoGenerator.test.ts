import { buildRdoDocumentCode, generateRdoPdf } from './rdoGenerator';
import type { Rdo } from '@/services/rdosService';

const baseRdo: Rdo = {
  id: 'abcdef12-3456-7890-abcd-ef1234567890',
  numero: 'RDO-202603-001',
  data: '2026-03-16',
  status: 'aprovado',
  company_id: 'company-1',
  company: { id: 'company-1', razao_social: 'Gandra Tecnologia' },
  site_id: 'site-1',
  site: { id: 'site-1', nome: 'Obra Alta Floresta' },
  responsavel_id: 'user-1',
  responsavel: { id: 'user-1', nome: 'Carlos Silva' },
  clima_manha: 'ensolarado',
  clima_tarde: 'nublado',
  houve_acidente: false,
  houve_paralisacao: false,
  mao_de_obra: [],
  equipamentos: [],
  materiais_recebidos: [],
  servicos_executados: [],
  ocorrencias: [],
  created_at: '2026-03-16T12:00:00.000Z',
  updated_at: '2026-03-16T12:00:00.000Z',
};

describe('rdoGenerator', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('alinha o document code do RDO com o padrao ISO usado no registry', () => {
    expect(
      buildRdoDocumentCode(baseRdo.id, baseRdo.data),
    ).toBe('RDO-2026-12-ABCDEF12');
  });

  it('gera o PDF do RDO sem quebrar e com filename esperado', async () => {
    const result = (await generateRdoPdf(baseRdo, {
      save: false,
      output: 'base64',
    })) as { base64: string; filename: string };

    expect(result.filename).toContain('RDO_RDO-202603-001_16-03-2026.pdf');
    expect(result.base64.length).toBeGreaterThan(100);
  });
});
