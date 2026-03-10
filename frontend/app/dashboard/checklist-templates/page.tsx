'use client';

import { useState, useEffect } from 'react';
import { checklistsService, Checklist } from '@/services/checklistsService';
import { Plus, FileText, Edit, Trash2, ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ChecklistTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await checklistsService.getTemplates();
      setTemplates(data);
    } catch (error) {
      console.error('Erro ao carregar templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este template?')) return;
    
    try {
      await checklistsService.delete(id);
      await loadTemplates();
    } catch (error) {
      console.error('Erro ao excluir template:', error);
      alert('Erro ao excluir template');
    }
  };

  const handleFill = (templateId: string) => {
    router.push(`/dashboard/checklists/fill/${templateId}`);
  };

  const filteredTemplates = templates.filter(t =>
    t.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.descricao?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Templates de Checklists</h1>
          <p className="text-gray-500">Gerencie os modelos de checklists da sua empresa.</p>
        </div>
        <Link
          href="/dashboard/checklist-templates/new"
          className="flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 shadow-sm"
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo Template
        </Link>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b">
          <input
            type="text"
            placeholder="Buscar templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Carregando templates...</div>
        ) : filteredTemplates.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p>Nenhum template encontrado.</p>
            <Link
              href="/dashboard/checklist-templates/new"
              className="mt-4 inline-flex items-center text-amber-700 hover:text-amber-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Criar primeiro template
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">{template.titulo}</h3>
                    {template.descricao && (
                      <p className="text-sm text-gray-600 line-clamp-2">{template.descricao}</p>
                    )}
                  </div>
                  <FileText className="h-5 w-5 text-amber-700 flex-shrink-0 ml-2" />
                </div>

                <div className="space-y-2 mb-4">
                  {template.categoria && (
                    <div className="text-xs text-gray-600">
                      <span className="font-medium">Categoria:</span> {template.categoria}
                    </div>
                  )}
                  {template.periodicidade && (
                    <div className="text-xs text-gray-600">
                      <span className="font-medium">Periodicidade:</span> {template.periodicidade}
                    </div>
                  )}
                  {template.itens && Array.isArray(template.itens) && (
                    <div className="text-xs text-gray-600">
                      <span className="font-medium">Itens:</span> {template.itens.length}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleFill(template.id)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <ClipboardCheck className="h-4 w-4" />
                    Preencher
                  </button>
                  <Link
                    href={`/dashboard/checklist-templates/edit/${template.id}`}
                    className="flex items-center justify-center px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Edit className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="flex items-center justify-center px-3 py-2 bg-red-100 text-red-700 text-sm rounded-lg hover:bg-red-200 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
