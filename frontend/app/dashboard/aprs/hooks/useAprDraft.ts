import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  type AprDraftMetadata,
  type AprDraftPendingOfflineSync,
  createAprDraftMetadata,
  clearAprDraft as clearStorage,
  readAprDraft,
  sanitizeAprDraftValues,
  writeAprDraft,
} from "../components/aprDraftStorage";
import type { AprFormData } from "../components/aprForm.schema";
import type {
  SophieDraftChecklistSuggestion,
  SophieDraftRiskSuggestion,
} from "@/lib/sophie-draft-storage";

interface UseAprDraftProps {
  id?: string;
  companyId?: string;
  isReadOnly: boolean;
  fetching: boolean;
  currentStep: number;
  getValues: () => AprFormData;
}

export function useAprDraft({
  id,
  companyId,
  isReadOnly,
  fetching,
  currentStep,
  getValues,
}: UseAprDraftProps) {
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftPendingOfflineSync, setDraftPendingOfflineSync] =
    useState<AprDraftPendingOfflineSync | null>(null);
  const [draftSecurityNotice, setDraftSecurityNotice] = useState<{
    corrupted: boolean;
    sensitiveDataRemoved: boolean;
  }>({
    corrupted: false,
    sensitiveDataRemoved: false,
  });
  const [sophieSuggestedRisks, setSophieSuggestedRisks] = useState<
    SophieDraftRiskSuggestion[]
  >([]);
  const [sophieMandatoryChecklists, setSophieMandatoryChecklists] = useState<
    SophieDraftChecklistSuggestion[]
  >([]);

  const draftStorageKey = useMemo(
    () => (id ? null : `gst.apr.wizard.draft.${companyId || "default"}`),
    [id, companyId],
  );
  const legacyDraftStorageKey = useMemo(
    () => (id ? null : `compliancex.apr.wizard.draft.${companyId || "default"}`),
    [id, companyId],
  );

  const draftMetadata = useMemo<AprDraftMetadata | undefined>(() => {
    if (!draftId) return undefined;
    return createAprDraftMetadata({
      draftId,
      suggestedRisks: sophieSuggestedRisks,
      mandatoryChecklists: sophieMandatoryChecklists,
      pendingOfflineSync: draftPendingOfflineSync,
    });
  }, [
    draftId,
    draftPendingOfflineSync,
    sophieMandatoryChecklists,
    sophieSuggestedRisks,
  ]);

  const draftPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastSavedRef = useRef<string>("");

  const clearDraft = useCallback(() => {
    clearStorage(draftStorageKey, legacyDraftStorageKey);
    lastSavedRef.current = "";
    setDraftId(null);
    setDraftPendingOfflineSync(null);
    setDraftRestored(false);
  }, [draftStorageKey, legacyDraftStorageKey]);

  const persistDraftSnapshot = useCallback(
    (overrideMetadata?: AprDraftMetadata) => {
      if (fetching || isReadOnly || id || !draftStorageKey) return;
      
      const metadataToPersist = overrideMetadata ?? draftMetadata;
      if (!metadataToPersist) return;

      const nextDraft = {
        version: 3 as const,
        step: currentStep,
        values: sanitizeAprDraftValues(getValues()),
        metadata: metadataToPersist,
      };
      
      const serialized = JSON.stringify(nextDraft);
      if (serialized === lastSavedRef.current) return;
      
      lastSavedRef.current = serialized;

      try {
        writeAprDraft(draftStorageKey, nextDraft);
      } catch {
        // storage unavailable
      }
    },
    [currentStep, draftMetadata, draftStorageKey, fetching, id, isReadOnly, getValues],
  );

  const scheduleDraftPersist = useCallback(
    (overrideMetadata?: AprDraftMetadata) => {
      if (draftPersistTimerRef.current) {
        clearTimeout(draftPersistTimerRef.current);
      }
      draftPersistTimerRef.current = setTimeout(() => {
        persistDraftSnapshot(overrideMetadata);
      }, 300);
    },
    [persistDraftSnapshot],
  );

  const buildCurrentDraftMetadata = useCallback(
    (pendingOfflineSync?: AprDraftPendingOfflineSync | null) => {
      if (!draftId) return undefined;
      return createAprDraftMetadata({
        draftId,
        suggestedRisks: sophieSuggestedRisks,
        mandatoryChecklists: sophieMandatoryChecklists,
        pendingOfflineSync: pendingOfflineSync ?? null,
      });
    },
    [draftId, sophieMandatoryChecklists, sophieSuggestedRisks],
  );

  const persistPendingOfflineSync = useCallback(
    (pendingOfflineSync: AprDraftPendingOfflineSync | null) => {
      setDraftPendingOfflineSync(pendingOfflineSync);
      const metadata = buildCurrentDraftMetadata(pendingOfflineSync);
      if (metadata) {
        persistDraftSnapshot(metadata);
      }
    },
    [buildCurrentDraftMetadata, persistDraftSnapshot],
  );

  useEffect(() => {
    return () => {
      if (draftPersistTimerRef.current) {
        clearTimeout(draftPersistTimerRef.current);
      }
    };
  }, []);

  return {
    draftId,
    setDraftId,
    draftRestored,
    setDraftRestored,
    draftPendingOfflineSync,
    setDraftPendingOfflineSync,
    draftSecurityNotice,
    setDraftSecurityNotice,
    sophieSuggestedRisks,
    setSophieSuggestedRisks,
    sophieMandatoryChecklists,
    setSophieMandatoryChecklists,
    draftStorageKey,
    legacyDraftStorageKey,
    draftMetadata,
    clearDraft,
    persistDraftSnapshot,
    scheduleDraftPersist,
    persistPendingOfflineSync,
    buildCurrentDraftMetadata,
  };
}
