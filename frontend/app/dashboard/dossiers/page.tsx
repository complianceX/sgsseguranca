'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { dossiersService } from '@/services/dossiersService';
import { sitesService, Site } from '@/services/sitesService';
import { usersService, User } from '@/services/usersService';
import { FileDown } from 'lucide-react';

export default function DossiersPage() {
  const [userOptions, setUserOptions] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<null | 'employee' | 'site' | 'contract'>(
    null,
  );
  const [userSearch, setUserSearch] = useState('');
  const deferredUserSearch = useDeferredValue(userSearch);
  const [siteSearch, setSiteSearch] = useState('');
  const deferredSiteSearch = useDeferredValue(siteSearch);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');

  useEffect(() => {
    const loadSites = async () => {
      try {
        setLoading(true);
        const sitesPage = await sitesService.findPaginated({
          page: 1,
          limit: 25,
          search: deferredSiteSearch || undefined,
        });
        let nextSites = sitesPage.data;
        if (selectedSiteId && !nextSites.some((item) => item.id === selectedSiteId)) {
          try {
            const currentSite = await sitesService.findOne(selectedSiteId);
            nextSites = dedupeById([currentSite, ...nextSites]);
          } catch {
            nextSites = dedupeById(nextSites);
          }
        } else {
          nextSites = dedupeById(nextSites);
        }
        setSites(nextSites);
      } catch (error) {
        console.error('Erro ao carregar dossies:', error);
        toast.error('Erro ao carregar dados para emissao de dossie.');
      } finally {
        setLoading(false);
      }
    };

    void loadSites();
  }, [deferredSiteSearch, selectedSiteId]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersPage = await usersService.findPaginated({
          page: 1,
          limit: 20,
          search: deferredUserSearch || undefined,
        });
        setUserOptions(usersPage.data);
      } catch (error) {
        console.error('Erro ao carregar colaboradores para dossie:', error);
        toast.error('Erro ao carregar colaboradores para dossie.');
      }
    };

    void loadUsers();
  }, [deferredUserSearch]);

  const availableUsers = useMemo(() => {
    if (!selectedUser) {
      return userOptions;
    }

    return [selectedUser, ...userOptions.filter((item) => item.id !== selectedUser.id)];
  }, [selectedUser, userOptions]);
  const availableSites = useMemo(() => {
    if (!selectedSite) {
      return sites;
    }

    return [selectedSite, ...sites.filter((item) => item.id !== selectedSite.id)];
  }, [selectedSite, sites]);

  const downloadEmployee = async () => {
    if (!selectedUserId) {
      toast.error('Selecione um colaborador.');
      return;
    }
    try {
      setDownloading('employee');
      await dossiersService.downloadEmployeePdf(selectedUserId);
      toast.success('Dossie do colaborador gerado.');
    } catch (error) {
      console.error('Erro ao gerar dossie colaborador:', error);
      toast.error('Falha ao gerar dossie do colaborador.');
    } finally {
      setDownloading(null);
    }
  };

  const downloadSite = async () => {
    if (!selectedSiteId) {
      toast.error('Selecione uma obra/setor.');
      return;
    }
    try {
      setDownloading('site');
      await dossiersService.downloadSitePdf(selectedSiteId);
      toast.success('Dossie da obra/setor gerado.');
    } catch (error) {
      console.error('Erro ao gerar dossie obra:', error);
      toast.error('Falha ao gerar dossie da obra/setor.');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Dossies de SST</h1>
        <p className="text-gray-500">
          Geração automatica de PDF unico por colaborador e obra/setor.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Dossie por colaborador
          </p>
          <input
            type="text"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            disabled={loading}
            className="mt-3 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Buscar colaborador por nome ou CPF"
          />
          <select
            value={selectedUserId}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedUser(
                availableUsers.find((item) => item.id === value) || null,
              );
              setSelectedUserId(value);
            }}
            disabled={loading}
            className="mt-3 w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">Selecione um colaborador</option>
            {availableUsers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void downloadEmployee()}
            disabled={loading || downloading !== null}
            className="mt-3 flex w-full items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <FileDown className="mr-2 h-4 w-4" />
            {downloading === 'employee' ? 'Gerando...' : 'Baixar PDF'}
          </button>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Dossie por obra/setor
          </p>
          <input
            type="text"
            value={siteSearch}
            onChange={(e) => setSiteSearch(e.target.value)}
            disabled={loading}
            className="mt-3 w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Filtrar obra/setor"
          />
          <select
            value={selectedSiteId}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedSite(
                availableSites.find((item) => item.id === value) || null,
              );
              setSelectedSiteId(value);
            }}
            disabled={loading}
            className="mt-3 w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">Selecione uma obra/setor</option>
            {availableSites.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void downloadSite()}
            disabled={loading || downloading !== null}
            className="mt-3 flex w-full items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <FileDown className="mr-2 h-4 w-4" />
            {downloading === 'site' ? 'Gerando...' : 'Baixar PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}
