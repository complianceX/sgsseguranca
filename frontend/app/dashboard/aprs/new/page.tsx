'use client';

import dynamic from 'next/dynamic';

const AprForm = dynamic(
  () => import('../components/AprForm').then((module) => module.AprForm),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando formulário de APR...
      </div>
    ),
  },
);

export default function NewAprPage() {
  return <AprForm />;
}
