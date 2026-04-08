'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, MapPinned, Pencil, Plus, QrCode, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { QRCodeCanvas } from 'qrcode.react';
import { sitesService, Site } from '@/services/sitesService';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, PageLoadingState } from '@/components/ui/state';
import { PaginationControls } from '@/components/PaginationControls';
import { ListPageLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import { safeToLocaleDateString } from '@/lib/date/safeFormat';

const inputClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [qrSiteId, setQrSiteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  const handlePrevPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, [setPage]);

  const handleNextPage = useCallback(() => {
    setPage((current) => Math.min(lastPage, current + 1));
  }, [lastPage, setPage]);

  const loadSites = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await sitesService.findPaginated({
        page,
        limit: 10,
        search: deferredSearchTerm || undefined,
      });
      setSites(response.data);
      setTotal(response.total);
      setLastPage(response.lastPage);
    } catch (error) {
      console.error('Erro ao carregar sites:', error);
      setLoadError('Nao foi possivel carregar a lista de obras/setores.');
      toast.error('Erro ao carregar lista de obras/setores.');
    } finally {
      setLoading(false);
    }
  }, [deferredSearchTerm, page]);

  useEffect(() => {
    void loadSites();
  }, [loadSites]);

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir esta obra/setor?')) {
      return;
    }

    try {
      await sitesService.delete(id);
      toast.success('Obra/Setor excluido com sucesso');
      if (sites.length === 1 && page > 1) {
        setPage((current) => current - 1);
        return;
      }
      void loadSites();
    } catch (error) {
      console.error('Erro ao excluir site:', error);
      toast.error('Erro ao excluir obra/setor. Verifique dependencias e tente novamente.');
    }
  }

  const summary = useMemo(
    () => ({
      total,
      visiveis: sites.length,
      comCidade: sites.filter((site) => Boolean(site.cidade)).length,
    }),
    [sites, total],
  );

  const qrUrl = qrSiteId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/verify?siteId=${qrSiteId}&flow=dds`
    : '';

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando obras e setores"
        description="Buscando cadastro operacional e estruturas de campo."
        cards={3}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar obras/setores"
        description={loadError}
        action={
          <Button type="button" onClick={() => void loadSites()}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return (
    <>
      <ListPageLayout
        eyebrow="Estrutura de campo"
        title="Obras/Setores"
        description="Gerencie as obras e setores usados nos fluxos de campo, mobilizacao e DDS."
        icon={<MapPinned className="h-5 w-5" />}
        actions={
          <Link href="/dashboard/sites/new" className={buttonVariants()}>
            <Plus className="mr-2 h-4 w-4" />
            Nova obra/setor
          </Link>
        }
        metrics={[
          {
            label: 'Total cadastrado',
            value: summary.total,
            note: 'Obras e setores disponiveis no ambiente.',
          },
          {
            label: 'Resultados visiveis',
            value: summary.visiveis,
            note: 'Registros no recorte atual da busca.',
            tone: 'primary',
          },
          {
            label: 'Com cidade informada',
            value: summary.comCidade,
            note: 'Estruturas com localizacao mais completa.',
            tone: 'success',
          },
        ]}
        toolbarTitle="Base de obras/setores"
        toolbarDescription={`${total} obra(s)/setor(es) encontrada(s) com busca por nome, cidade e UF.`}
        toolbarContent={
          <div className="ds-list-search">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
            <input
              type="text"
              placeholder="Buscar obras/setores..."
              aria-label="Buscar obras ou setores por nome ou cidade"
              className={cn(inputClassName, 'pl-10')}
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPage(1);
              }}
            />
          </div>
        }
        footer={
          !loading && total > 0 ? (
            <PaginationControls
              page={page}
              lastPage={lastPage}
              total={total}
              onPrev={handlePrevPage}
              onNext={handleNextPage}
            />
          ) : null
        }
      >
        {sites.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="Nenhuma obra/setor encontrada"
              description={
                deferredSearchTerm
                  ? 'Nenhum resultado corresponde ao filtro aplicado.'
                  : 'Ainda nao existem obras/setores cadastrados para este tenant.'
              }
              action={
                !deferredSearchTerm ? (
                  <Link
                    href="/dashboard/sites/new"
                    className={cn(buttonVariants(), 'inline-flex items-center')}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Nova obra/setor
                  </Link>
                ) : undefined
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Cidade/Estado</TableHead>
                <TableHead>Data de criacao</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell className="font-medium text-[var(--ds-color-text-primary)]">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-[var(--ds-color-action-primary)]" />
                      <span>{site.nome}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-[var(--ds-color-text-secondary)]">
                    {site.cidade && site.estado
                      ? `${site.cidade}/${site.estado}`
                      : site.cidade || site.estado || '-'}
                  </TableCell>
                  <TableCell>{safeToLocaleDateString(site.created_at, 'pt-BR', undefined, '—')}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Link
                        href={`/dashboard/sites/edit/${site.id}`}
                        className={buttonVariants({ size: 'icon', variant: 'ghost' })}
                        title="Editar obra/setor"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => setQrSiteId(site.id)}
                        className="text-[var(--ds-color-text-secondary)]"
                        title="QR Code da obra"
                      >
                        <QrCode className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(site.id)}
                        className="text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]"
                        title="Excluir obra/setor"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ListPageLayout>

      {qrSiteId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card tone="elevated" padding="lg" className="w-full max-w-md">
            <CardHeader className="flex-row items-center justify-between">
              <div className="space-y-1">
                <CardTitle>QR Code da obra</CardTitle>
                <CardDescription>
                  Escaneie para acessar o fluxo de DDS/Checklist sem login.
                </CardDescription>
              </div>
              <Button type="button" variant="ghost" onClick={() => setQrSiteId(null)}>
                Fechar
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <QRCodeCanvas value={qrUrl} size={220} includeMargin />
              <div className="w-full break-all rounded-[var(--ds-radius-md)] bg-[color:var(--ds-color-surface-muted)]/45 p-3 text-xs text-[var(--ds-color-text-secondary)]">
                {qrUrl}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}




