'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { InlineLoadingState } from '@/components/ui/state';

const UserForm = dynamic(
  () =>
    import('../../users/components/UserForm').then((module) => module.UserForm),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto max-w-2xl p-6">
        <InlineLoadingState label="Carregando funcionário..." />
      </div>
    ),
  },
);

export default function EditEmployeePage() {
  const params = useParams();
  const id = params.id as string;

  return <UserForm id={id} />;
}
