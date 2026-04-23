"use client";

import { memo, useMemo } from "react";
import { differenceInDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useDashboardData } from "@/hooks/useDashboardData";
import { DashboardSectionBoundary } from "@/components/dashboard/DashboardSectionBoundary";

function parseValidDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const EMPTY_LIST: never[] = [];

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded-lg bg-[var(--ds-color-border-subtle)]", className)}
      aria-hidden="true"
    />
  );
}

const ProgressBar = memo(function ProgressBar({
  pct,
  colorClass,
  ariaLabel,
}: {
  pct: number;
  colorClass: string;
  ariaLabel?: string;
}) {
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-[var(--ds-color-surface-muted)]"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <div
        className={cn(
          "h-full rounded-full",
          colorClass,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
});

function SiteComplianceComponent() {
  const dashboardData = useDashboardData();
  const summaryLoading = dashboardData.summary.loading;
  const summary = dashboardData.summary.data;

  const expiringEpis = summary?.expiringEpis ?? EMPTY_LIST;
  const expiringTrainings = summary?.expiringTrainings ?? EMPTY_LIST;
  const actionPlanItems = summary?.actionPlanItems ?? EMPTY_LIST;
  const siteCompliance = summary?.siteCompliance ?? EMPTY_LIST;

  type AgendaTone = "info" | "warning" | "success" | "danger";
  type AgendaEvent = {
    date: Date;
    label: string;
    sub: string;
    tone: AgendaTone;
    href: string;
  };

  const agendaEvents = useMemo<AgendaEvent[]>(() => {
    const events: AgendaEvent[] = [];
    const now = new Date();

    for (const epi of expiringEpis.slice(0, 3)) {
      const d = parseValidDate(epi.validade_ca);
      if (!d) continue;
      const overdue = d < now;
      events.push({
        date: d,
        label: `EPI: ${epi.nome}`,
        sub: overdue
          ? "CA vencido"
          : `CA vence em ${differenceInDays(d, now)}d`,
        tone: overdue ? "danger" : "warning",
        href: "/dashboard/epis",
      });
    }

    for (const tr of expiringTrainings.slice(0, 3)) {
      const d = parseValidDate(tr.data_vencimento);
      if (!d) continue;
      const overdue = d < now;
      events.push({
        date: d,
        label: tr.nome,
        sub: tr.user
          ? `${tr.user.nome}${overdue ? " — vencido" : ""}`
          : overdue
            ? "Vencido"
            : `Vence em ${differenceInDays(d, now)}d`,
        tone: overdue ? "danger" : "warning",
        href: "/dashboard/trainings",
      });
    }

    for (const action of actionPlanItems.slice(0, 2)) {
      const d = parseValidDate(action.prazo);
      events.push({
        date: d ?? now,
        label: action.title,
        sub: action.responsavel ? `Resp: ${action.responsavel}` : "Ação pendente",
        tone: "info",
        href: action.href,
      });
    }

    return events
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 5);
  }, [expiringEpis, expiringTrainings, actionPlanItems]);

  return (
    <DashboardSectionBoundary fallbackTitle="Compliance por Site">
      <section
        aria-label="Agenda de eventos"
        className="overflow-hidden rounded-2xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-xs)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--ds-color-border-default)] px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ds-color-text-secondary)]">
              Agenda
            </p>
            <h2 className="text-[14px] font-bold text-[var(--title)]">Próximos eventos</h2>
          </div>
          <Link
            href="/dashboard/calendar"
            aria-label="Abrir calendário completo"
            className="text-xs font-semibold text-[var(--ds-color-action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-action-primary)] rounded-md px-1"
          >
            Calendário →
          </Link>
        </div>
        <div className="space-y-px p-3">
          {summaryLoading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))
          ) : agendaEvents.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-[var(--ds-color-text-secondary)]">
              Nenhum evento próximo encontrado.
            </p>
          ) : (
            agendaEvents.map((ev, i) => {
              const tone = ev.tone;
              const dayLabel = format(ev.date, "dd", { locale: ptBR });
              const monthLabel = format(ev.date, "EEE", { locale: ptBR })
                .toUpperCase()
                .slice(0, 3);
              return (
                <Link
                  key={i}
                  href={ev.href}
                  aria-label={`${ev.label} — ${ev.sub}`}
                  className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-3 hover:border-[var(--ds-color-border-subtle)] hover:bg-[var(--ds-color-surface-muted)] focus-visible:bg-[var(--ds-color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-action-primary)]"
                >
                  <div
                    className={cn(
                      "flex w-11 shrink-0 flex-col items-center justify-center rounded-lg border py-1.5",
                      tone === "info" && "bg-[var(--ds-color-info-subtle)]",
                      tone === "warning" && "bg-[var(--ds-color-warning-subtle)]",
                      tone === "success" && "bg-[var(--ds-color-success-subtle)]",
                      tone === "danger" && "bg-[var(--ds-color-danger-subtle)]",
                    )}
                    aria-hidden="true"
                  >
                    <span
                      className={cn(
                        "text-[10px] font-bold uppercase",
                        tone === "info" && "text-[var(--ds-color-info-fg)]",
                        tone === "warning" && "text-[var(--ds-color-warning-fg)]",
                        tone === "success" && "text-[var(--ds-color-success-fg)]",
                        tone === "danger" && "text-[var(--ds-color-danger-fg)]",
                      )}
                    >
                      {monthLabel}
                    </span>
                    <span
                      className={cn(
                        "text-[18px] font-black leading-none",
                        tone === "info" && "text-[var(--ds-color-info)]",
                        tone === "warning" && "text-[var(--ds-color-warning)]",
                        tone === "success" && "text-[var(--ds-color-success)]",
                        tone === "danger" && "text-[var(--ds-color-danger)]",
                      )}
                    >
                      {dayLabel}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[var(--ds-color-text-primary)]">
                      {ev.label}
                    </p>
                    <p className="truncate text-xs text-[var(--ds-color-text-secondary)]">
                      {ev.sub}
                    </p>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        <div className="border-t border-[var(--ds-color-border-default)] px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ds-color-text-secondary)]">
              Performance
            </p>
            <Link
              href="/dashboard/kpis"
              aria-label="Ver detalhes de KPIs"
            className="text-xs font-semibold text-[var(--ds-color-action-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ds-color-action-primary)] rounded"
            >
              Detalhes →
            </Link>
          </div>
          <p className="mb-3 text-[13px] font-semibold text-[var(--ds-color-text-primary)]">
            Obras por conformidade
          </p>
          {summaryLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-6 w-full rounded-lg" />
              ))}
            </div>
          ) : siteCompliance.length === 0 ? (
            <p className="text-xs text-[var(--ds-color-text-secondary)]">
              Nenhuma obra encontrada.
            </p>
          ) : (
            <div className="space-y-2.5">
              {siteCompliance.slice(0, 5).map((site) => (
                <div key={site.id}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="truncate text-[var(--ds-color-text-secondary)]">
                      {site.nome}
                    </span>
                    <span className="ml-2 shrink-0 font-bold text-[var(--ds-color-text-primary)]">
                      {site.taxa}%
                    </span>
                  </div>
                  <ProgressBar
                    pct={site.taxa}
                    colorClass={
                      site.taxa >= 90
                        ? "bg-[var(--ds-color-success)]"
                        : site.taxa >= 70
                          ? "bg-[var(--ds-color-warning)]"
                          : "bg-[var(--ds-color-danger)]"
                    }
                    ariaLabel={`${site.nome}: ${site.taxa}% de conformidade`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </DashboardSectionBoundary>
  );
}

export const SiteCompliance = memo(SiteComplianceComponent);
