'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useChecklists } from './hooks/useChecklists';
import { AlertTriangle, ClipboardCheck, Plus, ShieldCheck, Trash2, Download } from 'lucide-react';
import Link from 'next/link';
import { ChecklistsFilters } from './components/ChecklistsFilters';
import { ChecklistsTable } from './components/ChecklistsTable';
import { ChecklistInsights } from './components/ChecklistInsights';
import { checklistsService } from '@/services/checklistsService';
import { PaginationControls } from '@/components/PaginationControls';
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
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import {
  checklistRecordsAreas,
  getChecklistRecordsArea,
  type ChecklistRecordsArea,
} from '@/lib/checklist-modules';
import {
  ChecklistColumnKey,
  ChecklistSavedView,
  defaultChecklistColumns,
} from './columns';

const SendMailModal = dynamic(
  () => import('@/components/SendMailModal').then((module) => module.SendMailModal),
  { ssr: false },
);
const StoredFilesPanel = dynamic(
  () =>
    import('@/components/StoredFilesPanel').then(
      (module) => module.StoredFilesPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="mt-6 h-40 motion-safe:animate-pulse rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/60" />
    ),
  },
);

export function ChecklistsPageView({
  area = getChecklistRecordsArea('central'),
}: {
  area?: ChecklistRecordsArea;
}) {
  const { user, hasPermission } = useAuth();
  const canManageChecklists = hasPermission('can_manage_checklists');
  const {
    loading,
    loadError,
    searchTerm,
    setSearchTerm,
    deferredSearchTerm,
    modelFilter,
    setModelFilter,
    page,
    setPage,
    total,
    lastPage,
    analyzingId,
    printingId,
    isMailModalOpen,
    setIsMailModalOpen,
    selectedDoc,
    setSelectedDoc,
    filteredChecklists,
    insights,
    handleDownloadPdf,
    handleSendEmail,
    handlePrint,
    handleAiAnalysis,
    handleDelete,
    handleDeleteMany,
    handleExportCsv,
    loadChecklists,
  } = useChecklists({ area });

  const [visibleColumns, setVisibleColumns] = useState<ChecklistColumnKey[]>(defaultChecklistColumns);
  const [selectedChecklistIds, setSelectedChecklistIds] = useState<string[]>([]);
  const [savedViews, setSavedViews] = useState<ChecklistSavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const handlePrevPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, [setPage]);

  const handleNextPage = useCallback(() => {
    setPage((current) => Math.min(lastPage, current + 1));
  }, [lastPage, setPage]);

  const viewsStorageKey = useMemo(
    () => `checklists.saved-views.${user?.id || 'anon'}`,
    [user?.id],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(viewsStorageKey);
      if (!raw) {
        setSavedViews([]);
        return;
      }
      const parsed = JSON.parse(raw) as ChecklistSavedView[];
      if (Array.isArray(parsed)) {
        setSavedViews(parsed);
      }
    } catch {
      setSavedViews([]);
    }
  }, [viewsStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(viewsStorageKey, JSON.stringify(savedViews));
  }, [savedViews, viewsStorageKey]);

  const selectedIdsSet = useMemo(
    () => new Set(selectedChecklistIds),
    [selectedChecklistIds],
  );

  useEffect(() => {
    setSelectedChecklistIds((current) =>
      current.filter((id) => filteredChecklists.some((checklist) => checklist.id === id)),
    );
  }, [filteredChecklists]);

  const allSelectedOnPage =
    filteredChecklists.length > 0 &&
    filteredChecklists.every((checklist) => selectedIdsSet.has(checklist.id));

  const toggleChecklistSelection = (id: string) => {
    setSelectedChecklistIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
  };

  const toggleSelectAllOnPage = (checked: boolean) => {
    if (!checked) {
      setSelectedChecklistIds((current) =>
        current.filter((id) => !filteredChecklists.some((checklist) => checklist.id === id)),
      );
      return;
    }
    setSelectedChecklistIds((current) => {
      const merged = new Set(current);
      filteredChecklists.forEach((checklist) => merged.add(checklist.id));
      return Array.from(merged);
    });
  };

  const toggleColumn = (column: ChecklistColumnKey) => {
    setVisibleColumns((current) => {
      if (current.includes(column)) {
        if (current.length === 1) {
          toast.info('Pelo menos uma coluna deve permanecer visível.');
          return current;
        }
        return current.filter((entry) => entry !== column);
      }
      return [...current, column];
    });
    setActiveViewId(null);
  };

  const resetColumns = () => {
    setVisibleColumns(defaultChecklistColumns);
    setActiveViewId(null);
  };

  const applySavedView = (viewId: string) => {
    if (!viewId) {
      setActiveViewId(null);
      return;
    }
    const selectedView = savedViews.find((view) => view.id === viewId);
    if (!selectedView) return;

    setActiveViewId(selectedView.id);
    setVisibleColumns(selectedView.columns.length ? selectedView.columns : defaultChecklistColumns);
    setSearchTerm(selectedView.searchTerm);
    setModelFilter(selectedView.modelFilter);
    toast.success(`Vista "${selectedView.name}" aplicada.`);
  };

  useEffect(() => {
    if (!activeViewId) return;
    const activeView = savedViews.find((view) => view.id === activeViewId);
    if (!activeView) {
      setActiveViewId(null);
      return;
    }

    const sameColumns =
      activeView.columns.length === visibleColumns.length &&
      activeView.columns.every((column, index) => column === visibleColumns[index]);
    const sameFilter = activeView.modelFilter === modelFilter;
    const sameSearch = activeView.searchTerm === searchTerm;

    if (!sameColumns || !sameFilter || !sameSearch) {
      setActiveViewId(null);
    }
  }, [activeViewId, savedViews, visibleColumns, modelFilter, searchTerm]);

  const saveCurrentView = () => {
    const proposedName = window.prompt('Nome da vista para salvar:', `Vista ${savedViews.length + 1}`);
    if (!proposedName) return;
    const name = proposedName.trim();
    if (!name) return;

    const nextView: ChecklistSavedView = {
      id: `${Date.now()}`,
      name,
      columns: visibleColumns,
      modelFilter,
      searchTerm,
      createdAt: Date.now(),
    };
    setSavedViews((current) => [nextView, ...current].slice(0, 12));
    setActiveViewId(nextView.id);
    toast.success(`Vista "${name}" salva.`);
  };

  const deleteActiveView = () => {
    if (!activeViewId) return;
    const activeView = savedViews.find((view) => view.id === activeViewId);
    if (!activeView) return;

    if (!confirm(`Excluir a vista "${activeView.name}"?`)) return;
    setSavedViews((current) => current.filter((view) => view.id !== activeViewId));
    setActiveViewId(null);
    toast.success('Vista excluída.');
  };

  const clearSelection = () => {
    setSelectedChecklistIds([]);
  };

  const handleDeleteSelected = async () => {
    if (!selectedChecklistIds.length) return;
    if (!confirm(`Excluir ${selectedChecklistIds.length} checklist(s) selecionado(s)?`)) return;
    await handleDeleteMany(selectedChecklistIds);
    setSelectedChecklistIds([]);
  };

  const handleExportSelected = () => {
    handleExportCsv({
      ids: selectedChecklistIds,
      columns: visibleColumns,
    });
  };

  const companyOptions = Array.from(
    new Map(
      filteredChecklists
        .filter((item) => item.company_id)
        .map((item) => [
          item.company_id,
          item.company?.razao_social || item.company_id,
        ]),
    ).entries(),
  ).map(([id, name]) => ({ id, name }));

  const hasCriticalFindings = insights.naoConforme > 0;

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando checklists"
        description="Buscando registros, status operacionais, IA e arquivos salvos."
        cards={4}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar checklists"
        description={loadError}
        action={
          <Button type="button" onClick={loadChecklists}>
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
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl">{area.title}</CardTitle>
              <CardDescription>
                {area.description}
              </CardDescription>
            </div>
          </div>
          <Link
            href={area.newHref}
            className={cn(
              buttonVariants(),
              'inline-flex items-center',
              !canManageChecklists && 'pointer-events-none opacity-50',
            )}
            aria-disabled={!canManageChecklists}
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo checklist
          </Link>
        </CardHeader>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {checklistRecordsAreas.map((entry) => {
          const active = entry.slug === area.slug;

          return (
            <Link
              key={entry.slug}
              href={entry.href}
              className={cn(
                'rounded-[var(--ds-radius-xl)] border px-4 py-4 motion-safe:transition-all',
                active
                  ? 'border-[var(--ds-color-action-primary)] bg-[var(--ds-color-action-primary)]/8 shadow-[var(--ds-shadow-sm)]'
                  : 'border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] hover:border-[var(--ds-color-action-primary)]/30 hover:bg-[var(--ds-color-surface-muted)]/40',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                  {entry.label}
                </span>
                {active ? (
                  <span className="rounded-full bg-[color:var(--ds-color-action-primary)]/12 px-2 py-0.5 text-xs font-semibold text-[var(--ds-color-action-primary)]">
                    Atual
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-[var(--ds-color-text-secondary)]">
                {entry.description}
              </p>
            </Link>
          );
        })}
      </div>

      <ChecklistInsights insights={insights} />

      {hasCriticalFindings ? (
        <Card
          tone="muted"
          padding="md"
          className="border-[color:var(--ds-color-warning)]/25 bg-[color:var(--ds-color-warning)]/10"
        >
          <CardHeader className="gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[var(--ds-color-warning)]" />
              <CardTitle className="text-base">Atenção operacional</CardTitle>
            </div>
            <CardDescription>
              Existem {insights.naoConforme} checklist(s) não conforme(s) na página atual. Priorize análise, impressão e tratativas.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card
          tone="muted"
          padding="md"
          className="border-[color:var(--ds-color-success)]/20 bg-[color:var(--ds-color-success)]/10"
        >
          <CardHeader className="gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[var(--ds-color-success)]" />
              <CardTitle className="text-base">Base sem não conformidades</CardTitle>
            </div>
            <CardDescription>
              Nenhum checklist não conforme foi encontrado na página atual.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card tone="default" padding="none">
        <CardHeader className="px-0 py-0">
          <ChecklistsFilters
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            modelFilter={modelFilter}
            onModelFilterChange={setModelFilter}
            onExportCsv={() => handleExportCsv({ columns: visibleColumns })}
            visibleColumns={visibleColumns}
            onToggleColumn={toggleColumn}
            onResetColumns={resetColumns}
            savedViews={savedViews}
            activeViewId={activeViewId}
            onApplyView={applySavedView}
            onSaveCurrentView={saveCurrentView}
            onDeleteActiveView={deleteActiveView}
          />
        </CardHeader>

        <CardContent className="mt-0">
          <div className="sr-only" aria-live="polite">
            {selectedChecklistIds.length
              ? `${selectedChecklistIds.length} checklist(s) selecionado(s).`
              : 'Nenhum checklist selecionado.'}
          </div>
          {selectedChecklistIds.length ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/22 px-4 py-3">
              <p className="text-sm text-[var(--ds-color-text-secondary)]">
                {selectedChecklistIds.length} selecionado(s)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExportSelected}
                  leftIcon={<Download className="h-4 w-4" />}
                >
                  Exportar selecionados
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteSelected}
                  disabled={!canManageChecklists}
                  leftIcon={<Trash2 className="h-4 w-4" />}
                >
                  Excluir selecionados
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
                  Limpar seleção
                </Button>
              </div>
            </div>
          ) : null}
          {filteredChecklists.length === 0 ? (
            <EmptyState
              title="Nenhum checklist encontrado"
              description={
                deferredSearchTerm
                  ? 'Nenhum resultado corresponde ao filtro aplicado.'
                  : 'Ainda não existem checklists registrados para este tenant.'
              }
              action={
                !deferredSearchTerm ? (
                  canManageChecklists ? (
                    <Link
                      href={area.newHref}
                      className={cn(buttonVariants(), 'inline-flex items-center')}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Novo checklist
                    </Link>
                  ) : undefined
                ) : undefined
              }
            />
          ) : (
            <>
              <ChecklistsTable
                checklists={filteredChecklists}
                visibleColumns={visibleColumns}
                selectedIds={selectedChecklistIds}
                allSelected={allSelectedOnPage}
                onToggleSelect={toggleChecklistSelection}
                onToggleSelectAll={toggleSelectAllOnPage}
                analyzingId={analyzingId}
                printingId={printingId}
                onAiAnalysis={handleAiAnalysis}
                onPrint={handlePrint}
                onDownloadPdf={handleDownloadPdf}
                onSendEmail={handleSendEmail}
                onDelete={handleDelete}
              />

              <PaginationControls
                page={page}
                lastPage={lastPage}
                total={total}
                onPrev={handlePrevPage}
                onNext={handleNextPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <StoredFilesPanel
        title="Arquivos Checklist (Storage)"
        description="PDFs salvos automaticamente por empresa/ano/semana."
        listStoredFiles={checklistsService.listStoredFiles}
        getPdfAccess={checklistsService.getPdfAccess}
        downloadWeeklyBundle={checklistsService.downloadWeeklyBundle}
        companyOptions={companyOptions}
      />

      {selectedDoc ? (
        <SendMailModal
          isOpen={isMailModalOpen}
          onClose={() => {
            setIsMailModalOpen(false);
            setSelectedDoc(null);
          }}
          documentName={selectedDoc.name}
          filename={selectedDoc.filename}
          base64={selectedDoc.base64}
          storedDocument={selectedDoc.storedDocument}
        />
      ) : null}
    </div>
  );
}

export default function ChecklistsPage() {
  return <ChecklistsPageView />;
}

