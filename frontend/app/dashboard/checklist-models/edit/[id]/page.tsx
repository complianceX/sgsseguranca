'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

const ChecklistForm = dynamic(
  () =>
    import('../../../checklists/components/ChecklistForm').then(
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

export default function EditChecklistModelPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="px-4 py-6 md:px-6">
      <ChecklistForm id={id} mode="template" />
    </div>
  );
}
