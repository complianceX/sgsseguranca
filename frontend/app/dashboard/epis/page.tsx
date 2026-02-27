'use client';

import { useState, useEffect } from 'react';
import { episService, Epi } from '@/services/episService';
import { Plus, Pencil, Trash2, Search, AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { format, isBefore, addDays } from 'date-fns';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function EpisPage() {
  const [epis, setEpis] = useState<Epi[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadEpis();
  }, []);

  async function loadEpis() {
    try {
      setLoading(true);
      const data = await episService.findAll();
      setEpis(data);
    } catch (error) {
      console.error('Erro ao carregar EPIs:', error);
      toast.error('Erro ao carregar EPIs.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Tem certeza que deseja excluir este EPI?')) {
      try {
        await episService.delete(id);
        setEpis(epis.filter(e => e.id !== id));
        toast.success('EPI excluído com sucesso!');
      } catch (error) {
        console.error('Erro ao excluir EPI:', error);
        toast.error('Erro ao excluir EPI. Verifique se existem dependências e tente novamente.');
      }
    }
  }

  const getValidityStatus = (date: string | null) => {
    if (!date) return 'none';
    const validityDate = new Date(date);
    const today = new Date();
    const warningDate = addDays(today, 30);

    if (isBefore(validityDate, today)) return 'expired';
    if (isBefore(validityDate, warningDate)) return 'warning';
    return 'valid';
  };

  const filteredEpis = epis.filter(epi =>
    epi.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    epi.ca?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">EPIs</h1>
            <p className="text-gray-500">Gerencie os Equipamentos de Proteção Individual e validades de C.A.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {filteredEpis.length} resultado(s)
            </span>
            <Link
              href="/dashboard/epis/new"
              className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo EPI
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
              placeholder="Buscar por nome ou C.A..."
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
              <TableHead>C.A.</TableHead>
              <TableHead>Validade C.A.</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center">
                  <div className="flex justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredEpis.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-gray-500">
                  Nenhum EPI encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredEpis.map((epi) => {
                const status = getValidityStatus(epi.validade_ca);
                return (
                  <TableRow key={epi.id}>
                    <TableCell>
                      <div className="font-medium text-gray-900">{epi.nome}</div>
                      <div className="max-w-xs truncate text-xs text-gray-500">{epi.descricao}</div>
                    </TableCell>
                    <TableCell>{epi.ca || '-'}</TableCell>
                    <TableCell>
                      {epi.validade_ca ? format(new Date(epi.validade_ca), 'dd/MM/yyyy') : '-'}
                    </TableCell>
                    <TableCell>
                      {status === 'expired' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          <AlertCircle className="h-3 w-3" /> Expirado
                        </span>
                      )}
                      {status === 'warning' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                          <AlertCircle className="h-3 w-3" /> Vence em breve
                        </span>
                      )}
                      {status === 'valid' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          <CheckCircle2 className="h-3 w-3" /> Válido
                        </span>
                      )}
                      {status === 'none' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          Não informado
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        <Link
                          href={`/dashboard/epis/edit/${epi.id}`}
                          className="rounded p-1 text-blue-600 hover:bg-blue-50"
                          title="Editar EPI"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(epi.id)}
                          className="rounded p-1 text-red-600 hover:bg-red-50"
                          title="Excluir EPI"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
