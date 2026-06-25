import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ResponsiveTableProps {
  /**
   * Visao de tabela — renderizada em telas >= lg (1024px).
   * Deve ser uma <Table> do design system.
   */
  tableView: ReactNode;
  /**
   * Visao de cards — renderizada em telas < lg.
   * Tipicamente um grid de cards com as mesmas informacoes.
   * Se omitido, a tabela ficara visivel em todos os breakpoints
   * com scroll horizontal.
   */
  cardView?: ReactNode;
  /**
   * Padding ao redor da visao de cards.
   * @default 'p-4'
   */
  cardPadding?: string;
  className?: string;
}

/**
 * ResponsiveTable — padrao oficial para exibicao de dados tabulares.
 *
 * Em telas largas (>= lg) exibe a tabela completa.
 * Em telas estreitas (< lg) exibe `cardView` caso fornecido,
 * ou scrolls a tabela horizontalmente caso contrario.
 *
 * ```tsx
 * <ResponsiveTable
 *   tableView={<AprsTable aprs={data} />}
 *   cardView={
 *     <div className="grid gap-4">
 *       {data.map(apr => <AprCard key={apr.id} apr={apr} />)}
 *     </div>
 *   }
 * />
 * ```
 */
export function ResponsiveTable({
  tableView,
  cardView,
  cardPadding = 'p-4',
  className,
}: ResponsiveTableProps) {
  if (!cardView) {
    // Sem visao alternativa: tabela em todos os breakpoints com scroll horizontal
    return <div className={cn('w-full overflow-x-auto', className)}>{tableView}</div>;
  }

  return (
    <div className={className}>
      {/* Tabela — visivel em lg+ */}
      <div className="hidden lg:block">{tableView}</div>

      {/* Cards — visivel abaixo de lg */}
      <div className={cn('lg:hidden', cardPadding)}>{cardView}</div>
    </div>
  );
}
