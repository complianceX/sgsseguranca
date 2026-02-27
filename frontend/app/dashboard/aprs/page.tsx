'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { SendMailModal } from '@/components/SendMailModal';
import { useAprs } from './hooks/useAprs';
import { AprCard } from './components/AprCard';
import { AprInsights } from './components/AprInsights';
import { AprFilters } from './components/AprFilters';
import { StoredFilesPanel } from '@/components/StoredFilesPanel';
import { aprsService } from '@/services/aprsService';

export default function AprsPage() {
  const {
    loading,
    searchTerm,
    setSearchTerm,
    insights,
    overviewMetrics,
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
  } = useAprs();

  const companyOptions = Array.from(
    new Map(
      filteredAprs
        .filter((item) => item.company_id)
        .map((item) => [
          item.company_id,
          item.company?.razao_social || item.company_id,
        ]),
    ).entries(),
  ).map(([id, name]) => ({ id, name }));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Análise Preliminar de Risco (APR)</h1>
          <p className="text-gray-500">Gerencie as APRs emitidas para as obras e setores.</p>
        </div>
        <Link
          href="/dashboard/aprs/new"
          className="flex items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-700 hover:scale-105 active:scale-95"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nova APR
        </Link>
      </div>

      <AprInsights insights={insights} />

      {overviewMetrics && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Total APRs" value={overviewMetrics.totalAprs} />
          <MetricCard label="Aprovadas" value={overviewMetrics.aprovadas} />
          <MetricCard label="Pendentes" value={overviewMetrics.pendentes} />
          <MetricCard label="Riscos Críticos" value={overviewMetrics.riscosCriticos} />
          <MetricCard
            label="Média Score"
            value={overviewMetrics.mediaScoreRisco.toFixed(2)}
          />
        </div>
      )}

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <AprFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} />

        <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <div className="col-span-full flex flex-col items-center justify-center py-20 space-y-4">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
              <p className="text-sm text-gray-500 font-medium">Carregando APRs...</p>
            </div>
          ) : filteredAprs.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-20 space-y-2">
              <div className="rounded-full bg-gray-50 p-4">
                <Plus className="h-8 w-8 text-gray-300" />
              </div>
              <p className="text-gray-500 font-medium">Nenhuma APR encontrada.</p>
              <p className="text-xs text-gray-400">Tente ajustar sua busca ou crie uma nova APR.</p>
            </div>
          ) : (
            filteredAprs.map((apr) => (
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
            ))
          )}
        </div>
      </div>

      <StoredFilesPanel
        title="Arquivos APR (Storage)"
        description="PDFs salvos automaticamente por empresa/ano/semana."
        listStoredFiles={aprsService.listStoredFiles}
        getPdfAccess={aprsService.getPdfAccess}
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

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
