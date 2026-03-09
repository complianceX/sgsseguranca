'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { checklistsService, Checklist } from '@/services/checklistsService';
import { signaturesService } from '@/services/signaturesService';
import { generateChecklistPdf } from '@/lib/pdf/checklistGenerator';
import { Plus, Pencil, Trash2, Search, PlayCircle, Copy, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { SendMailModal } from '@/components/SendMailModal';

export default function ChecklistModelsPage() {
  const [models, setModels] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [modelFilter, setModelFilter] = useState<'all' | 'model' | 'regular'>('model');
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; filename: string; base64: string } | null>(null);

  useEffect(() => {
    loadModels(modelFilter);
  }, [modelFilter]);

  async function loadModels(filter: 'all' | 'model' | 'regular') {
    try {
      setLoading(true);
      const options =
        filter === 'model'
          ? { onlyTemplates: true }
          : filter === 'regular'
            ? { excludeTemplates: true }
            : undefined;
      const data = await checklistsService.findAll(options);
      setModels(data);
    } catch (error) {
      console.error('Erro ao carregar modelos:', error);
      toast.error('Não foi possível carregar os modelos de checklist.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (confirm('Excluir este modelo?')) {
      try {
        await checklistsService.delete(id);
        setModels(models.filter(m => m.id !== id));
        toast.success('Modelo excluído com sucesso!');
      } catch (error) {
        console.error('Erro ao excluir modelo:', error);
        toast.error('Erro ao excluir modelo.');
      }
    }
  }

  async function handleDuplicate(model: Checklist) {
    if (confirm(`Duplicar o modelo "${model.titulo}"?`)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, created_at, updated_at, ...data } = model;
        await checklistsService.create({
          ...data,
          titulo: `${data.titulo} (Cópia)`,
          is_modelo: true,
        });
        toast.success('Modelo duplicado com sucesso!');
        loadModels(modelFilter);
      } catch (error) {
        console.error('Erro ao duplicar modelo:', error);
        toast.error('Erro ao duplicar modelo.');
      }
    }
  }

  async function handleBootstrapTemplates() {
    try {
      setBootstrapping(true);
      const result = await checklistsService.bootstrapActivityTemplates();
      toast.success(
        `Templates operacionais processados. Criados: ${result.created}. Ignorados: ${result.skipped}.`,
      );
      await loadModels(modelFilter);
    } catch (error) {
      console.error('Erro ao criar templates operacionais:', error);
      toast.error('Não foi possível criar os templates por atividade.');
    } finally {
      setBootstrapping(false);
    }
  }

  const handleSendEmail = async (checklist: Checklist) => {
    try {
      setPrintingId(checklist.id);
      const signatures = await signaturesService.findByChecklist(checklist.id);
      const pdfData = await generateChecklistPdf(checklist, signatures, { save: false, output: 'base64' });
      if (pdfData && pdfData.base64) {
        setSelectedDoc({
          name: checklist.titulo,
          filename: pdfData.filename,
          base64: pdfData.base64,
        });
        setIsMailModalOpen(true);
      }
    } catch (error) {
      console.error('Erro ao enviar e-mail:', error);
      toast.error('Erro ao enviar e-mail.');
    } finally {
      setPrintingId(null);
    }
  };

  const filtered = models.filter(m =>
    (m.titulo + (m.descricao || '') + (m.equipamento || '') + (m.maquina || ''))
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Checklists</h1>
          <p className="text-gray-500">Gerencie seus modelos e checklists.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBootstrapTemplates}
            disabled={bootstrapping}
            className="inline-flex items-center space-x-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
            title="Criar templates por atividade"
          >
            <Plus className="h-4 w-4" />
            <span>{bootstrapping ? 'Criando...' : 'Templates por atividade'}</span>
          </button>
          <Link
            href="/dashboard/checklist-models/new"
            className="inline-flex items-center space-x-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            title="Novo Checklist"
          >
            <Plus className="h-4 w-4" />
            <span>Novo Checklist</span>
          </Link>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por título, equipamento ou máquina..."
              aria-label="Buscar modelos de checklist por título, equipamento ou máquina"
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Filtro</span>
            <select
              aria-label="Filtro de modelos"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value as 'all' | 'model' | 'regular')}
            >
              <option value="model">Modelos</option>
              <option value="regular">Registros</option>
              <option value="all">Todos</option>
            </select>
          </div>
        </div>

        <table className="w-full table-fixed">
          <thead>
            <tr className="border-b">
              <th className="w-1/3 px-6 py-3 text-left font-medium">Título</th>
              <th className="w-1/3 px-6 py-3 text-left font-medium">Equipamento / Máquina</th>
              <th className="px-6 py-3 text-left font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={3} className="py-10 text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-6 text-center text-gray-500">
                  Nenhum modelo encontrado.
                </td>
              </tr>
            ) : (
              filtered.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-gray-900">{m.titulo}</div>
                      {m.is_modelo && (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                          Modelo
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">{m.descricao}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-700">
                      {m.equipamento || '-'}
                      {m.maquina ? ` / ${m.maquina}` : ''}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/dashboard/checklist-models/new?templateId=${m.id}`}
                        className="text-green-600 hover:text-green-800"
                        title="Preencher Checklist"
                      >
                        <PlayCircle className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/dashboard/checklist-models/edit/${m.id}`}
                        className="text-indigo-600 hover:text-indigo-800"
                        title="Editar modelo"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(m)}
                        className="text-blue-600 hover:text-blue-800"
                        title="Duplicar modelo"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendEmail(m)}
                        disabled={printingId === m.id}
                        className="text-gray-600 hover:text-gray-800 disabled:opacity-50"
                        title="Enviar por E-mail"
                      >
                        <Mail className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(m.id)}
                        className="text-red-600 hover:text-red-800"
                        title="Excluir modelo"
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

      {selectedDoc && (
        <SendMailModal
          isOpen={isMailModalOpen}
          onClose={() => {
            setIsMailModalOpen(false);
            setSelectedDoc(null);
          }}
          documentName={selectedDoc.name}
          filename={selectedDoc.filename}
          base64={selectedDoc.base64}
        />
      )}
    </div>
  );
}
