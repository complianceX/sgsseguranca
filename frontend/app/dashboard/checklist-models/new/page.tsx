'use client';

import dynamic from 'next/dynamic';

const ChecklistForm = dynamic(
  () =>
    import('../../checklists/components/ChecklistForm').then(
      (module) => module.ChecklistForm,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando modelo de checklist...
      </div>
    ),
  },
);

export default function NewChecklistModelPage() {
  return (
    <div className="py-6">
      <ChecklistForm mode="template" />
    </div>
  );
}
