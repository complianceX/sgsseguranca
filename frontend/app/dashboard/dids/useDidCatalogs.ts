'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { companiesService, type Company } from '@/services/companiesService';
import { sitesService, type Site } from '@/services/sitesService';
import { usersService, type User } from '@/services/usersService';
import { selectedTenantStore } from '@/lib/selectedTenantStore';
import { isUserVisibleForSite } from '@/lib/site-scoped-user-visibility';

type UseDidCatalogsOptions = {
  selectedCompanyId: string;
  selectedSiteId: string;
  selectedResponsibleId: string;
  selectedParticipantIds: string[];
  initialCompanyId: string;
  isAdminGeral: boolean;
  setValue: (
    name: 'company_id' | 'site_id' | 'responsavel_id' | 'participants',
    value: string | string[],
    options?: {
      shouldDirty?: boolean;
      shouldTouch?: boolean;
      shouldValidate?: boolean;
    },
  ) => void;
};

export function useDidCatalogs({
  selectedCompanyId,
  selectedSiteId,
  selectedResponsibleId,
  selectedParticipantIds,
  initialCompanyId,
  isAdminGeral,
  setValue,
}: UseDidCatalogsOptions) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadCompanies() {
      try {
        let companiesData: Company[] = [];
        try {
          const companiesPage = await companiesService.findPaginated({
            page: 1,
            limit: 100,
          });
          companiesData = companiesPage.data;
          if (companiesPage.lastPage > 1) {
            toast.warning(
              'A lista de empresas foi limitada aos primeiros 100 registros.',
            );
          }
        } catch {
          companiesData = [];
        }

        if (cancelled) {
          return;
        }

        setCompanies(companiesData);

        if (!initialCompanyId && companiesData.length === 1) {
          setValue('company_id', companiesData[0].id, {
            shouldValidate: true,
          });
        }
      } catch {
        if (!cancelled) {
          setCompanies([]);
        }
      }
    }

    void loadCompanies();

    return () => {
      cancelled = true;
    };
  }, [initialCompanyId, setValue]);

  useEffect(() => {
    let cancelled = false;

    async function loadCompanySites() {
      if (!selectedCompanyId) {
        setSites([]);
        return;
      }

      const selectedCompany = companies.find(
        (company) => company.id === selectedCompanyId,
      );

      if (isAdminGeral) {
        selectedTenantStore.set({
          companyId: selectedCompanyId,
          companyName: selectedCompany?.razao_social || 'Empresa selecionada',
        });
      }

      try {
        const sitesResult = await sitesService.findPaginated({
          page: 1,
          limit: 100,
          companyId: selectedCompanyId,
        });

        if (cancelled) {
          return;
        }

        setSites(sitesResult.data);

        if (sitesResult.lastPage > 1) {
          toast.warning(
            'A lista de sites foi limitada aos primeiros 100 registros para manter performance.',
          );
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setSites([]);
        console.error('Erro ao carregar sites do DID:', error);
      }
    }

    void loadCompanySites();

    return () => {
      cancelled = true;
    };
  }, [companies, isAdminGeral, selectedCompanyId]);

  useEffect(() => {
    let cancelled = false;

    async function loadCompanyUsers() {
      if (!selectedCompanyId) {
        setUsers([]);
        return;
      }

      try {
        const usersResult = await usersService.findPaginated({
          page: 1,
          limit: 100,
          companyId: selectedCompanyId,
          siteId: selectedSiteId || undefined,
        });

        if (cancelled) {
          return;
        }

        setUsers(usersResult.data);

        if (usersResult.lastPage > 1) {
          toast.warning(
            'A lista de usuários foi limitada aos primeiros 100 registros para manter performance.',
          );
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setUsers([]);
        console.error('Erro ao carregar usuários do DID:', error);
      }
    }

    void loadCompanyUsers();

    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId, selectedSiteId]);

  const filteredSites = useMemo(
    () => sites.filter((site) => site.company_id === selectedCompanyId),
    [selectedCompanyId, sites],
  );

  const filteredUsers = useMemo(
    () =>
      users.filter(
        (user) => isUserVisibleForSite(user, selectedCompanyId, selectedSiteId),
      ),
    [selectedCompanyId, selectedSiteId, users],
  );

  useEffect(() => {
    if (!selectedSiteId) {
      return;
    }

    const siteStillAvailable = filteredSites.some((site) => site.id === selectedSiteId);
    if (!siteStillAvailable) {
      setValue('site_id', '', {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    }
  }, [filteredSites, selectedSiteId, setValue]);

  useEffect(() => {
    if (!selectedSiteId) {
      if (selectedResponsibleId) {
        setValue('responsavel_id', '', {
          shouldValidate: true,
        });
      }
      if (selectedParticipantIds.length > 0) {
        setValue('participants', [], {
          shouldValidate: true,
        });
      }
      return;
    }

    if (
      selectedResponsibleId &&
      !filteredUsers.some((user) => user.id === selectedResponsibleId)
    ) {
      setValue('responsavel_id', '', {
        shouldValidate: true,
      });
    }

    const nextParticipants = selectedParticipantIds.filter((participantId) =>
      filteredUsers.some((user) => user.id === participantId),
    );
    if (nextParticipants.length !== selectedParticipantIds.length) {
      setValue('participants', nextParticipants, {
        shouldValidate: true,
      });
    }
  }, [
    filteredUsers,
    selectedParticipantIds,
    selectedResponsibleId,
    selectedSiteId,
    setValue,
  ]);

  return {
    companies,
    filteredSites,
    filteredUsers,
  };
}
