'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

const ChecklistForm = dynamic(
  () =>
    import('../../components/ChecklistForm').then(
      (module) => module.ChecklistForm,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando checklist...
      </div>
    ),
  },
);

export default function EditChecklistPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="py-6">
      <ChecklistForm id={id} />
    </div>
  );
}
