'use client';

import dynamic from 'next/dynamic';

const ActivityForm = dynamic(
  () => import('@/components/ActivityForm').then((module) => module.ActivityForm),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando atividade...
      </div>
    ),
  },
);

export default function NewActivityPage() {
  return <ActivityForm />;
}
