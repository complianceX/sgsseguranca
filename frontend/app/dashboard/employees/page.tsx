'use client';

import { useState, useEffect } from 'react';
import { usersService, User } from '@/services/usersService';
import { Plus, Pencil, Trash2, Search, Building2, Map as MapIcon } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadEmployees();
  }, []);

  async function loadEmployees() {
    try {
      setLoading(true);
      const data = await usersService.findAll();
      // Filtra apenas perfis de colaboradores ou usuários que tenham uma obra vinculada
      // mas para ser mais abrangente e atender o pedido do usuário, mostraremos todos
      // que não são Administradores Gerais se o usuário quiser ver todos os "trabalhadores"
      // No entanto, o pedido foi "cadastrar funcionarios por empresa e obra"
      setEmployees(data);
    } catch (error) {
      console.error('Erro ao carregar funcionários:', error);
      toast.error('Erro ao carregar lista de funcionários.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Tem certeza que deseja excluir este funcionário?')) {
      try {
        await usersService.delete(id);
        setEmployees(employees.filter(e => e.id !== id));
        toast.success('Funcionário excluído com sucesso!');
      } catch (error) {
        console.error('Erro ao excluir funcionário:', error);
        toast.error('Erro ao excluir funcionário. Verifique se existem dependências.');
      }
    }
  }

  const filteredEmployees = employees.filter(emp =>
    (emp.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.cpf.includes(searchTerm)) &&
    emp.profile?.nome !== 'Administrador Geral' // Não mostra admin geral na lista de funcionários
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Funcionários</h1>
          <p className="text-gray-500">Gerencie os funcionários por empresa e obra/setor.</p>
        </div>
        <Link
          href="/dashboard/employees/new"
          className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo Funcionário
        </Link>
      </div>

      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b p-4">
          <div className="relative max-w-sm">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-gray-400" />
            </span>
            <input
              type="text"
              placeholder="Pesquisar por nome ou CPF..."
              className="w-full rounded-md border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-700">
              <tr>
                <th className="px-6 py-3 font-semibold">Nome</th>
                <th className="px-6 py-3 font-semibold">CPF</th>
                <th className="px-6 py-3 font-semibold">Função</th>
                <th className="px-6 py-3 font-semibold">Empresa</th>
                <th className="px-6 py-3 font-semibold">Obra/Setor</th>
                <th className="px-6 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center">
                    <div className="flex justify-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                    </div>
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                    Nenhum funcionário encontrado.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{emp.nome}</td>
                    <td className="px-6 py-4 text-gray-600">{emp.cpf}</td>
                    <td className="px-6 py-4 text-gray-600">{emp.funcao || '-'}</td>
                    <td className="px-6 py-4 text-gray-600">
                      <div className="flex items-center">
                        <Building2 className="mr-1 h-3 w-3 text-gray-400" />
                        {emp.company?.razao_social || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      <div className="flex items-center">
                        <MapIcon className="mr-1 h-3 w-3 text-gray-400" />
                        {emp.site?.nome || <span className="text-gray-400 italic">Não vinculada</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end space-x-2">
                        <Link
                          href={`/dashboard/employees/${emp.id}`}
                          className="rounded p-1 text-blue-600 hover:bg-blue-50"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(emp.id)}
                          className="rounded p-1 text-red-600 hover:bg-red-50"
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
