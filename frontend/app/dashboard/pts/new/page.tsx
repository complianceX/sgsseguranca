'use client';

import dynamic from 'next/dynamic';

const PtForm = dynamic(
  () => import('../components/PtForm').then((module) => module.PtForm),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando formulário de PT...
      </div>
    ),
  },
);

export default function NewPtPage() {
  return (
    <div className="py-6">
      <PtForm />
    </div>
  );
}
