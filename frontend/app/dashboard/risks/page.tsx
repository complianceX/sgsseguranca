'use client';

import { useRisks } from './hooks/useRisks';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { RisksFilters } from './components/RisksFilters';
import { RisksTable } from './components/RisksTable';
import { PaginationControls } from '@/components/PaginationControls';

export default function RisksPage() {
  const {
    loading,
    page,
    lastPage,
    total,
    setPage,
    searchTerm,
    setSearchTerm,
    filteredRisks,
    handleDelete,
  } = useRisks();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Riscos</h1>
          <p className="text-gray-500">Gerencie os riscos identificados no sistema.</p>
        </div>
        <Link
          href="/dashboard/risks/new"
          className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 shadow-sm"
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo Risco
        </Link>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <RisksFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />

        <RisksTable
          risks={filteredRisks}
          loading={loading}
          onDelete={handleDelete}
        />
        {!loading && total > 0 ? (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(lastPage, current + 1))}
          />
        ) : null}
      </div>
    </div>
  );
}
