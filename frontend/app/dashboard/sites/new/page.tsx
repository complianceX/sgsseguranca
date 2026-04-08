'use client';

import dynamic from 'next/dynamic';

const SiteForm = dynamic(
  () => import('@/components/SiteForm').then((module) => module.SiteForm),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando obra...
      </div>
    ),
  },
);

export default function NewSitePage() {
  return <SiteForm />;
}
