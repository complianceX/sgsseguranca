import * as XLSX from 'xlsx';
import { AprExcelService } from './apr-excel.service';
import { AprRiskMatrixService } from './apr-risk-matrix.service';

describe('AprExcelService', () => {
  let service: AprExcelService;

  beforeEach(() => {
    service = new AprExcelService(new AprRiskMatrixService());
  });

  it('gera preview estruturado da planilha APR e recalcula categoria no backend', () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
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
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'APR');

    const buffer = Buffer.from(
      XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
    ) as Buffer<ArrayBufferLike>;

    const preview = service.previewImport(buffer, 'apr.xlsx');

    expect(preview.errors).toEqual([]);
    expect(preview.importedRows).toBe(1);
    expect(preview.draft.numero).toBe('APR-2026-002');
    expect(preview.draft.risk_items[0]).toMatchObject({
      atividade_processo: 'Içamento',
      condicao_perigosa: 'Carga suspensa',
      probabilidade: 3,
      severidade: 3,
      categoria_risco: 'Crítico',
      responsavel: 'TST',
      prazo: '2026-03-20',
      status_acao: 'Aberta',
    });
  });

  it('sinaliza erro quando colunas obrigatorias da matriz APR nao existem', () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Título', 'APR sem colunas obrigatórias'],
      [],
      ['Descrição', 'Observação'],
      ['linha', 'sem matriz'],
    ]);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'APR');

    const buffer = Buffer.from(
      XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
    ) as Buffer<ArrayBufferLike>;

    expect(() => service.previewImport(buffer, 'apr-invalida.xlsx')).toThrow(
      'Não foi possível localizar a tabela de riscos na planilha.',
    );
  });
});
