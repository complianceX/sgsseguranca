import { cn } from "@/lib/utils";

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "motion-safe:animate-pulse rounded bg-[var(--ds-color-surface-muted)]",
        className,
      )}
      aria-hidden="true"
    />
  );
}

function SkeletonCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-xs)]">
      {children}
    </section>
  );
}

export default function DashboardLoading() {
  return (
    <div
      aria-label="Carregando dashboard..."
      className="mx-auto max-w-[1440px] space-y-5"
      role="status"
    >
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <SkeletonBlock className="h-8 w-[200px]" />
          <SkeletonBlock className="h-5 w-[150px]" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SkeletonBlock className="h-8 w-28 rounded-lg" />
          <SkeletonBlock className="h-8 w-24 rounded-lg" />
        </div>
      </header>

      <section aria-label="Indicadores em carregamento">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...Array(4)].map((_, index) => (
            <div
              key={index}
              className="relative flex min-h-[152px] flex-col gap-3 overflow-hidden rounded-2xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-5 shadow-[var(--ds-shadow-xs)]"
            >
              <SkeletonBlock className="h-[3px] w-full rounded-none" />
              <div className="flex items-center justify-between">
                <SkeletonBlock className="h-3 w-28" />
                <SkeletonBlock className="h-9 w-9 rounded-xl" />
              </div>
              <SkeletonBlock className="h-8 w-20" />
              <SkeletonBlock className="h-3 w-32" />
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <SkeletonCard>
          <div className="border-b border-[var(--ds-color-border-default)] bg-gradient-to-r from-[var(--ds-color-surface-muted)] to-[var(--ds-color-surface-base)] px-5 py-4">
            <SkeletonBlock className="h-3 w-36" />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 px-5 py-6">
            <SkeletonBlock className="h-[156px] w-[156px] rounded-full" />
            <SkeletonBlock className="h-[156px] w-[156px] rounded-full" />
          </div>
        </SkeletonCard>

        <SkeletonCard>
          <div className="border-b border-[var(--ds-color-border-default)] bg-gradient-to-r from-[var(--ds-color-surface-muted)] to-[var(--ds-color-surface-base)] px-5 py-4">
            <SkeletonBlock className="h-3 w-44" />
          </div>
          <div className="space-y-3.5 px-5 py-4">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <SkeletonBlock className="h-3 w-40" />
                  <SkeletonBlock className="h-3 w-12" />
                </div>
                <SkeletonBlock className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        </SkeletonCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SkeletonCard>
          <div className="flex items-center justify-between border-b border-[var(--ds-color-border-default)] px-5 py-4">
            <div className="space-y-2">
              <SkeletonBlock className="h-3 w-28" />
              <SkeletonBlock className="h-4 w-44" />
            </div>
            <SkeletonBlock className="h-3 w-16" />
          </div>
          <div className="divide-y divide-[var(--ds-color-border-subtle)]">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="flex items-start gap-4 px-5 py-3.5">
                <SkeletonBlock className="h-4 w-10" />
                <SkeletonBlock className="mt-1.5 h-2 w-2 rounded-full" />
                <div className="flex-1 space-y-2">
                  <SkeletonBlock className="h-3.5 w-3/4" />
                  <SkeletonBlock className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </SkeletonCard>

        <SkeletonCard>
          <div className="border-b border-[var(--ds-color-border-default)] bg-gradient-to-r from-[var(--ds-color-surface-muted)] to-[var(--ds-color-surface-base)] px-5 py-4">
            <SkeletonBlock className="h-4 w-44" />
          </div>
          <div className="space-y-px p-1">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="flex items-start gap-3 px-5 py-4">
                <SkeletonBlock className="mt-1 h-10 w-1 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="flex gap-1.5">
                    <SkeletonBlock className="h-4 w-14 rounded" />
                    <SkeletonBlock className="h-4 w-20 rounded" />
                  </div>
                  <SkeletonBlock className="h-4 w-4/5 rounded" />
                  <SkeletonBlock className="h-3 w-2/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        </SkeletonCard>
      </div>
    </div>
  );
}
