'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { dossiersService } from '@/services/dossiersService';
import { sitesService, Site } from '@/services/sitesService';
import { usersService, User } from '@/services/usersService';
import { FileDown } from 'lucide-react';

export default function DossiersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<null | 'employee' | 'site' | 'contract'>(
    null,
  );
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [usersData, sitesData] = await Promise.all([
          usersService.findAll(),
          sitesService.findAll(),
        ]);
        setUsers(usersData);
        setSites(sitesData);
      } catch (error) {
        console.error('Erro ao carregar dossies:', error);
        toast.error('Erro ao carregar dados para emissao de dossie.');
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, []);

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
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            disabled={loading}
            className="mt-3 w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">Selecione um colaborador</option>
            {users.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void downloadEmployee()}
            disabled={loading || downloading !== null}
            className="mt-3 flex w-full items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <FileDown className="mr-2 h-4 w-4" />
            {downloading === 'employee' ? 'Gerando...' : 'Baixar PDF'}
          </button>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Dossie por obra/setor
          </p>
          <select
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            disabled={loading}
            className="mt-3 w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">Selecione uma obra/setor</option>
            {sites.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void downloadSite()}
            disabled={loading || downloading !== null}
            className="mt-3 flex w-full items-center justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <FileDown className="mr-2 h-4 w-4" />
            {downloading === 'site' ? 'Gerando...' : 'Baixar PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
