import { AprRiskMatrixService } from './apr-risk-matrix.service';

describe('AprRiskMatrixService', () => {
  let service: AprRiskMatrixService;

  beforeEach(() => {
    service = new AprRiskMatrixService();
  });

  it('calcula a matriz corporativa 5x5 cobrindo as quatro faixas de risco', () => {
    // Aceitável: score 1–4
    expect(service.evaluate(1, 2)).toEqual({
      score: 2,
      categoria: 'Aceitável',
      prioridade: 'Não prioritário',
    });
    expect(service.evaluate(2, 2)).toEqual({
      score: 4,
      categoria: 'Aceitável',
      prioridade: 'Não prioritário',
    });
    // Atenção: score 5–9
    expect(service.evaluate(2, 3)).toEqual({
      score: 6,
      categoria: 'Atenção',
      prioridade: 'Prioridade básica',
    });
    // Substancial: score 10–16
    expect(service.evaluate(3, 4)).toEqual({
      score: 12,
      categoria: 'Substancial',
      prioridade: 'Prioridade preferencial',
    });
    // Crítico: score 17–25
    expect(service.evaluate(4, 5)).toEqual({
      score: 20,
      categoria: 'Crítico',
      prioridade: 'Prioridade máxima',
    });
  });

  it('normaliza categorias legadas para a taxonomia atual da APR', () => {
    expect(service.normalizeCategory('De Atenção')).toBe('Atenção');
    expect(service.normalizeCategory('Crítico')).toBe('Crítico');
    expect(service.normalizeCategory('')).toBeNull();
  });
});
