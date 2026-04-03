'use client';

import { AlertTriangle, Plus } from 'lucide-react';
import Link from 'next/link';
import { useCallback } from 'react';
import { useRisks } from './hooks/useRisks';
import { RisksFilters } from './components/RisksFilters';
import { RisksTable } from './components/RisksTable';
import { PaginationControls } from '@/components/PaginationControls';
import { buttonVariants } from '@/components/ui/button';
import { ListPageLayout } from '@/components/layout';
import { cn } from '@/lib/utils';

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

  const handlePrevPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, [setPage]);

  const handleNextPage = useCallback(() => {
    setPage((current) => Math.min(lastPage, current + 1));
  }, [lastPage, setPage]);

  return (
    <ListPageLayout
      eyebrow="Mapa de riscos"
      title="Riscos"
      description="Gerencie os riscos identificados no sistema."
      icon={<AlertTriangle className="h-5 w-5" />}
      actions={
        <Link href="/dashboard/risks/new" className={cn(buttonVariants(), 'inline-flex items-center')}>
          <Plus className="mr-2 h-4 w-4" />
          Novo risco
        </Link>
      }
      metrics={[
        {
          label: 'Total monitorado',
          value: total,
          note: 'Quantidade disponivel no recorte atual.',
        },
        {
          label: 'Resultados visiveis',
          value: filteredRisks.length,
          note: 'Itens exibidos apos aplicar a busca.',
          tone: 'primary',
        },
      ]}
      toolbarTitle="Base de riscos"
      toolbarDescription={`${total} risco(s) monitorado(s) no recorte atual.`}
      toolbarContent={
        <RisksFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} />
      }
      footer={
        !loading && total > 0 ? (
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
      <RisksTable risks={filteredRisks} loading={loading} onDelete={handleDelete} />
    </ListPageLayout>
  );
}

