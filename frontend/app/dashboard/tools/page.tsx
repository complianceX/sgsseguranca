'use client';

import { useState, useEffect } from 'react';
import { toolsService, Tool } from '@/services/toolsService';
import { Plus, Pencil, Trash2, Search, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadTools();
  }, []);

  async function loadTools() {
    try {
      setLoading(true);
      const data = await toolsService.findAll();
      setTools(data);
    } catch (error) {
      console.error('Erro ao carregar ferramentas:', error);
      toast.error('Erro ao carregar lista de ferramentas.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Tem certeza que deseja excluir esta ferramenta?')) {
      try {
        await toolsService.delete(id);
        setTools(tools.filter(t => t.id !== id));
        toast.success('Ferramenta excluída com sucesso!');
      } catch (error) {
        console.error('Erro ao excluir ferramenta:', error);
        toast.error('Erro ao excluir ferramenta. Verifique se existem dependências e tente novamente.');
      }
    }
  }

  const filteredTools = tools.filter(tool =>
    tool.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tool.numero_serie?.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Ferramentas</h1>
            <p className="text-gray-500">Gerencie as ferramentas cadastradas no sistema.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {filteredTools.length} resultado(s)
            </span>
            <Link
              href="/dashboard/tools/new"
              className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Nova Ferramenta
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
              placeholder="Buscar ferramentas..."
              className="w-full rounded-md border border-gray-400 bg-gray-50 py-2 pl-10 pr-4 text-sm font-semibold text-gray-900 placeholder:text-gray-600 focus:border-blue-600 focus:bg-white focus:outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Número de Série</TableHead>
              <TableHead>Data de Criação</TableHead>
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
            ) : filteredTools.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-gray-500">
                  Nenhuma ferramenta encontrada.
                </TableCell>
              </TableRow>
            ) : (
              filteredTools.map((tool) => (
                <TableRow key={tool.id}>
                  <TableCell className="font-medium text-gray-900">{tool.nome}</TableCell>
                  <TableCell>{tool.numero_serie || '-'}</TableCell>
                  <TableCell>{new Date(tool.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-2">
                      <Link
                        href={`/dashboard/checklist-models/new?equipamento=${encodeURIComponent(tool.nome)}&company_id=${tool.company_id}`}
                        className="rounded p-1 text-indigo-600 hover:bg-indigo-50"
                        title="Montar Checklist"
                      >
                        <ClipboardList className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/dashboard/tools/edit/${tool.id}`}
                        className="rounded p-1 text-blue-600 hover:bg-blue-50"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(tool.id)}
                        className="rounded p-1 text-red-600 hover:bg-red-50"
                        title="Excluir Ferramenta"
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
