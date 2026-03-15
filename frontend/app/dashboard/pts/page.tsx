'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileLock2, FileSpreadsheet, Plus } from 'lucide-react';
import Link from 'next/link';
import { downloadExcel } from '@/lib/download-excel';
import { usePts } from './hooks/usePts';
import { PtsFilters } from './components/PtsFilters';
import { PtsTable } from './components/PtsTable';
import { PtsInsights } from './components/PtsInsights';
import { PtApprovalRulesPanel } from './components/PtApprovalRulesPanel';
import { SendMailModal } from '@/components/SendMailModal';
import { StoredFilesPanel } from '@/components/StoredFilesPanel';
import { ptsService } from '@/services/ptsService';
import { PaginationControls } from '@/components/PaginationControls';
import { Button, buttonVariants } from '@/components/ui/button';
import { ErrorState, PageLoadingState } from '@/components/ui/state';
import { ListPageLayout } from '@/components/layout';
import { cn } from '@/lib/utils';

export default function PtsPage() {
  const [hasDraft, setHasDraft] = useState(false);
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
    approvalRules,
    approvalRulesLoading,
    approvingId,
    rejectingId,
    approvalIssuesById,
    approvalReviewLoadingId,
    approvalReviewById,
    approvalChecklistById,
    dismissApprovalIssue,
    dismissApprovalReview,
    updateApprovalChecklist,
    handleDelete,
    handleDownloadPdf,
    handleSendEmail,
    handlePrint,
    handlePrepareApproval,
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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const keys = Object.keys(window.localStorage);
    setHasDraft(
      keys.some(
        (key) =>
          key.startsWith('gst.pt.wizard.draft.') ||
          key.startsWith('compliancex.pt.wizard.draft.'),
      ),
    );
  }, []);

  const metrics = useMemo(() => {
    const approved = filteredPts.filter((pt) => pt.status === 'Aprovada').length;
    const pending = filteredPts.filter((pt) => pt.status === 'Pendente').length;
    const finalized = filteredPts.filter((pt) => Boolean(pt.pdf_file_key)).length;

    return { approved, pending, finalized };
  }, [filteredPts]);

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
    <>
      <ListPageLayout
        eyebrow="Permissão operacional"
        title="Permissão de Trabalho (PT)"
        description="Gerencie permissões emitidas, acompanhe aprovações e rastreie documentos operacionais em uma visão mais limpa e direta."
        icon={<FileLock2 className="h-5 w-5" />}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<FileSpreadsheet className="h-4 w-4 text-[var(--ds-color-success)]" />}
              onClick={() => downloadExcel('/pts/export/excel', 'pts.xlsx')}
            >
              Exportar Excel
            </Button>
            {hasDraft ? (
              <Link href="/dashboard/pts/new" className={cn(buttonVariants({ variant: 'outline' }), 'inline-flex items-center')}>
                Retomar rascunho
              </Link>
            ) : null}
            <Link
              href="/dashboard/pts/new?field=1"
              className={cn(buttonVariants({ variant: 'outline' }), 'inline-flex items-center')}
            >
              PT em campo
            </Link>
            <Link href="/dashboard/pts/new" className={cn(buttonVariants(), 'inline-flex items-center')}>
              <Plus className="mr-2 h-4 w-4" />
              Nova PT
            </Link>
          </>
        }
        metrics={[
          {
            label: 'PTs visíveis',
            value: filteredPts.length,
            note: `${total} registro(s) no recorte atual.`,
          },
          {
            label: 'Pendentes',
            value: metrics.pending,
            note: 'Aguardando avanço ou aprovação.',
            tone: 'warning',
          },
          {
            label: 'Aprovadas',
            value: metrics.approved,
            note: 'PTs prontas para governança final.',
            tone: 'success',
          },
          {
            label: 'Com PDF final',
            value: metrics.finalized,
            note: 'Documentos já governados e congelados.',
            tone: 'primary',
          },
        ]}
        toolbarTitle="Base de PTs"
        toolbarDescription="Pesquise permissões, filtre por status e acompanhe os bloqueios sem se perder em contêineres redundantes."
        toolbarContent={
          <PtsFilters
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
          />
        }
        footer={
          filteredPts.length > 0 ? (
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
        <div className="space-y-4">
          {insights.length > 0 ? <PtsInsights insights={insights} /> : null}

          <PtApprovalRulesPanel
            rules={approvalRules}
            loading={approvalRulesLoading}
          />

          <PtsTable
            pts={filteredPts}
            loading={loading}
            onDelete={handleDelete}
            onPrint={handlePrint}
            onSendEmail={handleSendEmail}
            onDownloadPdf={handleDownloadPdf}
            onPrepareApproval={handlePrepareApproval}
            onApprove={handleApprove}
            onReject={handleReject}
            approvingId={approvingId}
            rejectingId={rejectingId}
            approvalReviewLoadingId={approvalReviewLoadingId}
            approvalIssuesById={approvalIssuesById}
            approvalReviewById={approvalReviewById}
            approvalChecklistById={approvalChecklistById}
            onDismissApprovalIssue={dismissApprovalIssue}
            onDismissApprovalReview={dismissApprovalReview}
            onUpdateApprovalChecklist={updateApprovalChecklist}
          />
        </div>
      </ListPageLayout>

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
    </>
  );
}
