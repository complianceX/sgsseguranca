"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export interface DashboardPrimaryActionItem {
  label: string;
  href: string;
  Icon: LucideIcon;
}

export interface DashboardPrimaryActionsProps {
  items: DashboardPrimaryActionItem[];
}

export function DashboardPrimaryActions({
  items,
}: DashboardPrimaryActionsProps) {
  return (
    <section aria-label="Ações prioritárias do dashboard" className="space-y-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--ds-color-text-secondary)]">
          Trabalho imediato
        </p>
        <h2 className="mt-1 text-base font-bold text-[var(--title)]">
          Ações prioritárias
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {items.map(({ label, href, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-label={label}
            className="ds-dashboard-link-card ds-dashboard-link-card--center min-h-[112px] px-3 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-action-primary)]"
          >
            <span className="ds-dashboard-link-card__icon h-10 w-10" aria-hidden="true">
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-center text-[12px] font-semibold leading-tight text-[var(--ds-color-text-secondary)]">
              {label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
