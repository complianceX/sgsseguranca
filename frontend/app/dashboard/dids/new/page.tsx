'use client';

import dynamic from 'next/dynamic';

const DidForm = dynamic(
  () => import('@/components/DidForm').then((module) => module.DidForm),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando DID...
      </div>
    ),
  },
);

export default function NewDidPage() {
  return (
    <div className="py-6">
      <DidForm />
    </div>
  );
}
