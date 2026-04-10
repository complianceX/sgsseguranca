'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { PageLoadingState } from '@/components/ui/state';

const UserForm = dynamic(
  () =>
    import('../../users/components/UserForm').then((module) => module.UserForm),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto max-w-2xl">
        <PageLoadingState
          title="Carregando funcionário"
          description="Aguarde enquanto preparamos os dados de identificação, vínculo e lotação."
          cards={2}
          tableRows={3}
        />
      </div>
    ),
  },
);

export default function EditEmployeePage() {
  const params = useParams();
  const id = params.id as string;

  return <UserForm id={id} />;
}
