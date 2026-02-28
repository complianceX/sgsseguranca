'use client';

import { useChecklists } from './hooks/useChecklists';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { SendMailModal } from '@/components/SendMailModal';
import { ChecklistsFilters } from './components/ChecklistsFilters';
import { ChecklistsTable } from './components/ChecklistsTable';
import { ChecklistInsights } from './components/ChecklistInsights';
import { StoredFilesPanel } from '@/components/StoredFilesPanel';
import { checklistsService } from '@/services/checklistsService';
import { PaginationControls } from '@/components/PaginationControls';

export default function ChecklistsPage() {
  const {
    loading,
    searchTerm,
    setSearchTerm,
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Checklists de Inspeção</h1>
          <p className="text-gray-500">Gerencie as inspeções e verificações realizadas.</p>
        </div>
        <Link
          href="/dashboard/checklists/new"
          className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 shadow-sm"
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo Checklist
        </Link>
      </div>

      <ChecklistInsights insights={insights} />

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <ChecklistsFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          modelFilter={modelFilter}
          onModelFilterChange={setModelFilter}
          onExportCsv={handleExportCsv}
        />

        <ChecklistsTable
          checklists={filteredChecklists}
          loading={loading}
          analyzingId={analyzingId}
          printingId={printingId}
          onAiAnalysis={handleAiAnalysis}
          onPrint={handlePrint}
          onDownloadPdf={handleDownloadPdf}
          onSendEmail={handleSendEmail}
          onDelete={handleDelete}
        />

        {!loading && (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
          />
        )}
      </div>

      <StoredFilesPanel
        title="Arquivos Checklist (Storage)"
        description="PDFs salvos automaticamente por empresa/ano/semana."
        listStoredFiles={checklistsService.listStoredFiles}
        getPdfAccess={checklistsService.getPdfAccess}
        companyOptions={companyOptions}
      />

      {selectedDoc && (
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
      )}
    </div>
  );
}
