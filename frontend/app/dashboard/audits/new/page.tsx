'use client';

import { AuditForm } from '@/components/AuditForm';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function NewAuditPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link
          href="/dashboard/audits"
          className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Novo Relatório de Auditoria HSE</h1>
          <p className="text-sm text-gray-500">Preencha os dados abaixo para criar um novo relatório de conformidade.</p>
        </div>
      </div>

      <AuditForm />
    </div>
  );
}
