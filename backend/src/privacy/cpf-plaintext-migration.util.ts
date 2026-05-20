import { parseBooleanFlag } from '../common/database/db-ssl.util';

export type CpfBackfillOptions = {
  apply: boolean;
  clearPlaintext: boolean;
};

export function resolveCpfBackfillOptions(args: string[]): CpfBackfillOptions {
  const apply = args.includes('--apply');
  const clearPlaintextRequested = args.includes('--clear-plaintext');
  const keepPlaintextRequested = args.includes('--keep-plaintext');

  if (clearPlaintextRequested && keepPlaintextRequested) {
    throw new Error('Use apenas um: --clear-plaintext ou --keep-plaintext.');
  }

  // SECURITY: em modo apply, o default é limpar plaintext.
  const clearPlaintext = apply
    ? keepPlaintextRequested
      ? false
      : true
    : clearPlaintextRequested;

  return { apply, clearPlaintext };
}

export function isLegacyCpfPlaintextLookupEnabled(): boolean {
  return parseBooleanFlag(process.env.LEGACY_CPF_PLAINTEXT_LOOKUP_ENABLED);
}
