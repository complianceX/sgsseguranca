'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Archive,
  Building2,
  Download,
  FileStack,
  Filter,
  Printer,
  Search,
  Sparkles,
} from 'lucide-react';
import { format, getISOWeek, getISOWeekYear, subWeeks } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { companiesService, Company } from '@/services/companiesService';
import {
  documentRegistryService,
  DocumentRegistryEntry,
} from '@/services/documentRegistryService';
import { openPdfForPrint } from '@/lib/print-utils';
import { Button } from '@/components/ui/button';
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
  InlineLoadingState,
  PageLoadingState,
} from '@/components/ui/state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { selectedTenantStore } from '@/lib/selectedTenantStore';

const inputClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

const moduleOptions = [
  { value: 'apr', label: 'APR' },
  { value: 'pt', label: 'PT' },
  { value: 'dds', label: 'DDS' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'audit', label: 'Auditoria' },
  { value: 'nonconformity', label: 'NC' },
];

export default function DocumentRegistryPage() {
  const [entries, setEntries] = useState<DocumentRegistryEntry[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingBundle, setLoadingBundle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(() => selectedTenantStore.get()?.companyId || '');
  const [companySearchTerm, setCompanySearchTerm] = useState('');
  const [year, setYear] = useState(String(getISOWeekYear(new Date())));
  const [week, setWeek] = useState(String(getISOWeek(new Date())));
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const deferredCompanySearchTerm = useDeferredValue(companySearchTerm);

  const loadCompanies = useCallback(async () => {
    try {
      setLoadingCompanies(true);
      const response = await companiesService.findPaginated({
        page: 1,
        limit: 25,
        search: deferredCompanySearchTerm.trim() || undefined,
      });

      let nextCompanies = response.data;
      if (companyId && !nextCompanies.some((company) => company.id === companyId)) {
        try {
          const selectedCompany = await companiesService.findOne(companyId);
          nextCompanies = dedupeById([selectedCompany, ...nextCompanies]);
        } catch {
          nextCompanies = dedupeById(nextCompanies);
        }
      } else {
        nextCompanies = dedupeById(nextCompanies);
      }

      setCompanies(nextCompanies);
    } catch (loadError) {
      console.error('Erro ao carregar empresas do registry documental:', loadError);
      toast.error('Erro ao carregar empresas disponíveis.');
    } finally {
      setLoadingCompanies(false);
    }
  }, [companyId, deferredCompanySearchTerm]);

  const loadPageData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const registryData = await documentRegistryService.list({
        company_id: companyId || undefined,
        year: year ? Number(year) : undefined,
        week: week ? Number(week) : undefined,
        modules: selectedModules.length ? selectedModules : undefined,
      });
      setEntries(registryData);
    } catch (loadError) {
      console.error('Erro ao carregar registry documental:', loadError);
      setError('Nao foi possivel carregar o registry documental.');
      toast.error('Erro ao carregar documentos consolidados.');
    } finally {
      setLoading(false);
    }
  }, [companyId, year, week, selectedModules]);

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    const unsubscribe = selectedTenantStore.subscribe((tenant) => {
      setCompanyId((current) => current || tenant?.companyId || '');
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const filteredEntries = useMemo(() => {
    const normalizedTerm = searchTerm.trim().toLowerCase();
    if (!normalizedTerm) {
      return entries;
    }

    return entries.filter((entry) => {
      return (
        entry.title.toLowerCase().includes(normalizedTerm) ||
        entry.module.toLowerCase().includes(normalizedTerm) ||
        (entry.document_code || '').toLowerCase().includes(normalizedTerm) ||
        (entry.original_name || '').toLowerCase().includes(normalizedTerm)
      );
    });
  }, [entries, searchTerm]);

  const summary = useMemo(() => {
    const byModule = moduleOptions.reduce<Record<string, number>>((acc, option) => {
      acc[option.value] = entries.filter((entry) => entry.module === option.value).length;
      return acc;
    }, {});

    return {
      total: entries.length,
      weeks: new Set(entries.map((entry) => `${entry.iso_year}-${entry.iso_week}`)).size,
      modules: new Set(entries.map((entry) => entry.module)).size,
      ...byModule,
    };
  }, [entries]);

  const activeCompanyName = useMemo(() => {
    if (!companyId) {
      return selectedTenantStore.get()?.companyName || 'Todas as empresas disponíveis';
    }
    return companies.find((company) => company.id === companyId)?.razao_social || 'Empresa filtrada';
  }, [companies, companyId]);

  const weeklyHighlights = useMemo(
    () =>
      moduleOptions
        .map((option) => ({
          ...option,
          count: entries.filter((entry) => entry.module === option.value).length,
        }))
        .filter((item) => item.count > 0),
    [entries],
  );

  const handleToggleModule = (moduleName: string) => {
    setSelectedModules((current) =>
      current.includes(moduleName)
        ? current.filter((item) => item !== moduleName)
        : [...current, moduleName],
    );
  };

  const applyCurrentWeek = () => {
    const now = new Date();
    setYear(String(getISOWeekYear(now)));
    setWeek(String(getISOWeek(now)));
  };

  const applyPreviousWeek = () => {
    const target = subWeeks(new Date(), 1);
    setYear(String(getISOWeekYear(target)));
    setWeek(String(getISOWeek(target)));
  };

  const handleDownloadBundle = async () => {
    if (!year || !week) {
      toast.error('Informe ano e semana para baixar o pacote.');
      return;
    }

    try {
      setLoadingBundle(true);
      const blob = await documentRegistryService.downloadWeeklyBundle({
        company_id: companyId || undefined,
        year: Number(year),
        week: Number(week),
        modules: selectedModules.length ? selectedModules : undefined,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `documentos-semana-${year}-${String(week).padStart(2, '0')}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success('Pacote consolidado gerado com sucesso.');
    } catch (bundleError) {
      console.error('Erro ao baixar pacote consolidado:', bundleError);
      toast.error('Não foi possível gerar o pacote consolidado.');
    } finally {
      setLoadingBundle(false);
    }
  };

  const handlePrintBundle = async () => {
    if (!year || !week) {
      toast.error('Informe ano e semana para imprimir o pacote.');
      return;
    }

    try {
      setLoadingBundle(true);
      const blob = await documentRegistryService.downloadWeeklyBundle({
        company_id: companyId || undefined,
        year: Number(year),
        week: Number(week),
        modules: selectedModules.length ? selectedModules : undefined,
      });
      const url = URL.createObjectURL(blob);
      openPdfForPrint(url, () => {
        toast.info('Pop-up bloqueado. O pacote foi aberto na mesma aba.');
      });
    } catch (bundleError) {
      console.error('Erro ao imprimir pacote consolidado:', bundleError);
      toast.error('Não foi possível abrir o pacote consolidado.');
    } finally {
      setLoadingBundle(false);
    }
  };

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando registry documental"
        description="Buscando o índice central de PDFs por empresa, semana e módulo."
        cards={4}
        tableRows={8}
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Falha ao carregar registry documental"
        description={error}
        action={
          <Button type="button" onClick={loadPageData}>
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
          <div className="space-y-2">
            <CardTitle className="text-2xl">Registry documental</CardTitle>
            <CardDescription>
              Índice central de documentos SST por empresa, semana e módulo, com pacote consolidado.
            </CardDescription>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={applyCurrentWeek}
                className="rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100 transition-colors hover:border-sky-300/40 hover:bg-sky-500/15"
              >
                Semana atual
              </button>
              <button
                type="button"
                onClick={applyPreviousWeek}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-[var(--ds-color-text-secondary)] transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
              >
                Semana anterior
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={handleDownloadBundle}
              disabled={loadingBundle || !year || !week}
            >
              Baixar pacote
            </Button>
            <Button
              type="button"
              variant="outline"
              leftIcon={<Printer className="h-4 w-4" />}
              onClick={handlePrintBundle}
              disabled={loadingBundle || !year || !week}
            >
              Imprimir pacote
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <RegistryMetricCard
          label="Documentos indexados"
          value={summary.total}
          icon={<FileStack className="h-4 w-4" />}
        />
        <RegistryMetricCard
          label="Módulos presentes"
          value={summary.modules}
          icon={<Archive className="h-4 w-4" />}
        />
        <RegistryMetricCard
          label="Semanas no recorte"
          value={summary.weeks}
          icon={<Filter className="h-4 w-4" />}
        />
        <RegistryMetricCard
          label="Empresas no seletor"
          value={companyId ? 1 : companies.length}
          icon={<Building2 className="h-4 w-4" />}
        />
      </div>

      <Card tone="default" padding="md">
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Pacote operacional ativo</CardTitle>
              <CardDescription>
                Empresa: {activeCompanyName} · Semana {String(week || '—').padStart(2, '0')}/{year || '—'}
              </CardDescription>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-600/10 px-3 py-1 text-xs font-semibold text-orange-100">
              <Sparkles className="h-3.5 w-3.5" />
              {selectedModules.length > 0 ? `${selectedModules.length} módulo(s) filtrado(s)` : 'Todos os módulos'}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {weeklyHighlights.length > 0 ? (
              weeklyHighlights.map((item) => (
                <span
                  key={item.value}
                  className="rounded-full border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/20 px-3 py-1 text-xs font-semibold text-[var(--ds-color-text-secondary)]"
                >
                  {item.label}: {item.count}
                </span>
              ))
            ) : (
              <span className="rounded-full border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/20 px-3 py-1 text-xs font-semibold text-[var(--ds-color-text-muted)]">
                Sem documentos no recorte atual
              </span>
            )}
          </div>
        </CardHeader>
      </Card>

      <Card tone="default" padding="none">
        <CardHeader className="gap-4 border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-5 py-4">
          <div className="space-y-1">
            <CardTitle>Filtros do pacote semanal</CardTitle>
            <CardDescription>
              Selecione empresa, semana e módulos para consolidar os documentos operacionais.
            </CardDescription>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <input
                type="text"
                value={companySearchTerm}
                onChange={(event) => setCompanySearchTerm(event.target.value)}
                placeholder="Buscar empresa no seletor"
                aria-label="Buscar empresa do pacote semanal"
                className={inputClassName}
              />
              <select
                aria-label="Selecionar empresa do pacote semanal"
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
                className={inputClassName}
                disabled={loadingCompanies}
              >
                <option value="">
                  {loadingCompanies
                    ? 'Carregando empresas...'
                    : 'Tenant atual / empresas encontradas'}
                </option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.razao_social}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="number"
              min={2020}
              max={2100}
              aria-label="Selecionar ano documental"
              value={year}
              onChange={(event) => setYear(event.target.value)}
              placeholder="Ano"
              className={inputClassName}
            />
            <input
              type="number"
              min={1}
              max={53}
              aria-label="Selecionar semana ISO"
              value={week}
              onChange={(event) => setWeek(event.target.value)}
              placeholder="Semana ISO"
              className={inputClassName}
            />
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar no índice"
                aria-label="Buscar documentos no índice central"
                className={cn(inputClassName, 'pl-10')}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {moduleOptions.map((option) => {
              const active = selectedModules.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleToggleModule(option.value)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm transition-colors',
                    active
                      ? 'border-[var(--ds-color-action-primary)] bg-[var(--ds-color-action-primary)] text-white'
                      : 'border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-secondary)] hover:border-[var(--ds-color-action-primary)] hover:text-[var(--ds-color-action-primary)]',
                  )}
                >
                  {option.label}
                </button>
              );
            })}
            <Button type="button" variant="ghost" onClick={loadPageData}>
              Atualizar lista
            </Button>
          </div>
        </CardHeader>
        <CardContent className="mt-0">
          {loadingBundle ? (
            <InlineLoadingState label="Gerando pacote consolidado" />
          ) : filteredEntries.length === 0 ? (
            <EmptyState
              title="Nenhum documento indexado"
              description="Não há documentos no registry para o filtro aplicado."
              compact
            />
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm text-[var(--ds-color-text-secondary)]">
                  {filteredEntries.length} documento(s) encontrado(s) no índice consolidado.
                </p>
              </div>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Módulo</TableHead>
                      <TableHead>Título</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Arquivo</TableHead>
                      <TableHead>Semana</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          {entry.document_date
                            ? format(new Date(entry.document_date), 'dd/MM/yyyy', {
                                locale: ptBR,
                              })
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <span className="rounded-full bg-[color:var(--ds-color-surface-muted)] px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-secondary)]">
                            {entry.module}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium text-[var(--ds-color-text-primary)]">
                          {entry.title}
                        </TableCell>
                        <TableCell className="text-[var(--ds-color-text-secondary)]">
                          {entry.document_code || '—'}
                        </TableCell>
                        <TableCell className="text-[var(--ds-color-text-secondary)]">
                          {entry.original_name || '—'}
                        </TableCell>
                        <TableCell className="text-[var(--ds-color-text-secondary)]">
                          {String(entry.iso_week).padStart(2, '0')}/{entry.iso_year}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-3 md:hidden">
                {filteredEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                          {entry.title}
                        </p>
                        <p className="mt-1 text-xs text-[var(--ds-color-text-muted)]">
                          {entry.document_date
                            ? format(new Date(entry.document_date), 'dd/MM/yyyy', { locale: ptBR })
                            : 'Sem data documental'}
                        </p>
                      </div>
                      <span className="rounded-full bg-[color:var(--ds-color-surface-muted)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-color-text-secondary)]">
                        {entry.module}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1 text-xs text-[var(--ds-color-text-secondary)]">
                      <p>Código: {entry.document_code || '—'}</p>
                      <p>Arquivo: {entry.original_name || '—'}</p>
                      <p>Semana: {String(entry.iso_week).padStart(2, '0')}/{entry.iso_year}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RegistryMetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <Card interactive padding="md">
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between text-[var(--ds-color-text-secondary)]">
          <CardDescription>{label}</CardDescription>
          {icon}
        </div>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}
