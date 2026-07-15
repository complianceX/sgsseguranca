import { useCallback, useEffect, useMemo, useRef } from "react";
import { selectedTenantStore } from "@/lib/selectedTenantStore";
import { sessionStore } from "@/lib/sessionStore";
import { TenantRequestGate, type TenantRequestToken } from "./tenantReferenceRequests";

export type RdoTenantOperation = Readonly<{
  channel: string;
  companyId: string;
  token: TenantRequestToken;
}>;

/**
 * Fronteira única para todo estado e trabalho assíncrono pertencente ao tenant.
 * Canais dinâmicos permitem isolar consumidores/documentos concorrentes, e a
 * geração de todos eles é invalidada de forma síncrona na troca de empresa.
 */
export function useRdoTenantPageIsolation(clearTenantOwnedState: () => void) {
  const clearRef = useRef(clearTenantOwnedState);
  clearRef.current = clearTenantOwnedState;
  const currentCompanyIdRef = useRef<string | null>(
    selectedTenantStore.get()?.companyId || sessionStore.get()?.companyId || null,
  );
  const gatesRef = useRef(new Map<string, TenantRequestGate>());

  const getGate = useCallback((channel: string) => {
    const existing = gatesRef.current.get(channel);
    if (existing) return existing;
    const gate = new TenantRequestGate();
    gatesRef.current.set(channel, gate);
    return gate;
  }, []);

  const invalidateAll = useCallback(() => {
    gatesRef.current.forEach((gate) => gate.invalidate());
  }, []);

  useEffect(() => {
    const gates = gatesRef.current;
    gates.forEach((gate) => gate.activate());

    const clearForTenantBoundary = () => {
      currentCompanyIdRef.current =
        selectedTenantStore.get()?.companyId ||
        sessionStore.get()?.companyId ||
        null;
      invalidateAll();
      clearRef.current();
    };

    clearForTenantBoundary();
    const unsubscribe = selectedTenantStore.subscribe(clearForTenantBoundary);
    return () => {
      unsubscribe();
      gates.forEach((gate) => gate.dispose());
    };
  }, [invalidateAll]);

  const start = useCallback(
    (channel: string, companyId: string) => getGate(channel).start(companyId),
    [getGate],
  );

  const isCurrent = useCallback(
    (channel: string, token: TenantRequestToken, companyId: string) =>
      currentCompanyIdRef.current === companyId &&
      getGate(channel).isCurrent(token, companyId),
    [getGate],
  );

  const beginOperation = useCallback(
    (channel: string, companyId: string): RdoTenantOperation => ({
      channel,
      companyId,
      token: getGate(channel).start(companyId),
    }),
    [getGate],
  );

  const isOperationCurrent = useCallback(
    (operation: RdoTenantOperation) =>
      currentCompanyIdRef.current === operation.companyId &&
      getGate(operation.channel).isCurrent(operation.token, operation.companyId),
    [getGate],
  );

  const isActiveCompany = useCallback(
    (companyId: string) => currentCompanyIdRef.current === companyId,
    [],
  );

  return useMemo(
    () => ({
      start,
      isCurrent,
      isActiveCompany,
      beginOperation,
      isOperationCurrent,
    }),
    [beginOperation, isActiveCompany, isCurrent, isOperationCurrent, start],
  );
}
