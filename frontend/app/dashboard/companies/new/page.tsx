'use client';

import dynamic from 'next/dynamic';

const CompanyForm = dynamic(
  () => import('@/components/CompanyForm').then((module) => module.CompanyForm),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando empresa...
      </div>
    ),
  },
);

export default function NewCompanyPage() {
  return <CompanyForm />;
}
