import { RiskCalculationService } from './risk-calculation.service';

describe('RiskCalculationService', () => {
  let service: RiskCalculationService;

  beforeEach(() => {
    service = new RiskCalculationService();
  });

  it('calculates risk score using probability * severity * exposure', () => {
    expect(service.calculateScore(5, 4, 3)).toBe(60);
  });

  it('returns null when any factor is missing', () => {
    expect(service.calculateScore(null, 4, 3)).toBeNull();
    expect(service.calculateScore(4, undefined, 3)).toBeNull();
  });

  it('classifies risk level correctly', () => {
    expect(service.classifyByScore(5)).toBe('LOW');
    expect(service.classifyByScore(20)).toBe('MEDIUM');
    expect(service.classifyByScore(40)).toBe('HIGH');
    expect(service.classifyByScore(70)).toBe('CRITICAL');
  });
});
