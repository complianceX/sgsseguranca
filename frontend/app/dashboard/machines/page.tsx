'use client';

import { useState, useEffect } from 'react';
import { machinesService, Machine } from '@/services/machinesService';
import { Plus, Pencil, Trash2, Search, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function MachinesPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadMachines();
  }, []);

  async function loadMachines() {
    try {
      setLoading(true);
      const data = await machinesService.findAll();
      setMachines(data);
    } catch (error) {
      console.error('Erro ao carregar máquinas:', error);
      toast.error('Erro ao carregar lista de máquinas.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Tem certeza que deseja excluir esta máquina?')) {
      try {
        await machinesService.delete(id);
        setMachines(machines.filter(m => m.id !== id));
        toast.success('Máquina excluída com sucesso!');
      } catch (error) {
        console.error('Erro ao excluir máquina:', error);
        toast.error('Erro ao excluir máquina. Verifique se existem dependências e tente novamente.');
      }
    }
  }

  const filteredMachines = machines.filter(machine =>
    machine.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    machine.placa?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Máquinas</h1>
            <p className="text-gray-500">Gerencie as máquinas cadastradas no sistema.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {filteredMachines.length} resultado(s)
            </span>
            <Link
              href="/dashboard/machines/new"
              className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Nova Máquina
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b bg-slate-50/70 p-4">
          <div className="relative max-w-sm">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-gray-400" />
            </span>
            <input
              type="text"
              placeholder="Buscar máquinas..."
              className="w-full rounded-md border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Placa</TableHead>
              <TableHead>Horímetro Atual</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center">
                  <div className="flex justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredMachines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-gray-500">
                  Nenhuma máquina encontrada.
                </TableCell>
              </TableRow>
            ) : (
              filteredMachines.map((machine) => (
                <TableRow key={machine.id}>
                  <TableCell className="font-medium text-gray-900">{machine.nome}</TableCell>
                  <TableCell>{machine.placa || '-'}</TableCell>
                  <TableCell>{machine.horimetro_atual || '0'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-2">
                      <Link
                        href={`/dashboard/checklist-models/new?maquina=${encodeURIComponent(machine.nome)}&company_id=${machine.company_id}`}
                        className="rounded p-1 text-indigo-600 hover:bg-indigo-50"
                        title="Montar Checklist"
                      >
                        <ClipboardList className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/dashboard/machines/edit/${machine.id}`}
                        className="rounded p-1 text-blue-600 hover:bg-blue-50"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(machine.id)}
                        className="rounded p-1 text-red-600 hover:bg-red-50"
                        title="Excluir Máquina"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
