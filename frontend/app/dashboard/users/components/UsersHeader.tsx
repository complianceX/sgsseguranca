import { Plus } from 'lucide-react';
import Link from 'next/link';

export function UsersHeader() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
        <p className="text-gray-500">Gerencie os usuários cadastrados no sistema.</p>
      </div>
      <Link
        href="/dashboard/users/new"
        className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
      >
        <Plus className="mr-2 h-4 w-4" />
        Novo Usuário
      </Link>
    </div>
  );
}
