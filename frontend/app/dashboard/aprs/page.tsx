'use client';

import { FileSpreadsheet, Plus } from 'lucide-react';
import { downloadExcel } from '@/lib/download-excel';
import Link from 'next/link';
import { SendMailModal } from '@/components/SendMailModal';
import { useAprs } from './hooks/useAprs';
import { AprCard } from './components/AprCard';
import { AprInsights } from './components/AprInsights';
import { AprFilters } from './components/AprFilters';
import { StoredFilesPanel } from '@/components/StoredFilesPanel';
import { aprsService } from '@/services/aprsService';
import { PaginationControls } from '@/components/PaginationControls';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import {
  EmptyState,
  ErrorState,
  PageLoadingState,
} from '@/components/ui/state';
import { cn } from '@/lib/utils';

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
    <div className="space-y-6">
      <Card tone="elevated" padding="lg">
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-2xl">Análise Preliminar de Risco (APR)</CardTitle>
            <CardDescription>
              Gerencie APRs emitidas por obra, acompanhe riscos críticos e controle versões aprovadas.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
        </CardHeader>
      </Card>

      <AprInsights insights={insights} />

      {overviewMetrics ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Total APRs" value={overviewMetrics.totalAprs} />
          <MetricCard label="Aprovadas (pág.)" value={overviewMetrics.aprovadas} tone="success" />
          <MetricCard label="Pendentes (pág.)" value={overviewMetrics.pendentes} tone="primary" />
          <MetricCard
            label="Riscos críticos (pág.)"
            value={overviewMetrics.riscosCriticos}
            tone="danger"
          />
          <MetricCard
            label="Média score"
            value={overviewMetrics.mediaScoreRisco.toFixed(2)}
            tone="warning"
          />
        </div>
      ) : null}

      <Card tone="default" padding="none">
        <AprFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
        />

        <CardContent className="mt-0">
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
                    <Link
                      href="/dashboard/aprs/new"
                      className={cn(buttonVariants(), 'inline-flex items-center')}
                    >
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
        </CardContent>

        {filteredAprs.length > 0 ? (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(lastPage, current + 1))}
          />
        ) : null}
      </Card>

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
        />
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-[var(--ds-color-success)]'
      : tone === 'warning'
        ? 'text-[var(--ds-color-warning)]'
        : tone === 'danger'
          ? 'text-[var(--ds-color-danger)]'
          : tone === 'primary'
            ? 'text-[var(--ds-color-action-primary)]'
            : 'text-[var(--ds-color-text-primary)]';

  return (
    <Card interactive padding="md">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={cn('text-3xl', toneClass)}>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
