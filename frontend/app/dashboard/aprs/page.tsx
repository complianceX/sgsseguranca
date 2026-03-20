'use client';

import dynamic from 'next/dynamic';
import { FileSpreadsheet, FileText, Plus } from 'lucide-react';
import { downloadExcel } from '@/lib/download-excel';
import Link from 'next/link';
import { useAprs } from './hooks/useAprs';
import { AprCard } from './components/AprCard';
import { AprInsights } from './components/AprInsights';
import { AprFilters } from './components/AprFilters';
import { aprsService } from '@/services/aprsService';
import { PaginationControls } from '@/components/PaginationControls';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState, ErrorState, PageLoadingState } from '@/components/ui/state';
import { ListPageLayout } from '@/components/layout';
import { cn } from '@/lib/utils';

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
      <div className="mt-6 h-40 animate-pulse rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/60" />
    ),
  },
);

export default function AprsPage() {
  const {
    loading,
    loadError,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    insights,
    overviewMetrics,
    page,
    setPage,
    total,
    lastPage,
    isMailModalOpen,
    setIsMailModalOpen,
    selectedDoc,
    setSelectedDoc,
    filteredAprs,
    handleDelete,
    handleDownloadPdf,
    handlePrint,
    handleSendEmail,
    handleFinalize,
    handleReject,
    handleCreateNewVersion,
    loadAprs,
  } = useAprs();

  const companyOptions = Array.from(
    new Map(
      filteredAprs
        .filter((item) => item.company_id)
        .map((item) => [item.company_id, item.company?.razao_social || item.company_id]),
    ).entries(),
  ).map(([id, name]) => ({ id, name }));

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando APRs"
        description="Buscando análises de risco, métricas operacionais e arquivos armazenados."
        cards={5}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar APRs"
        description={loadError}
        action={
          <Button type="button" onClick={loadAprs}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return (
    <>
      <ListPageLayout
        eyebrow="Documentos operacionais"
        title="Análise Preliminar de Risco (APR)"
        description="Gerencie APRs emitidas por obra, acompanhe riscos críticos e controle versões aprovadas."
        icon={<FileText className="h-5 w-5" />}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<FileSpreadsheet className="h-4 w-4 text-[var(--ds-color-success)]" />}
              onClick={() => downloadExcel('/aprs/export/excel', 'aprs.xlsx')}
            >
              Exportar Excel
            </Button>
            <Link href="/dashboard/aprs/new" className={cn(buttonVariants(), 'inline-flex items-center')}>
              <Plus className="mr-2 h-4 w-4" />
              Nova APR
            </Link>
          </>
        }
        metrics={
          overviewMetrics
            ? [
                { label: 'Total APRs', value: overviewMetrics.totalAprs },
                { label: 'Aprovadas', value: overviewMetrics.aprovadas, tone: 'success' },
                { label: 'Pendentes', value: overviewMetrics.pendentes, tone: 'primary' },
                { label: 'Riscos críticos', value: overviewMetrics.riscosCriticos, tone: 'danger' },
                {
                  label: 'Média score',
                  value: overviewMetrics.mediaScoreRisco.toFixed(2),
                  tone: 'warning',
                },
              ]
            : undefined
        }
        toolbarContent={
          <AprFilters
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
          />
        }
        footer={
          filteredAprs.length > 0 ? (
            <PaginationControls
              page={page}
              lastPage={lastPage}
              total={total}
              onPrev={() => setPage((current) => Math.max(1, current - 1))}
              onNext={() => setPage((current) => Math.min(lastPage, current + 1))}
            />
          ) : null
        }
      >
        <AprInsights insights={insights} />

        {filteredAprs.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Nenhuma APR encontrada"
              description={
                searchTerm || statusFilter
                  ? 'Nenhum resultado corresponde aos filtros aplicados.'
                  : 'Ainda não existem APRs registradas para este tenant.'
              }
              action={
                !searchTerm && !statusFilter ? (
                  <Link href="/dashboard/aprs/new" className={cn(buttonVariants(), 'inline-flex items-center')}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nova APR
                  </Link>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 p-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredAprs.map((apr) => (
              <AprCard
                key={apr.id}
                apr={apr}
                onDelete={handleDelete}
                onPrint={handlePrint}
                onSendEmail={handleSendEmail}
                onDownloadPdf={handleDownloadPdf}
                onFinalize={handleFinalize}
                onReject={handleReject}
                onCreateNewVersion={handleCreateNewVersion}
              />
            ))}
          </div>
        )}
      </ListPageLayout>

      <StoredFilesPanel
        title="Arquivos APR (Storage)"
        description="PDFs salvos automaticamente por empresa, ano e semana."
        listStoredFiles={aprsService.listStoredFiles}
        getPdfAccess={aprsService.getPdfAccess}
        downloadWeeklyBundle={aprsService.downloadWeeklyBundle}
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
    </>
  );
}
