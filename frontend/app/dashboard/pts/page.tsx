'use client';

import { usePts } from './hooks/usePts';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { PtsFilters } from './components/PtsFilters';
import { PtsTable } from './components/PtsTable';
import { PtsInsights } from './components/PtsInsights';
import { SendMailModal } from '@/components/SendMailModal';
import { StoredFilesPanel } from '@/components/StoredFilesPanel';
import { ptsService } from '@/services/ptsService';

export default function PtsPage() {
  const {
    loading,
    searchTerm,
    setSearchTerm,
    insights,
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
  } = usePts();

  const companyOptions = Array.from(
    new Map(
      filteredPts
        .filter((item) => item.company_id)
        .map((item) => [item.company_id, item.company_id]),
    ).entries(),
  ).map(([id, name]) => ({ id, name }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Permissão de Trabalho (PT)</h1>
          <p className="text-gray-500">Gerencie as Permissões de Trabalho emitidas.</p>
        </div>
        <Link
          href="/dashboard/pts/new"
          className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-blue-700 shadow-lg shadow-blue-600/20 hover:scale-105 active:scale-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova PT
        </Link>
      </div>

      <PtsInsights insights={insights} />

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden transition-all hover:shadow-md">
        <PtsFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />

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
      </div>

      <StoredFilesPanel
        title="Arquivos PT (Storage)"
        description="PDFs salvos automaticamente por empresa/ano/semana."
        listStoredFiles={ptsService.listStoredFiles}
        getPdfAccess={ptsService.getPdfAccess}
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
