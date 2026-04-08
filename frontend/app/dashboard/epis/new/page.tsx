'use client';

import dynamic from 'next/dynamic';

const EpiForm = dynamic(
  () => import('@/components/EpiForm').then((module) => module.EpiForm),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando EPI...
      </div>
    ),
  },
);

export default function NewEpiPage() {
  return <EpiForm />;
}
