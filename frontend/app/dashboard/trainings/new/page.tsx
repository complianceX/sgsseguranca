'use client';

import dynamic from 'next/dynamic';

const TrainingForm = dynamic(
  () => import('@/components/TrainingForm').then((module) => module.TrainingForm),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando treinamento...
      </div>
    ),
  },
);

export default function NewTrainingPage() {
  return <TrainingForm />;
}
