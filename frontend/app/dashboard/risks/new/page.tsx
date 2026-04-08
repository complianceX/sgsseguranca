'use client';

import dynamic from 'next/dynamic';

const RiskForm = dynamic(
  () => import('../components/RiskForm').then((module) => module.RiskForm),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando risco...
      </div>
    ),
  },
);

export default function NewRiskPage() {
  return <RiskForm />;
}
