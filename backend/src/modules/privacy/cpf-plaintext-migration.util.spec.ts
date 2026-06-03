import { resolveCpfBackfillOptions } from './cpf-plaintext-migration.util';

describe('cpf-plaintext-migration.util', () => {
  it('default em apply é clearPlaintext=true', () => {
    expect(resolveCpfBackfillOptions(['--apply'])).toEqual({
      apply: true,
      clearPlaintext: true,
    });
  });

  it('permite override para manter plaintext', () => {
    expect(resolveCpfBackfillOptions(['--apply', '--keep-plaintext'])).toEqual({
      apply: true,
      clearPlaintext: false,
    });
  });

  it('em dry-run, clearPlaintext só liga via flag explícita', () => {
    expect(resolveCpfBackfillOptions([])).toEqual({
      apply: false,
      clearPlaintext: false,
    });
    expect(resolveCpfBackfillOptions(['--clear-plaintext'])).toEqual({
      apply: false,
      clearPlaintext: true,
    });
  });
});
