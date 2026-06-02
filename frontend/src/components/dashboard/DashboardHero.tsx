"use client";

import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { DailyReportPdfSource } from "@/lib/pdf/dailyReportGenerator";
import { cn } from "@/lib/utils";
import { DailyReportButton } from "./DailyReportButton";
import { LastUpdatedLabel } from "./LastUpdatedLabel";

type DashboardHeroTone = "success" | "warning" | "danger" | "neutral";

const HERO_STATUS_STYLES: Record<
  DashboardHeroTone,
  {
    container: string;
    icon: string;
    Icon: typeof CheckCircle2;
    label: string;
  }
> = {
  success: {
    container:
      "border-[var(--ds-color-success-border)] bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success-fg)]",
    icon: "text-[var(--ds-color-success)]",
    Icon: CheckCircle2,
    label: "Operação estável",
  },
  warning: {
    container:
      "border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] text-[var(--ds-color-warning-fg)]",
    icon: "text-[var(--ds-color-warning)]",
    Icon: AlertTriangle,
    label: "Atenção operacional",
  },
  danger: {
    container:
      "border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger-fg)]",
    icon: "text-[var(--ds-color-danger)]",
    Icon: AlertTriangle,
    label: "Ação imediata",
  },
  neutral: {
    container:
      "border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]",
    icon: "text-[var(--ds-color-text-secondary)]",
    Icon: Loader2,
    label: "Atualizando operação",
  },
};

export interface DashboardHeroProps {
  greeting: string;
  firstName: string;
  dateLabel: string;
  statusTone: DashboardHeroTone;
  statusTitle: string;
  statusDescription: string;
  loadError?: string | null;
  actionsDisabled?: boolean;
  buildDailyReportPayload: () => DailyReportPdfSource;
  lastUpdatedAt: Date | null;
}

export function DashboardHero({
  greeting,
  firstName,
  dateLabel,
  statusTone,
  statusTitle,
  statusDescription,
  loadError,
  actionsDisabled,
  buildDailyReportPayload,
  lastUpdatedAt,
}: DashboardHeroProps) {
  const statusConfig = HERO_STATUS_STYLES[statusTone];
  const StatusIcon = statusConfig.Icon;

  return (
    <section
      aria-label="Resumo operacional do dashboard"
      className="rounded-2xl border border-[var(--ds-color-border-default)] bg-[var(--component-card-bg)] px-5 py-5 shadow-[var(--ds-shadow-xs)] sm:px-6"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--ds-color-text-secondary)]">
              Painel operacional
            </p>
            <h1 className="mt-1 text-[24px] font-black leading-tight tracking-[-0.03em] text-[var(--title)] sm:text-[30px]">
              {greeting}, {firstName}
            </h1>
            <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">{dateLabel}</p>
          </div>

          <div
            className={cn(
              "rounded-2xl border px-4 py-3",
              statusConfig.container,
            )}
            aria-live="polite"
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-current/20 bg-[var(--component-card-bg-elevated)]",
                  statusConfig.icon,
                )}
                aria-hidden="true"
              >
                <StatusIcon
                  className={cn("h-4 w-4", statusTone === "neutral" && "animate-none")}
                />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.16em] opacity-90">
                  {statusConfig.label}
                </p>
                <p className="mt-1 text-sm font-semibold">{statusTitle}</p>
                <p className="mt-1 text-sm opacity-90">{statusDescription}</p>
              </div>
            </div>
          </div>

          {loadError ? (
            <p
              role="alert"
              className="rounded-xl border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] px-4 py-3 text-sm text-[var(--ds-color-warning-fg)]"
            >
              {loadError}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <DailyReportButton
              disabled={actionsDisabled}
              buildPayload={buildDailyReportPayload}
            />
            <LastUpdatedLabel lastFetchedAt={lastUpdatedAt} />
          </div>
        </div>
      </div>
    </section>
  );
}
