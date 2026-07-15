'use client';

import React from 'react';
import { Risk } from '@/services/risksService';
import { EmptyState } from '@/components/ui/state';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RisksTableRow } from './RisksTableRow';
import { ResponsiveDataList } from '@/components/ui/responsive-data-list';
import { CatalogMobileCard, catalogMobileActionClassName } from '../../components/CatalogMobileCard';
import { Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { safeToLocaleDateString } from '@/lib/date/safeFormat';

interface RisksTableProps {
  risks: Risk[];
  loading: boolean;
  onDelete: (id: string) => void;
}

export const RisksTable = React.memo(({
  risks,
  loading,
  onDelete,
}: RisksTableProps) => {
  if (!loading && risks.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          title="Nenhum risco encontrado"
          description="Nao ha riscos visiveis no recorte atual. Ajuste a busca ou cadastre um novo risco para iniciar o monitoramento."
          compact
        />
      </div>
    );
  }

  return (
    <ResponsiveDataList
      items={risks}
      getKey={(risk) => risk.id}
      mobileClassName="grid min-w-0 gap-3 p-3"
      loading={loading ? <div className="p-6 text-center text-sm text-[var(--ds-color-text-muted)]">Carregando riscos...</div> : null}
      desktop={() => (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Nome</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Data de criação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {risks.map((risk) => (
              <RisksTableRow key={risk.id} risk={risk} onDelete={onDelete} />
            ))}
          </TableBody>
        </Table>
      )}
      mobile={(risk) => (
        <CatalogMobileCard
          title={risk.nome}
          description={risk.descricao || 'Sem descrição'}
          fields={[{
            label: 'Data de criação',
            value: risk.created_at ? safeToLocaleDateString(risk.created_at, 'pt-BR', undefined, '—') : '—',
          }]}
          actionsLabel={`Ações do risco ${risk.nome}`}
          actions={
            <>
              <Link href={`/dashboard/risks/edit/${risk.id}`} className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), catalogMobileActionClassName)}>
                <Pencil className="h-4 w-4" /> Editar
              </Link>
              <Button type="button" size="sm" variant="outline" onClick={() => onDelete(risk.id)} className={cn(catalogMobileActionClassName, 'text-[var(--ds-color-danger)]')}>
                <Trash2 className="h-4 w-4" /> Excluir
              </Button>
            </>
          }
        />
      )}
    />
  );
});

RisksTable.displayName = 'RisksTable';
