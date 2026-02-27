'use client';

import { useState, useEffect } from 'react';
import { sitesService, Site } from '@/services/sitesService';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadSites();
  }, []);

  async function loadSites() {
    try {
      setLoading(true);
      const data = await sitesService.findAll();
      setSites(data);
    } catch (error) {
      console.error('Erro ao carregar sites:', error);
      toast.error('Erro ao carregar lista de obras/setores.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Tem certeza que deseja excluir esta obra/setor?')) {
      try {
        await sitesService.delete(id);
        setSites(sites.filter(s => s.id !== id));
        toast.success('Obra/Setor excluído com sucesso!');
      } catch (error) {
        console.error('Erro ao excluir site:', error);
        toast.error('Erro ao excluir obra/setor. Verifique se existem dependências e tente novamente.');
      }
    }
  }

  const filteredSites = sites.filter(site =>
    site.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    site.cidade?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Obras/Setores</h1>
            <p className="text-gray-500">Gerencie as obras e setores cadastrados no sistema.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {filteredSites.length} resultado(s)
            </span>
            <Link
              href="/dashboard/sites/new"
              className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Nova Obra/Setor
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b bg-slate-50/70 p-4">
          <div className="relative max-w-sm">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-gray-400" />
            </span>
            <input
              type="text"
              placeholder="Buscar obras/setores..."
              className="w-full rounded-md border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Cidade/Estado</TableHead>
              <TableHead>Data de Criação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center">
                  <div className="flex justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredSites.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-gray-500">
                  Nenhum site encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredSites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell className="font-medium text-gray-900">{site.nome}</TableCell>
                  <TableCell>
                    {site.cidade && site.estado ? `${site.cidade}/${site.estado}` : site.cidade || site.estado || '-'}
                  </TableCell>
                  <TableCell>{new Date(site.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-2">
                      <Link
                        href={`/dashboard/sites/edit/${site.id}`}
                        className="rounded p-1 text-blue-600 hover:bg-blue-50"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(site.id)}
                        className="rounded p-1 text-red-600 hover:bg-red-50"
                        title="Excluir Obra/Setor"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
