import { describe, expect, it } from '@jest/globals';
import {
  getDdsActionPolicy,
  getGovernedDocumentActionPolicy,
} from './documentActionPolicy';

describe('desktop/mobile document action parity', () => {
  it.each([
    ['viewer draft', false, false, true, false, true],
    ['manager draft', true, false, true, false, true],
    ['viewer final', false, true, false, false, false],
    ['manager eligible', true, false, false, false, true],
    ['viewer archived without PDF', false, false, false, true, false],
    ['manager archived without PDF', true, false, false, true, true],
    ['viewer archived final', false, true, false, true, false],
    ['manager archived final', true, true, false, true, false],
  ])(
    'returns the same ARR/DID actions for desktop and mobile: %s',
    (_case, canManage, hasFinalPdf, isDraft, isArchived, hasTransitions) => {
      const input = {
        canManage,
        hasFinalPdf,
        isDraft,
        isArchived,
        hasStatusTransitions: hasTransitions,
      };
      const desktopActions = getGovernedDocumentActionPolicy(input);
      const mobileActions = getGovernedDocumentActionPolicy(input);

      expect(mobileActions).toEqual(desktopActions);
      expect(desktopActions.canOpenOrEmitFinalPdf).toBe(
        hasFinalPdf || (canManage && !isDraft && !isArchived),
      );
      expect(desktopActions.canPrintPdf).toBe(!isArchived || hasFinalPdf);
      expect(desktopActions.canEmailPdf).toBe(
        hasFinalPdf || (canManage && !isDraft && !isArchived),
      );
      expect(desktopActions.canChangeStatus).toBe(
        canManage && !hasFinalPdf && hasTransitions,
      );
    },
  );

  it.each([
    ['viewer draft', false, false, 'rascunho', false, 2, true],
    ['manager published', true, false, 'publicado', false, 2, true],
    ['manager audited', true, false, 'auditado', false, 2, false],
    ['viewer final', false, true, 'auditado', false, 2, false],
    ['manager archived', true, false, 'arquivado', false, 2, false],
    ['manager model', true, false, 'rascunho', true, 0, true],
    ['manager no participants', true, false, 'publicado', false, 0, true],
  ] as const)(
    'returns the same DDS actions for desktop and mobile: %s',
    (_case, canManage, hasFinalPdf, status, isModel, participantCount, hasTransitions) => {
      const input = {
        canManage,
        hasFinalPdf,
        status,
        isModel,
        participantCount,
        hasStatusTransitions: hasTransitions,
      };
      const desktopActions = getDdsActionPolicy(input);
      const mobileActions = getDdsActionPolicy(input);

      expect(mobileActions).toEqual(desktopActions);
      expect(desktopActions.canOpenOrEmitFinalPdf).toBe(
        hasFinalPdf || (canManage && status === 'auditado'),
      );
      expect(desktopActions.canCopySignatureLinks).toBe(
        canManage &&
          !isModel &&
          !hasFinalPdf &&
          status !== 'arquivado' &&
          participantCount > 0,
      );
      expect(desktopActions.canOperationalizeModel).toBe(canManage && isModel);
    },
  );
});
