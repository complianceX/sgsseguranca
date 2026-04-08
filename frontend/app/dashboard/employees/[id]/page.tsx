'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

const UserForm = dynamic(
  () =>
    import('../../users/components/UserForm').then((module) => module.UserForm),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 text-sm text-[var(--ds-color-text-secondary)] shadow-[var(--component-card-shadow)]">
        Carregando funcionário...
      </div>
    ),
  },
);

export default function EditEmployeePage() {
  const params = useParams();
  const id = params.id as string;

  return <UserForm id={id} />;
}
