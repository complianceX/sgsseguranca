'use client';

import { useParams } from 'next/navigation';
import { NonConformityForm } from '@/components/NonConformityForm';

export default function EditNonConformityPage() {
  const params = useParams();
  const id = params?.id as string;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Editar Não Conformidade</h1>
        <p className="text-sm text-gray-500">Atualize as informações da não conformidade.</p>
      </div>
      <NonConformityForm id={id} />
    </div>
  );
}
