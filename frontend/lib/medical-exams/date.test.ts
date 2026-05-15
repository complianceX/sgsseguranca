import {
  formatMedicalExamDateOnly,
  getMedicalExamDateKey,
  getMedicalExamExpiryTone,
  toMedicalExamInputDateValue,
} from './date';

describe('medical exams date helpers', () => {
  it('extrai a data ISO sem considerar timezone', () => {
    expect(getMedicalExamDateKey('2026-05-14T03:00:00.000Z')).toBe('2026-05-14');
    expect(toMedicalExamInputDateValue('2026-05-14T03:00:00.000Z')).toBe('2026-05-14');
  });

  it('formata datas sem deslocamento de fuso', () => {
    expect(formatMedicalExamDateOnly('2026-05-14T03:00:00.000Z')).toBe('14/05/2026');
  });

  it('classifica vencimento com base em data de calendário', () => {
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const expiredKey = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1))
      .toISOString()
      .slice(0, 10);
    const soonKey = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 15))
      .toISOString()
      .slice(0, 10);
    const validKey = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 60))
      .toISOString()
      .slice(0, 10);

    expect(getMedicalExamExpiryTone(null)).toEqual({
      label: 'Sem vencimento',
      tone: 'neutral',
    });
    expect(getMedicalExamExpiryTone(expiredKey)).toEqual({
      label: 'Vencido',
      tone: 'danger',
    });
    expect(getMedicalExamExpiryTone(soonKey)).toEqual({
      label: 'Vence em breve',
      tone: 'warning',
    });
    expect(getMedicalExamExpiryTone(validKey)).toEqual({
      label: 'Em dia',
      tone: 'success',
    });
    expect(getMedicalExamDateKey(todayKey)).toBe(todayKey);
  });
});
