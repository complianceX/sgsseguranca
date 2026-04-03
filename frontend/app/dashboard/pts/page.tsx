'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileLock2, FileSpreadsheet, Plus } from 'lucide-react';
import Link from 'next/link';
import { downloadExcel } from '@/lib/download-excel';
import { usePts } from './hooks/usePts';
import { PtsFilters } from './components/PtsFilters';
import { PtsTable } from './components/PtsTable';
import { PtsInsights } from './components/PtsInsights';
import { PtApprovalRulesPanel } from './components/PtApprovalRulesPanel';
import { ptsService } from '@/services/ptsService';
import { PaginationControls } from '@/components/PaginationControls';
import { Button, buttonVariants } from '@/components/ui/button';
import { ErrorState, PageLoadingState } from '@/components/ui/state';
import { ListPageLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

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
      <div className="mt-6 h-40 animate-pulse rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)]/60" />
    ),
  },
);

export default function PtsPage() {
  const { hasPermission } = useAuth();
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
    overviewMetrics,
    approvingId,
    rejectingId,
    finalizingId,
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
    handleFinalize,
    loadPts,
  } = usePts();

  const handlePrevPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, [setPage]);

  const handleNextPage = useCallback(() => {
    setPage((current) => Math.min(lastPage, current + 1));
  }, [lastPage, setPage]);

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

  const metrics = useMemo(
    () =>
      overviewMetrics || {
        totalPts: 0,
        aprovadas: 0,
        pendentes: 0,
        canceladas: 0,
        encerradas: 0,
        expiradas: 0,
      },
    [overviewMetrics],
  );
  const canManagePt = hasPermission('can_manage_pt');

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
            {canManagePt && hasDraft ? (
              <Link href="/dashboard/pts/new" className={cn(buttonVariants({ variant: 'outline' }), 'inline-flex items-center')}>
                Retomar rascunho
              </Link>
            ) : null}
            {canManagePt ? (
              <>
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
            ) : null}
          </>
        }
        metrics={[
          {
            label: 'Pendentes',
            value: metrics.pendentes,
            note: 'Base consolidada da empresa.',
            tone: 'warning',
          },
          {
            label: 'Aprovadas',
            value: metrics.aprovadas,
            note: 'Prontas para governança final ou encerramento.',
            tone: 'success',
          },
          {
            label: 'Encerradas',
            value: metrics.encerradas,
            note: 'Fluxo formalmente concluído.',
            tone: 'neutral',
          },
          {
            label: 'Expiradas',
            value: metrics.expiradas,
            note: 'Validade operacional vencida.',
            tone: 'warning',
          },
        ]}
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
              onPrev={handlePrevPage}
              onNext={handleNextPage}
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
            onFinalize={handleFinalize}
            approvingId={approvingId}
            rejectingId={rejectingId}
            finalizingId={finalizingId}
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
          storedDocument={selectedDoc.storedDocument}
        />
      ) : null}
    </>
  );
}

