'use client';

import { useRisks } from './hooks/useRisks';
import { AlertTriangle, Plus } from 'lucide-react';
import Link from 'next/link';
import { RisksFilters } from './components/RisksFilters';
import { RisksTable } from './components/RisksTable';
import { PaginationControls } from '@/components/PaginationControls';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

  return (
    <div className="ds-crud-page">
      <Card tone="elevated" padding="lg" className="ds-crud-hero">
        <CardHeader className="ds-crud-hero__header md:flex-row md:items-start md:justify-between">
          <div className="ds-crud-hero__lead">
            <div className="ds-crud-hero__icon">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="ds-crud-hero__copy">
              <span className="ds-crud-hero__eyebrow">Mapa de riscos</span>
              <CardTitle className="text-2xl">Riscos</CardTitle>
              <CardDescription>Gerencie os riscos identificados no sistema.</CardDescription>
            </div>
          </div>
          <Link
            href="/dashboard/risks/new"
            className={cn(buttonVariants(), 'inline-flex items-center')}
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo risco
          </Link>
        </CardHeader>
      </Card>

      <div className="ds-crud-stats">
        <Card interactive padding="md" className="ds-crud-stat ds-crud-stat--neutral">
          <CardHeader className="gap-2">
            <CardDescription className="ds-crud-stat__label">Total monitorado</CardDescription>
            <CardTitle className="ds-crud-stat__value">{total}</CardTitle>
            <CardDescription className="ds-crud-stat__note">
              Quantidade disponível no recorte atual.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card interactive padding="md" className="ds-crud-stat ds-crud-stat--primary">
          <CardHeader className="gap-2">
            <CardDescription className="ds-crud-stat__label">Resultados visíveis</CardDescription>
            <CardTitle className="ds-crud-stat__value text-[var(--ds-color-action-primary)]">
              {filteredRisks.length}
            </CardTitle>
            <CardDescription className="ds-crud-stat__note">
              Itens exibidos após aplicar a busca.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card tone="default" padding="none" className="ds-crud-filter-card">
        <RisksFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} />

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
      </Card>
    </div>
  );
}
