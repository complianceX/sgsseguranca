'use client';

import dynamic from 'next/dynamic';

const ArrForm = dynamic(
  () => import('@/components/ArrForm').then((module) => module.ArrForm),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando ARR...
      </div>
    ),
  },
);

export default function NewArrPage() {
  return (
    <div className="py-4 md:py-6">
      <ArrForm />
    </div>
  );
}
