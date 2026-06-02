import type {
  GovernedPdfAccessAvailability,
  GovernedPdfAccessResponse,
} from '@/lib/api/generated/governed-contracts.client';

/** @deprecated Use GovernedPdfAccessAvailability do cliente gerado. */
export type GovernedPdfAvailability = GovernedPdfAccessAvailability;

/**
 * Subset mínimo de GovernedPdfAccessResponse usado pelo helper de
 * consumo. Derivado do schema gerado para evitar drift.
 */
export type GovernedPdfAccessLike = Pick<
  GovernedPdfAccessResponse,
  'hasFinalPdf' | 'availability' | 'url' | 'message'
>;

export type GovernedPdfConsumptionAction = 'download' | 'print';

export type GovernedPdfConsumptionResolution =
  | {
      mode: 'governed_url';
      url: string;
    }
  | {
      mode: 'local_fallback';
      message: string;
    }
  | {
      mode: 'local_generation';
      message: string;
    };

function getActionLabel(action: GovernedPdfConsumptionAction): string {
  return action === 'print' ? 'impressão' : 'download';
}

export function resolveGovernedPdfConsumption(
  access: GovernedPdfAccessLike,
  options: {
    action: GovernedPdfConsumptionAction;
    documentLabel: string;
  },
): GovernedPdfConsumptionResolution {
  if (access.hasFinalPdf && access.availability === 'ready' && access.url) {
    if (options.action === 'print') {
      return {
        mode: 'local_fallback',
        message:
          access.message ||
          `PDF oficial da ${options.documentLabel} disponível apenas por download restrito. Gerando versão local temporária para impressão.`,
      };
    }

    return {
      mode: 'governed_url',
      url: access.url,
    };
  }

  if (
    access.hasFinalPdf &&
    access.availability === 'registered_without_signed_url'
  ) {
    return {
      mode: 'local_fallback',
      message:
        access.message ||
        `PDF final da ${options.documentLabel} emitido, mas indisponível no armazenamento. Gerando versão local temporária para ${getActionLabel(options.action)}.`,
    };
  }

  return {
    mode: 'local_generation',
    message:
      access.message ||
      `PDF final da ${options.documentLabel} ainda não foi emitido. Gerando versão local para ${getActionLabel(options.action)}.`,
  };
}
