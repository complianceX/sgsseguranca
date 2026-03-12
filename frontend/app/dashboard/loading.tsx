export default function DashboardLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-[color:var(--color-background)]">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--color-primary)] border-t-transparent" />
    </div>
  );
}

