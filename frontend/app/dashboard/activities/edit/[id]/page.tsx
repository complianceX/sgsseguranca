'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

const ActivityForm = dynamic(
  () => import('@/components/ActivityForm').then((module) => module.ActivityForm),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando atividade...
      </div>
    ),
  },
);

export default function EditActivityPage() {
  const params = useParams();
  const id = params.id as string;

  return <ActivityForm id={id} />;
}
