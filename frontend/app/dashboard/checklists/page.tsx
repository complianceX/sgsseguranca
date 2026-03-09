'use client';

import { useChecklists } from './hooks/useChecklists';
import { AlertTriangle, ClipboardCheck, Plus, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { SendMailModal } from '@/components/SendMailModal';
import { ChecklistsFilters } from './components/ChecklistsFilters';
import { ChecklistsTable } from './components/ChecklistsTable';
import { ChecklistInsights } from './components/ChecklistInsights';
import { StoredFilesPanel } from '@/components/StoredFilesPanel';
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

export default function ChecklistsPage() {
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
    handleExportCsv,
    loadChecklists,
  } = useChecklists();

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
              <CardTitle className="text-2xl">Checklists de inspeção</CardTitle>
              <CardDescription>
                Gerencie registros, modelos, análises por IA e evidências geradas em campo.
              </CardDescription>
            </div>
          </div>
          <Link
            href="/dashboard/checklists/new"
            className={cn(buttonVariants(), 'inline-flex items-center')}
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo checklist
          </Link>
        </CardHeader>
      </Card>

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
              Existem {insights.naoConforme} checklist(s) não conforme(s) nesta base. Priorize análise, impressão e tratativas.
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
            onExportCsv={handleExportCsv}
          />
        </CardHeader>

        <CardContent className="mt-0">
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
                  <Link
                    href="/dashboard/checklists/new"
                    className={cn(buttonVariants(), 'inline-flex items-center')}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Novo checklist
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <>
              <ChecklistsTable
                checklists={filteredChecklists}
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
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
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
        />
      ) : null}
    </div>
  );
}
