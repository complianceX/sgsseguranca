import * as React from 'react';
import { cn } from '@/lib/utils';

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-table-bg)] shadow-[var(--component-card-shadow)]">
      <table ref={ref} className={cn('w-full caption-bottom text-[13px]', className)} {...props} />
    </div>
  ),
);
Table.displayName = 'Table';

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn('sticky top-0 z-[1] [&_tr]:border-b', className)} {...props} />
  ),
);
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
  ),
);
TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot
      ref={ref}
      className={cn(
        'border-t border-[var(--component-table-row-border)] bg-[color:var(--component-table-footer-bg)] font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  ),
);
TableFooter.displayName = 'TableFooter';

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'border-b border-[var(--component-table-row-border)] transition-colors hover:bg-[color:var(--component-table-row-hover)] data-[state=selected]:bg-[color:var(--component-table-row-selected)]',
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'h-10 border-b border-[var(--component-table-row-border)] bg-[color:var(--component-table-header-bg)] px-3.5 text-left align-middle text-[10.5px] font-bold uppercase tracking-[0.04em] text-[var(--component-table-header-text)] [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn('px-3.5 py-3 align-middle text-[var(--ds-color-text-secondary)] [&:has([role=checkbox])]:pr-0', className)}
      {...props}
    />
  ),
);
TableCell.displayName = 'TableCell';

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption
      ref={ref}
      className={cn('mt-3 text-[13px] text-[var(--ds-color-text-muted)]', className)}
      {...props}
    />
  ),
);
TableCaption.displayName = 'TableCaption';

export { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption };
