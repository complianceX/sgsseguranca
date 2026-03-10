'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { checklistsService, Checklist } from '@/services/checklistsService';
import { signaturesService } from '@/services/signaturesService';
import { generateChecklistPdf } from '@/lib/pdf/checklistGenerator';
import { Plus, Pencil, Trash2, Search, PlayCircle, Copy, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { SendMailModal } from '@/components/SendMailModal';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PaginationControls } from '@/components/PaginationControls';
import { cn } from '@/lib/utils';

export default function ChecklistModelsPage() {
  const [models, setModels] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [modelFilter, setModelFilter] = useState<'all' | 'model' | 'regular'>('model');
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; filename: string; base64: string } | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  useEffect(() => {
    loadModels(modelFilter);
  }, [modelFilter, page]);

  async function loadModels(filter: 'all' | 'model' | 'regular') {
    try {
      setLoading(true);
      const options =
        filter === 'model'
          ? { onlyTemplates: true }
          : filter === 'regular'
            ? { excludeTemplates: true }
            : undefined;
      const response = await checklistsService.findPaginated({
        ...options,
        page,
        limit: 10,
      });
      setModels(response.data);
      setTotal(response.total);
      setLastPage(response.lastPage);
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
        if (models.length === 1 && page > 1) {
          setPage((current) => current - 1);
        } else {
          await loadModels(modelFilter);
        }
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
      setPage(1);
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
          <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">Checklists</h1>
          <p className="text-[var(--ds-color-text-muted)]">Gerencie seus modelos e checklists.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={handleBootstrapTemplates}
            disabled={bootstrapping}
            variant="secondary"
            leftIcon={<Plus className="h-4 w-4" />}
            title="Criar templates por atividade"
          >
            <span>{bootstrapping ? 'Criando...' : 'Templates por atividade'}</span>
          </Button>
          <Link
            href="/dashboard/checklist-models/new"
            className={cn(buttonVariants({ variant: 'primary' }), 'gap-2')}
            title="Novo Checklist"
          >
            <Plus className="h-4 w-4" />
            <span>Novo Checklist</span>
          </Link>
        </div>
      </div>

      <Card tone="elevated" padding="lg">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
            <Input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por título, equipamento ou máquina..."
              aria-label="Buscar modelos de checklist por título, equipamento ou máquina"
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--ds-color-text-muted)]">Filtro</span>
            <select
              aria-label="Filtro de modelos"
              className="h-11 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] shadow-[var(--ds-shadow-sm)] outline-none transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:shadow-[0_0_0_4px_var(--ds-color-focus-ring)]"
              value={modelFilter}
              onChange={(e) => {
                setModelFilter(e.target.value as 'all' | 'model' | 'regular');
                setPage(1);
              }}
            >
              <option value="model">Modelos</option>
              <option value="regular">Registros</option>
              <option value="all">Todos</option>
            </select>
          </div>
        </div>

        <table className="w-full table-fixed">
          <thead>
            <tr className="border-b border-[var(--ds-color-border-subtle)]">
              <th className="w-1/3 px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ds-color-text-muted)]">Título</th>
              <th className="w-1/3 px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ds-color-text-muted)]">Equipamento / Máquina</th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ds-color-text-muted)]">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ds-color-border-subtle)]">
            {loading ? (
              <tr>
                <td colSpan={3} className="py-10 text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-[var(--ds-color-action-primary)] border-t-transparent"></div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-6 text-center text-[var(--ds-color-text-muted)]">
                  Nenhum modelo encontrado.
                </td>
              </tr>
            ) : (
              filtered.map((m) => (
                <tr key={m.id} className="transition-colors hover:bg-[var(--ds-color-primary-subtle)]/18">
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-[var(--ds-color-text-primary)]">{m.titulo}</div>
                      {m.is_modelo && (
                        <Badge variant="accent">Modelo</Badge>
                      )}
                    </div>
                    <div className="text-xs text-[var(--ds-color-text-muted)]">{m.descricao}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-[var(--ds-color-text-secondary)]">
                      {m.equipamento || '-'}
                      {m.maquina ? ` / ${m.maquina}` : ''}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/dashboard/checklist-models/new?templateId=${m.id}`}
                        className="text-[var(--ds-color-success)] transition-colors hover:text-[var(--ds-color-success-hover)]"
                        title="Preencher Checklist"
                      >
                        <PlayCircle className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/dashboard/checklist-models/edit/${m.id}`}
                        className="text-[var(--ds-color-accent)] transition-colors hover:brightness-110"
                        title="Editar modelo"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(m)}
                        className="text-[var(--ds-color-action-primary)] transition-colors hover:text-[var(--ds-color-action-primary-hover)]"
                        title="Duplicar modelo"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendEmail(m)}
                        disabled={printingId === m.id}
                        className="text-[var(--ds-color-text-secondary)] transition-colors hover:text-[var(--ds-color-text-primary)] disabled:opacity-50"
                        title="Enviar por E-mail"
                      >
                        <Mail className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(m.id)}
                        className="text-[var(--ds-color-danger)] transition-colors hover:text-[var(--ds-color-danger-hover)]"
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
        {!loading && total > 0 ? (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(lastPage, current + 1))}
          />
        ) : null}
      </Card>

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
