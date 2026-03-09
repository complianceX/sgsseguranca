'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { sitesService, Site } from '@/services/sitesService';
import { Building2, MapPinned, Plus, Pencil, Trash2, Search, QrCode } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { QRCodeCanvas } from 'qrcode.react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  EmptyState,
  ErrorState,
  PageLoadingState,
} from '@/components/ui/state';
import { cn } from '@/lib/utils';

const inputClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [qrSiteId, setQrSiteId] = useState<string | null>(null);

  useEffect(() => {
    loadSites();
  }, []);

  async function loadSites() {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await sitesService.findAll();
      setSites(data);
    } catch (error) {
      console.error('Erro ao carregar sites:', error);
      setLoadError('Nao foi possivel carregar a lista de obras/setores.');
      toast.error('Erro ao carregar lista de obras/setores.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir esta obra/setor?')) {
      return;
    }

    try {
      await sitesService.delete(id);
      setSites((current) => current.filter((site) => site.id !== id));
      toast.success('Obra/Setor excluido com sucesso');
    } catch (error) {
      console.error('Erro ao excluir site:', error);
      toast.error('Erro ao excluir obra/setor. Verifique dependencias e tente novamente.');
    }
  }

  const filteredSites = useMemo(
    () =>
      sites.filter((site) =>
        site.nome.toLowerCase().includes(deferredSearchTerm.toLowerCase()) ||
        site.cidade?.toLowerCase().includes(deferredSearchTerm.toLowerCase()),
      ),
    [sites, deferredSearchTerm],
  );

  const summary = useMemo(
    () => ({
      total: sites.length,
      visiveis: filteredSites.length,
      comCidade: sites.filter((site) => Boolean(site.cidade)).length,
    }),
    [sites, filteredSites.length],
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
          <Button type="button" onClick={loadSites}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card tone="elevated" padding="lg">
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[color:var(--ds-color-action-primary)]/12 text-[var(--ds-color-action-primary)]">
              <MapPinned className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl">Obras/Setores</CardTitle>
              <CardDescription>
                Gerencie as obras e setores usados nos fluxos de campo, mobilização e DDS.
              </CardDescription>
            </div>
          </div>
          <Link
            href="/dashboard/sites/new"
            className={cn(buttonVariants(), 'inline-flex items-center')}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nova obra/setor
          </Link>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Total cadastrado</CardDescription>
            <CardTitle className="text-3xl">{summary.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Resultados visíveis</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-action-primary)]">
              {summary.visiveis}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Com cidade informada</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-success)]">
              {summary.comCidade}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card tone="default" padding="none">
        <CardHeader className="gap-4 border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Base de obras/setores</CardTitle>
            <CardDescription>
              {filteredSites.length} obra(s)/setor(es) exibido(s) com busca por nome e cidade.
            </CardDescription>
          </div>
          <div className="relative w-full md:w-[360px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
            <input
              type="text"
              placeholder="Buscar obras/setores..."
              aria-label="Buscar obras ou setores por nome ou cidade"
              className={cn(inputClassName, 'pl-10')}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </CardHeader>

        <CardContent className="mt-0">
          {filteredSites.length === 0 ? (
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
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cidade/Estado</TableHead>
                  <TableHead>Data de criação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSites.map((site) => (
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
                        : site.cidade || site.estado || '—'}
                    </TableCell>
                    <TableCell>{new Date(site.created_at).toLocaleDateString('pt-BR')}</TableCell>
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
        </CardContent>
      </Card>

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
    </div>
  );
}
