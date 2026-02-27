'use client';

import { NonConformityForm } from '@/components/NonConformityForm';

export default function NewNonConformityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nova Não Conformidade</h1>
        <p className="text-sm text-gray-500">Preencha o formulário para registrar uma não conformidade.</p>
      </div>
      <NonConformityForm />
    </div>
  );
}
