'use client';

import { InspectionForm } from '@/components/InspectionForm';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function EditInspectionPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link
          href="/dashboard/inspections"
          className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Editar Relatório de Inspeção</h1>
          <p className="text-sm text-gray-500">Atualize as informações do relatório de inspeção de SST.</p>
        </div>
      </div>

      <InspectionForm id={id} />
    </div>
  );
}
