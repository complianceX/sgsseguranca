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
    <div className="bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.08),transparent_42%)] py-4 md:py-6">
      <DidForm />
    </div>
  );
}
