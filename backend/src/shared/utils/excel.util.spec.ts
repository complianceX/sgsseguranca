import {
  aoaToExcelBuffer,
  jsonToExcelBuffer,
  neutralizeExcelFormulaInjection,
  readExcelBuffer,
} from './excel.util';

describe('excel.util — proteção contra formula/CSV injection (CWE-1236)', () => {
  describe('neutralizeExcelFormulaInjection', () => {
    it.each(['=', '+', '-', '@', '\t', '\r', '\n'])(
      'prefixa com apóstrofo strings iniciadas por gatilho de fórmula (%j)',
      (trigger) => {
        const payload = `${trigger}HYPERLINK("http://evil","x")`;
        expect(neutralizeExcelFormulaInjection(payload)).toBe(`'${payload}`);
      },
    );

    it('não altera strings comuns', () => {
      expect(neutralizeExcelFormulaInjection('Escavação manual')).toBe(
        'Escavação manual',
      );
      expect(neutralizeExcelFormulaInjection('APR-001')).toBe('APR-001');
    });

    it('não altera valores não-string (números, datas, null, undefined)', () => {
      const date = new Date('2026-04-30T00:00:00.000Z');
      expect(neutralizeExcelFormulaInjection(42)).toBe(42);
      expect(neutralizeExcelFormulaInjection(date)).toBe(date);
      expect(neutralizeExcelFormulaInjection(null)).toBeNull();
      expect(neutralizeExcelFormulaInjection(undefined)).toBeUndefined();
    });

    it('não altera string vazia', () => {
      expect(neutralizeExcelFormulaInjection('')).toBe('');
    });
  });

  it('aoaToExcelBuffer neutraliza células maliciosas no export (round-trip)', async () => {
    const buffer = await aoaToExcelBuffer([
      {
        name: 'APRs',
        rows: [
          ['Título', 'Medida'],
          ['=cmd|"/C calc"!A0', '+1+1'],
          ['Trabalho em altura', 'Uso de cinto'],
        ],
      },
    ]);

    const [sheet] = await readExcelBuffer(buffer);
    // A célula perigosa volta como texto literal prefixado, não como fórmula.
    expect(sheet.rows[1][0]).toBe(`'=cmd|"/C calc"!A0`);
    expect(sheet.rows[1][1]).toBe(`'+1+1`);
    // Conteúdo legítimo permanece intacto.
    expect(sheet.rows[2][0]).toBe('Trabalho em altura');
    expect(sheet.rows[2][1]).toBe('Uso de cinto');
  });

  it('jsonToExcelBuffer neutraliza valores maliciosos no export (round-trip)', async () => {
    const buffer = await jsonToExcelBuffer(
      [{ titulo: '@SUM(A1:A9)', responsavel: 'João' }],
      'Export',
    );

    const [sheet] = await readExcelBuffer(buffer);
    // rows[0] é o cabeçalho; rows[1] é a linha de dados.
    expect(sheet.rows[1][0]).toBe(`'@SUM(A1:A9)`);
    expect(sheet.rows[1][1]).toBe('João');
  });
});
