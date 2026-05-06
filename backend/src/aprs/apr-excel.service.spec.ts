import { aoaToExcelBuffer } from '../common/utils/excel.util';
import { AprExcelService } from './apr-excel.service';
import { AprRiskMatrixService } from './apr-risk-matrix.service';
import type { Apr } from './entities/apr.entity';

describe('AprExcelService', () => {
  let service: AprExcelService;

  beforeEach(() => {
    service = new AprExcelService(new AprRiskMatrixService());
  });

  it('gera preview estruturado da planilha APR e recalcula categoria no backend', async () => {
    const buffer = await aoaToExcelBuffer([
      {
        name: 'APR',
        rows: [
          ['Código APR', 'APR-2026-002'],
          ['Título', 'APR importada'],
          ['Data Emissão', '2026-03-19'],
          ['Data Revisão', '2026-03-25'],
          [],
          [
            'Atividade/Processo',
            'Condição Perigosa',
            'Probabilidade',
            'Severidade',
            'Medidas de Controle',
            'Responsável',
            'Prazo',
            'Status',
          ],
          [
            'Içamento',
            'Carga suspensa',
            3,
            3,
            'Isolar área',
            'TST',
            '2026-03-20',
            'Aberta',
          ],
        ],
      },
    ]);

    const preview = await service.previewImport(buffer, 'apr.xlsx');

    expect(preview.errors).toEqual([]);
    expect(preview.importedRows).toBe(1);
    expect(preview.draft.numero).toBe('APR-2026-002');
    expect(preview.draft.risk_items[0]).toMatchObject({
      atividade_processo: 'Içamento',
      condicao_perigosa: 'Carga suspensa',
      probabilidade: 3,
      severidade: 3,
      categoria_risco: 'Atenção',
      responsavel: 'TST',
      prazo: '2026-03-20',
      status_acao: 'Aberta',
    });
  });

  it('sinaliza erro quando colunas obrigatorias da matriz APR nao existem', async () => {
    const buffer = await aoaToExcelBuffer([
      {
        name: 'APR',
        rows: [
          ['Título', 'APR sem colunas obrigatórias'],
          [],
          ['Descrição', 'Observação'],
          ['linha', 'sem matriz'],
        ],
      },
    ]);

    await expect(
      service.previewImport(buffer, 'apr-invalida.xlsx'),
    ).rejects.toThrow(
      'Não foi possível localizar a tabela de riscos na planilha.',
    );
  });

  it('gera template corporativo que pode ser importado novamente sem ajustes manuais no parser', async () => {
    const templateBuffer = await service.buildTemplateWorkbook();

    const preview = await service.previewImport(
      templateBuffer,
      'apr-template.xlsx',
    );

    expect(preview.errors).toEqual([]);
    expect(preview.importedRows).toBe(1);
    expect(preview.draft).toMatchObject({
      numero: 'APR-2026-001',
      titulo: 'Inspeção de atividade crítica',
      company_name: 'Empresa exemplo',
    });
    expect(preview.draft.risk_items[0]).toMatchObject({
      atividade_processo: 'Montagem de linha de vida',
      categoria_risco: 'Atenção',
      status_acao: 'Aberta',
    });
  });

  it('reconhece cabecalhos com variantes de pontuacao e texto extra comuns em planilhas APR reais', async () => {
    const buffer = await aoaToExcelBuffer([
      {
        name: 'APR',
        rows: [
          [
            'Atividade / Processo',
            'Agente Ambiental',
            'Condição Perigosa',
            'Fontes ou Circunstâncias',
            'Possíveis lesões / Agravos à saúde',
            'Probabilidade',
            'Severidade',
            'Categoria de Risco',
            'Medidas de Prevenção e Controle',
          ],
          [
            'Montagem de linha de vida',
            'Queda de altura',
            'Acesso sem ancoragem',
            'Trabalho em altura com deslocamento horizontal',
            'Fraturas e trauma grave',
            3,
            3,
            'Crítico',
            'Linha de vida certificada, inspeção prévia e supervisão permanente',
          ],
        ],
      },
    ]);

    const preview = await service.previewImport(buffer, 'apr-real.xlsx');

    expect(preview.errors).toEqual([]);
    expect(preview.importedRows).toBe(1);
    expect(preview.draft.risk_items[0]).toMatchObject({
      atividade_processo: 'Montagem de linha de vida',
      agente_ambiental: 'Queda de altura',
      condicao_perigosa: 'Acesso sem ancoragem',
      fonte_circunstancia: 'Trabalho em altura com deslocamento horizontal',
      possiveis_lesoes: 'Fraturas e trauma grave',
      probabilidade: 3,
      severidade: 3,
      medidas_prevencao:
        'Linha de vida certificada, inspeção prévia e supervisão permanente',
    });
  });

  it('faz roundtrip da planilha exportada pela propria APR com resumo em outra aba', async () => {
    const detailBuffer = await service.buildDetailWorkbook({
      id: 'apr-1',
      numero: 'APR-2026-010',
      titulo: 'APR exportada',
      descricao: 'Fluxo real de roundtrip',
      status: 'Pendente',
      data_inicio: '2026-03-19',
      data_fim: '2026-03-26',
      versao: 3,
      company: {
        razao_social: 'Empresa Teste',
        cnpj: '00.000.000/0001-00',
      },
      site: { nome: 'Obra Centro' },
      elaborador: { nome: 'Maria Silva' },
      aprovado_por: { nome: 'Joao Souza' },
      risk_items: [
        {
          id: 'risk-1',
          ordem: 0,
          atividade: 'Montagem',
          agente_ambiental: 'Ruido',
          condicao_perigosa: 'Trabalho sem isolamento',
          fonte_circunstancia: 'Circulacao simultanea',
          lesao: 'Contusao',
          probabilidade: 2,
          severidade: 3,
          score_risco: 6,
          categoria_risco: 'Substancial',
          medidas_prevencao: 'Isolar area',
          responsavel: 'TST',
          prazo: new Date('2026-03-20T00:00:00.000Z'),
          status_acao: 'Aberta',
        },
      ],
    } as unknown as Apr);

    const preview = await service.previewImport(
      detailBuffer,
      'apr-exportada.xlsx',
    );

    expect(preview.errors).toEqual([]);
    expect(preview.sheetName).toBe('Riscos APR');
    expect(preview.draft).toMatchObject({
      numero: 'APR-2026-010',
      titulo: 'APR exportada',
      company_name: 'Empresa Teste',
      site_name: 'Obra Centro',
      elaborador_name: 'Maria Silva',
      aprovador_name: 'Joao Souza',
      data_inicio: '2026-03-19',
      data_fim: '2026-03-26',
    });
    expect(preview.draft.risk_items[0]).toMatchObject({
      atividade_processo: 'Montagem',
      condicao_perigosa: 'Trabalho sem isolamento',
      probabilidade: 2,
      severidade: 3,
      categoria_risco: 'Atenção',
      responsavel: 'TST',
      prazo: '2026-03-20',
      status_acao: 'Aberta',
    });
  });
});
