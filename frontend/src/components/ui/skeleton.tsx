import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-[var(--ds-radius-sm)] bg-[color:var(--ds-color-surface-muted)]',
        className,
      )}
    />
  );
}

export function StatCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Carregando cartao de estatistica"
      aria-busy="true"
      className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-base)] p-5 shadow-[var(--component-card-shadow)]"
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-4 w-14" />
      </div>
      <Skeleton className="mt-5 h-8 w-24" />
      <Skeleton className="mt-3 h-4 w-32" />
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Carregando card"
      aria-busy="true"
      className="space-y-4 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-base)] p-5 shadow-[var(--component-card-shadow)]"
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-16 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-3 w-20 rounded-full" />
        <Skeleton className="h-3 w-20 rounded-full" />
      </div>
      <div className="flex justify-end gap-2 border-t border-[var(--ds-color-border-subtle)] pt-3">
        <Skeleton className="h-7 w-7 rounded-[var(--ds-radius-md)]" />
        <Skeleton className="h-7 w-7 rounded-[var(--ds-radius-md)]" />
        <Skeleton className="h-7 w-7 rounded-[var(--ds-radius-md)]" />
      </div>
    </div>
  );
}

export function TableRowSkeleton({ cols }: { cols: number }) {
  return (
    <tr aria-hidden="true">
      {Array.from({ length: cols }).map((_, i) => (
        // px-4 py-3.5 alinha com TableCell para evitar salto visual ao carregar
        <td key={i} className="px-4 py-3.5">
          <Skeleton className="h-4 w-full max-w-[180px]" />
        </td>
      ))}
    </tr>
  );
}

/**
 * TableSkeleton — bloco completo de skeleton para tabela.
 * Renderiza um thead falso + N linhas de skeleton.
 * Use dentro de <TableBody> quando os dados ainda estao carregando.
 *
 * ```tsx
 * <TableBody>
 *   {loading
 *     ? <TableSkeleton cols={5} rows={8} />
 *     : data.map(row => <TableRow key={row.id}>...</TableRow>)
 *   }
 * </TableBody>
 * ```
 */
export function TableSkeleton({
  cols,
  rows = 5,
}: {
  cols: number;
  rows?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} cols={cols} />
      ))}
    </>
  );
}

export function PageSkeleton({
  cards = 4,
  tableRows = 5,
}: {
  cards?: number;
  tableRows?: number;
}) {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: cards }).map((_, index) => (
          <StatCardSkeleton key={index} />
        ))}
      </div>
      <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-base)] p-5 shadow-[var(--component-card-shadow)]">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: tableRows }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
