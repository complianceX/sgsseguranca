'use client';

import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ActionItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
}

interface ActionMenuProps {
  items: ActionItem[];
}

export function ActionMenu({ items }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md p-2 text-[var(--ds-color-text-muted)] transition-colors hover:bg-[color:var(--ds-color-surface-muted)]/72 hover:text-[var(--ds-color-text-primary)]"
        title="Ações"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-48 overflow-hidden rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-elevated)] shadow-[var(--ds-shadow-md)]">
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={cn(
                'flex w-full items-center gap-2 px-4 py-2.5 text-sm transition-colors',
                item.variant === 'danger'
                  ? 'text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]'
                  : 'text-[var(--ds-color-text-secondary)] hover:bg-[color:var(--ds-color-surface-muted)]/76 hover:text-[var(--ds-color-text-primary)]',
              )}
            >
              <span className="h-4 w-4 shrink-0">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
