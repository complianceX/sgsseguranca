import { AprRiskMatrixService } from './apr-risk-matrix.service';

describe('AprRiskMatrixService', () => {
  let service: AprRiskMatrixService;

  beforeEach(() => {
    service = new AprRiskMatrixService();
  });

  it('calcula a matriz corporativa da APR com score 1-9 sem depender de formula externa', () => {
    expect(service.evaluate(1, 2)).toEqual({
      score: 2,
      categoria: 'Aceitável',
      prioridade: 'Não prioritário',
    });
    expect(service.evaluate(2, 2)).toEqual({
      score: 4,
      categoria: 'Atenção',
      prioridade: 'Prioridade básica',
    });
    expect(service.evaluate(2, 3)).toEqual({
      score: 6,
      categoria: 'Substancial',
      prioridade: 'Prioridade preferencial',
    });
    expect(service.evaluate(3, 3)).toEqual({
      score: 9,
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
