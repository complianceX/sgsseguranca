'use client';

import { usePts } from './hooks/usePts';
import { FileSpreadsheet, Plus } from 'lucide-react';
import { downloadExcel } from '@/lib/download-excel';
import Link from 'next/link';
import { PtsFilters } from './components/PtsFilters';
import { PtsTable } from './components/PtsTable';
import { PtsInsights } from './components/PtsInsights';
import { SendMailModal } from '@/components/SendMailModal';
import { StoredFilesPanel } from '@/components/StoredFilesPanel';
import { ptsService } from '@/services/ptsService';
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
  ErrorState,
  PageLoadingState,
} from '@/components/ui/state';
import { cn } from '@/lib/utils';

export default function PtsPage() {
  const {
    loading,
    loadError,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    insights,
    page,
    setPage,
    total,
    lastPage,
    isMailModalOpen,
    setIsMailModalOpen,
    selectedDoc,
    setSelectedDoc,
    filteredPts,
    handleDelete,
    handleDownloadPdf,
    handleSendEmail,
    handlePrint,
    handleApprove,
    handleReject,
    loadPts,
  } = usePts();

  const companyOptions = Array.from(
    new Map(
      filteredPts
        .filter((item) => item.company_id)
        .map((item) => [item.company_id, item.company_id]),
    ).entries(),
  ).map(([id, name]) => ({ id, name }));

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando PTs"
        description="Buscando permissões de trabalho, status operacionais e arquivos armazenados."
        cards={4}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar PTs"
        description={loadError}
        action={
          <Button type="button" onClick={loadPts}>
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
            <CardTitle className="text-2xl">Permissão de Trabalho (PT)</CardTitle>
            <CardDescription>
              Gerencie permissões emitidas, acompanhe aprovações e rastreie documentos operacionais.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<FileSpreadsheet className="h-4 w-4 text-[var(--ds-color-success)]" />}
              onClick={() => downloadExcel('/pts/export/excel', 'pts.xlsx')}
            >
              Exportar Excel
            </Button>
            <Link href="/dashboard/pts/new" className={cn(buttonVariants(), 'inline-flex items-center')}>
              <Plus className="mr-2 h-4 w-4" />
              Nova PT
            </Link>
          </div>
        </CardHeader>
      </Card>

      <PtsInsights insights={insights} />

      <Card tone="default" padding="none">
        <PtsFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
        />

        <CardContent className="mt-0">
          <PtsTable
            pts={filteredPts}
            loading={loading}
            onDelete={handleDelete}
            onPrint={handlePrint}
            onSendEmail={handleSendEmail}
            onDownloadPdf={handleDownloadPdf}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        </CardContent>

        {filteredPts.length > 0 ? (
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
        title="Arquivos PT (Storage)"
        description="PDFs salvos automaticamente por empresa, ano e semana."
        listStoredFiles={ptsService.listStoredFiles}
        getPdfAccess={ptsService.getPdfAccess}
        downloadWeeklyBundle={ptsService.downloadWeeklyBundle}
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
