"use client";

import { memo, useMemo } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardData } from "@/hooks/useDashboardData";
import { DashboardSectionBoundary } from "@/components/dashboard/DashboardSectionBoundary";

const PRIORITY_CONFIG = {
  critical: {
    dot: "bg-[var(--ds-color-danger)]",
    label: "Crítico",
  },
  high: {
    dot: "bg-[var(--ds-color-warning)]",
    label: "Alto",
  },
  medium: {
    dot: "bg-[var(--ds-color-info)]",
    label: "Médio",
  },
} as const;

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded-lg bg-[var(--ds-color-border-subtle)]", className)}
      aria-hidden="true"
    />
  );
}

function ActivityFeedComponent() {
  const dashboardData = useDashboardData();
  const summary = dashboardData.summary.data;
  const queueLoading = dashboardData.pendingQueue.loading;
  const pendingQueue = dashboardData.pendingQueue.data;

  const recentActivities = summary?.recentActivities ?? [];
  const priorityItems = useMemo(
    () =>
      pendingQueue.items
        .filter((i) => i.priority === "critical" || i.priority === "high")
        .slice(0, 10),
    [pendingQueue.items],
  );

  return (
    <DashboardSectionBoundary fallbackTitle="Atividades Recentes">
      <section
        aria-label="Timeline operacional"
        className="overflow-hidden rounded-2xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-xs)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--ds-color-border-default)] px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--ds-color-text-secondary)]">
              Atividade de Hoje
            </p>
            <h2 className="text-[14px] font-bold text-[var(--title)]">
              Timeline operacional
            </h2>
          </div>
          <Link
            href="/dashboard/rdos"
            aria-label="Ver todos os registros de atividade"
            className="text-xs font-semibold text-[var(--ds-color-action-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-action-primary)] rounded-md px-1"
          >
            Ver tudo →
          </Link>
        </div>
        <div className="divide-y divide-[var(--ds-color-border-subtle)] min-h-[240px]">
          {queueLoading ? (
            [...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                <Skeleton className="mt-1 h-2 w-2 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))
          ) : priorityItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <CheckCircle2
                className="h-8 w-8 text-[var(--ds-color-success)]"
                aria-hidden="true"
              />
              <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                Nenhuma atividade crítica hoje
              </p>
              <p className="text-xs text-[var(--ds-color-text-secondary)]">
                Operação dentro dos parâmetros.
              </p>
            </div>
          ) : recentActivities.length > 0 ? (
            recentActivities.slice(0, 6).map((activity) => (
              <Link
                key={activity.id}
                href={activity.href}
                aria-label={`${activity.title} — ${activity.description}`}
                className="flex items-start gap-4 px-5 py-3.5 hover:bg-[var(--ds-color-surface-muted)] focus-visible:bg-[var(--ds-color-surface-muted)] focus-visible:outline-none"
              >
                <div className="flex w-12 shrink-0 flex-col items-end">
                  <span className="text-[12px] font-semibold tabular-nums text-[var(--ds-color-text-secondary)]">
                    {format(new Date(activity.date), "HH:mm")}
                  </span>
                </div>
                <div className="relative flex flex-col items-center self-stretch" aria-hidden="true">
                  <span
                    className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: activity.color }}
                  />
                  <span className="mt-1 w-px flex-1 bg-[var(--ds-color-border-subtle)]" />
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <p className="line-clamp-1 text-[13px] font-semibold text-[var(--ds-color-text-primary)]">
                    {activity.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[var(--ds-color-text-secondary)]">
                    {activity.description}
                  </p>
                </div>
              </Link>
            ))
          ) : (
            priorityItems.slice(0, 6).map((item) => {
              const pCfg = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG.medium;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-label={`${pCfg.label}: ${item.title}`}
                  className="flex items-start gap-4 px-5 py-3.5 hover:bg-[var(--ds-color-surface-muted)] focus-visible:bg-[var(--ds-color-surface-muted)] focus-visible:outline-none"
                >
                  <div className="flex w-12 shrink-0 flex-col items-end">
                    <span className="text-[12px] font-semibold tabular-nums text-[var(--ds-color-text-secondary)]">
                      {item.dueDate ? format(new Date(item.dueDate), "HH:mm") : "--:--"}
                    </span>
                  </div>
                  <div className="relative flex flex-col items-center self-stretch" aria-hidden="true">
                    <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", pCfg.dot)} />
                    <span className="mt-1 w-px flex-1 bg-[var(--ds-color-border-subtle)]" />
                  </div>
                  <div className="min-w-0 flex-1 pb-1">
                    <p className="line-clamp-1 text-[13px] font-semibold text-[var(--ds-color-text-primary)]">
                      {item.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-[var(--ds-color-text-secondary)]">
                      {item.description}
                    </p>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </section>
    </DashboardSectionBoundary>
  );
}

export const ActivityFeed = memo(ActivityFeedComponent);
