'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { episService, Epi } from '@/services/episService';
import { Plus, Pencil, Trash2, Search, AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { format, isBefore, addDays } from 'date-fns';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { PaginationControls } from '@/components/PaginationControls';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function EpisPage() {
  const [epis, setEpis] = useState<Epi[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  useEffect(() => {
    loadEpis();
  }, [deferredSearchTerm, page]);

  async function loadEpis() {
    try {
      setLoading(true);
      const response = await episService.findPaginated({
        page,
        limit: 10,
        search: deferredSearchTerm || undefined,
      });
      setEpis(response.data);
      setTotal(response.total);
      setLastPage(response.lastPage);
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
        toast.success('EPI excluído com sucesso!');
        if (epis.length === 1 && page > 1) {
          setPage((current) => current - 1);
          return;
        }
        loadEpis();
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

  const summary = useMemo(
    () => ({
      total,
      visible: epis.length,
    }),
    [epis.length, total],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">EPIs</h1>
            <p className="text-[var(--ds-color-text-muted)]">Gerencie os Equipamentos de Proteção Individual e validades de C.A.</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="primary" className="px-3 py-1">
              {summary.total} resultado(s)
            </Badge>
            <Link
              href="/dashboard/epis/new"
              className={cn(buttonVariants({ variant: 'primary' }), 'gap-2')}
            >
              <Plus className="h-4 w-4" />
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
            <Input
              type="text"
              placeholder="Buscar por nome ou C.A..."
              aria-label="Buscar EPIs por nome ou CA"
              className="pl-10"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
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
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--ds-color-action-primary)] border-t-transparent"></div>
                  </div>
                </TableCell>
              </TableRow>
            ) : epis.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-[var(--ds-color-text-muted)]">
                  Nenhum EPI encontrado.
                </TableCell>
              </TableRow>
            ) : (
              epis.map((epi) => {
                const status = getValidityStatus(epi.validade_ca);
                return (
                  <TableRow key={epi.id}>
                    <TableCell>
                      <div className="font-medium text-[var(--ds-color-text-primary)]">{epi.nome}</div>
                      <div className="max-w-xs truncate text-xs text-[var(--ds-color-text-muted)]">{epi.descricao}</div>
                    </TableCell>
                    <TableCell>{epi.ca || '-'}</TableCell>
                    <TableCell>
                      {epi.validade_ca ? format(new Date(epi.validade_ca), 'dd/MM/yyyy') : '-'}
                    </TableCell>
                    <TableCell>
                      {status === 'expired' && (
                        <Badge variant="danger">
                          <AlertCircle className="h-3 w-3" /> Expirado
                        </Badge>
                      )}
                      {status === 'warning' && (
                        <Badge variant="warning">
                          <AlertCircle className="h-3 w-3" /> Vence em breve
                        </Badge>
                      )}
                      {status === 'valid' && (
                        <Badge variant="success">
                          <CheckCircle2 className="h-3 w-3" /> Válido
                        </Badge>
                      )}
                      {status === 'none' && (
                        <Badge variant="neutral">Não informado</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end space-x-2">
                        <Link
                          href={`/dashboard/epis/edit/${epi.id}`}
                          className="rounded p-1 text-[var(--ds-color-action-primary)] transition-colors hover:bg-[var(--ds-color-primary-subtle)]/36"
                          title="Editar EPI"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(epi.id)}
                          className="rounded p-1 text-[var(--ds-color-danger)] transition-colors hover:bg-[var(--ds-color-danger-subtle)]"
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
        {!loading && total > 0 ? (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(lastPage, current + 1))}
          />
        ) : null}
      </div>
    </div>
  );
}
