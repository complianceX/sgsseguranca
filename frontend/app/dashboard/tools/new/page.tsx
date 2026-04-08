'use client';

import dynamic from 'next/dynamic';

const ToolForm = dynamic(
  () => import('@/components/ToolForm').then((module) => module.ToolForm),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando ferramenta...
      </div>
    ),
  },
);

export default function NewToolPage() {
  return <ToolForm />;
}
