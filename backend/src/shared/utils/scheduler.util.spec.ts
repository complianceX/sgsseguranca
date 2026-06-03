import { isApiCronDisabled } from './scheduler.util';

describe('isApiCronDisabled', () => {
  it('retorna true quando API_CRONS_DISABLED=true', () => {
    expect(isApiCronDisabled({ API_CRONS_DISABLED: 'true' })).toBe(true);
  });

  it('retorna false quando API_CRONS_DISABLED não estiver habilitado', () => {
    expect(isApiCronDisabled({ API_CRONS_DISABLED: 'false' })).toBe(false);
    expect(isApiCronDisabled({})).toBe(false);
  });
});
