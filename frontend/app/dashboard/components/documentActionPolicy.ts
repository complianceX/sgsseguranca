export type GovernedDocumentActionPolicy = {
  canChangeStatus: boolean;
  canOpenOrEmitFinalPdf: boolean;
  canPrintPdf: boolean;
  canEmailPdf: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

type GovernedDocumentPolicyInput = {
  canManage: boolean;
  hasFinalPdf: boolean;
  isDraft: boolean;
  isArchived: boolean;
  hasStatusTransitions: boolean;
};

/**
 * Single source of truth for actions rendered in desktop rows and mobile cards.
 * Archived documents are immutable and cannot receive a newly emitted PDF; an
 * already governed final PDF remains available for opening, printing and mail.
 */
export function getGovernedDocumentActionPolicy({
  canManage,
  hasFinalPdf,
  isDraft,
  isArchived,
  hasStatusTransitions,
}: GovernedDocumentPolicyInput): GovernedDocumentActionPolicy {
  const canEmitFinalPdf = canManage && !isDraft && !isArchived;

  return {
    canChangeStatus:
      canManage && !hasFinalPdf && hasStatusTransitions,
    canOpenOrEmitFinalPdf: hasFinalPdf || canEmitFinalPdf,
    canPrintPdf: !isArchived || hasFinalPdf,
    canEmailPdf: hasFinalPdf || canEmitFinalPdf,
    canEdit: canManage && !hasFinalPdf && !isArchived,
    canDelete: canManage,
  };
}

export type DdsActionPolicy = GovernedDocumentActionPolicy & {
  canCopySignatureLinks: boolean;
  canOperationalizeModel: boolean;
};

type DdsPolicyInput = {
  canManage: boolean;
  hasFinalPdf: boolean;
  status: 'rascunho' | 'publicado' | 'auditado' | 'arquivado';
  isModel: boolean;
  participantCount: number;
  hasStatusTransitions: boolean;
};

export function getDdsActionPolicy({
  canManage,
  hasFinalPdf,
  status,
  isModel,
  participantCount,
  hasStatusTransitions,
}: DdsPolicyInput): DdsActionPolicy {
  const isArchived = status === 'arquivado';
  const canEmitFinalPdf = canManage && status === 'auditado' && !hasFinalPdf;

  return {
    canChangeStatus:
      canManage && !hasFinalPdf && hasStatusTransitions,
    canOpenOrEmitFinalPdf: hasFinalPdf || canEmitFinalPdf,
    canPrintPdf: true,
    canEmailPdf: true,
    canEdit:
      canManage && !hasFinalPdf && status !== 'auditado' && !isArchived,
    canDelete: canManage,
    canCopySignatureLinks:
      canManage &&
      !isModel &&
      !hasFinalPdf &&
      !isArchived &&
      participantCount > 0,
    canOperationalizeModel: canManage && isModel,
  };
}
