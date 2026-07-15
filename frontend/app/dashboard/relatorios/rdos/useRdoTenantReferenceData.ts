import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { selectedTenantStore } from "@/lib/selectedTenantStore";
import { sessionStore } from "@/lib/sessionStore";
import { sitesService, type Site } from "@/services/sitesService";
import { usersService, type User } from "@/services/usersService";
import {
  createTenantPermissionScope,
  TenantRequestGate,
} from "./tenantReferenceRequests";

type UseRdoTenantReferenceDataOptions = {
  canManageRdo: boolean;
  onReferenceDataError: (message: string) => void;
};

/**
 * Mantém os dados de apoio do RDO isolados pelo tenant ativo.
 *
 * O hook concentra também a identidade das promises para que uma requisição
 * iniciada no tenant anterior nunca publique dados, erros ou seja reutilizada
 * pelo tenant seguinte.
 */
export function useRdoTenantReferenceData({
  canManageRdo,
  onReferenceDataError,
}: UseRdoTenantReferenceDataOptions) {
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(() =>
    selectedTenantStore.get()?.companyId || sessionStore.get()?.companyId || null,
  );
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const referenceDataScopeRef = useRef<string | null>(null);
  const usersScopeRef = useRef<string | null>(null);
  const usersLoadPromiseRef = useRef<Promise<void> | null>(null);
  const referenceDataRequestGateRef = useRef(new TenantRequestGate());
  const usersRequestGateRef = useRef(new TenantRequestGate());

  const clearTenantOwnedData = useCallback(() => {
    setSites([]);
    referenceDataScopeRef.current = null;
    referenceDataRequestGateRef.current.invalidate();
    setUsers([]);
    usersScopeRef.current = null;
    usersLoadPromiseRef.current = null;
    usersRequestGateRef.current.invalidate();
  }, []);

  useEffect(() => {
    const referenceDataRequestGate = referenceDataRequestGateRef.current;
    const usersRequestGate = usersRequestGateRef.current;
    referenceDataRequestGate.activate();
    usersRequestGate.activate();

    const syncActiveCompanyId = () => {
      const nextCompanyId =
        selectedTenantStore.get()?.companyId ||
        sessionStore.get()?.companyId ||
        null;

      // Limpa antes de publicar o novo tenant para não haver um render misto.
      clearTenantOwnedData();
      setActiveCompanyId(nextCompanyId);
    };

    syncActiveCompanyId();
    const unsubscribe = selectedTenantStore.subscribe(syncActiveCompanyId);
    return () => {
      unsubscribe();
      referenceDataRequestGate.dispose();
      usersRequestGate.dispose();
      usersLoadPromiseRef.current = null;
    };
  }, [clearTenantOwnedData]);

  useEffect(() => {
    clearTenantOwnedData();
  }, [activeCompanyId, canManageRdo, clearTenantOwnedData]);

  useEffect(() => {
    if (!activeCompanyId) {
      return;
    }

    const nextScope = createTenantPermissionScope(
      activeCompanyId,
      canManageRdo,
    );
    if (referenceDataScopeRef.current === nextScope) {
      return;
    }

    const requestToken = referenceDataRequestGateRef.current.start(nextScope);
    void sitesService
      .findAll(activeCompanyId)
      .then((sitesResult) => {
        if (
          !referenceDataRequestGateRef.current.isCurrent(requestToken, nextScope)
        ) {
          return;
        }
        setSites(sitesResult);
        referenceDataScopeRef.current = nextScope;
      })
      .catch((error: unknown) => {
        if (
          !referenceDataRequestGateRef.current.isCurrent(requestToken, nextScope)
        ) {
          return;
        }
        logger.error("Erro ao carregar dados de referência do RDO:", error);
        onReferenceDataError(
          "Não foi possível carregar os dados de apoio do RDO.",
        );
        toast.error("Erro ao carregar dados de apoio do RDO.");
      });
  }, [activeCompanyId, canManageRdo, onReferenceDataError]);

  const ensureUsersLoaded = useCallback(async () => {
    if (!canManageRdo) {
      return;
    }

    if (!activeCompanyId) {
      setUsers([]);
      usersScopeRef.current = null;
      return;
    }

    const nextScope = createTenantPermissionScope(activeCompanyId, true);
    if (usersScopeRef.current === nextScope && users.length > 0) {
      return;
    }

    if (usersLoadPromiseRef.current) {
      await usersLoadPromiseRef.current;
      return;
    }

    const requestToken = usersRequestGateRef.current.start(nextScope);
    const loadPromise = (async () => {
      try {
        const usersResult = await usersService.findAll(activeCompanyId);
        if (!usersRequestGateRef.current.isCurrent(requestToken, nextScope)) {
          return;
        }
        setUsers(usersResult);
        usersScopeRef.current = nextScope;
      } catch (error) {
        if (!usersRequestGateRef.current.isCurrent(requestToken, nextScope)) {
          return;
        }
        logger.error("Erro ao carregar responsáveis do RDO:", error);
        toast.error("Não foi possível carregar os responsáveis do RDO.");
        throw error;
      }
    })();

    usersLoadPromiseRef.current = loadPromise;
    try {
      await loadPromise;
    } finally {
      if (usersLoadPromiseRef.current === loadPromise) {
        usersLoadPromiseRef.current = null;
      }
    }
  }, [activeCompanyId, canManageRdo, users.length]);

  return { activeCompanyId, sites, users, ensureUsersLoaded };
}
