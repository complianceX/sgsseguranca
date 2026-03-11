'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { checklistsService, Checklist } from '@/services/checklistsService';
import { Plus, FileText, Edit, Trash2, ClipboardCheck, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export default function ChecklistTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const data = await checklistsService.getTemplates();
      setTemplates(data);
    } catch (error) {
      console.error('Erro ao carregar templates:', error);
      toast.error('Erro ao carregar templates de checklist.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este template?')) return;

    try {
      await checklistsService.delete(id);
      toast.success('Template excluído com sucesso!');
      await loadTemplates();
    } catch (error) {
      console.error('Erro ao excluir template:', error);
      toast.error('Erro ao excluir template.');
    }
  };

  const handleFill = (templateId: string) => {
    router.push(`/dashboard/checklists/fill/${templateId}`);
  };

  const filteredTemplates = useMemo(
    () =>
      templates.filter(
        (template) =>
          template.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
          template.descricao?.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [templates, searchTerm],
  );

  return (
    <div className="space-y-6">
      <Card tone="elevated" padding="lg">
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[var(--ds-radius-lg)] bg-[color:var(--ds-color-action-primary)]/12 text-[var(--ds-color-action-primary)]">
              <FileText className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl">Templates de checklists</CardTitle>
              <CardDescription>
                Gerencie modelos reutilizáveis para inspeções e padronize execuções em campo.
              </CardDescription>
            </div>
          </div>
          <Link
            href="/dashboard/checklist-templates/new"
            className={cn(buttonVariants({ variant: 'primary' }), 'gap-2')}
          >
            <Plus className="h-4 w-4" />
            Novo template
          </Link>
        </CardHeader>
      </Card>

      <Card tone="default" padding="none" className="overflow-hidden">
        <div className="border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 p-4">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
            <Input
              type="text"
              placeholder="Buscar templates..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <CardContent className="p-4">
          {loading ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-[var(--ds-color-action-primary)] border-t-transparent" />
              <p className="text-sm text-[var(--ds-color-text-muted)]">Carregando templates...</p>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--ds-color-primary-subtle)]">
                <FileText className="h-7 w-7 text-[var(--ds-color-action-primary)]" />
              </div>
              <p className="text-sm text-[var(--ds-color-text-secondary)]">Nenhum template encontrado.</p>
              <Link
                href="/dashboard/checklist-templates/new"
                className={cn(buttonVariants({ variant: 'outline' }), 'mt-4 gap-2')}
              >
                <Plus className="h-4 w-4" />
                Criar primeiro template
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  className="group rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-4 shadow-[var(--ds-shadow-xs)] transition-all hover:-translate-y-px hover:border-[var(--ds-color-border-default)] hover:shadow-[var(--ds-shadow-sm)]"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="mb-1 truncate font-semibold text-[var(--ds-color-text-primary)]">{template.titulo}</h3>
                      {template.descricao ? (
                        <p className="line-clamp-2 text-sm text-[var(--ds-color-text-secondary)]">{template.descricao}</p>
                      ) : (
                        <p className="text-sm text-[var(--ds-color-text-muted)]">Sem descrição cadastrada.</p>
                      )}
                    </div>
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[var(--ds-radius-sm)] bg-[var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]">
                      <FileText className="h-4 w-4" />
                    </div>
                  </div>

                  <div className="mb-4 flex flex-wrap gap-2 text-xs text-[var(--ds-color-text-secondary)]">
                    {template.categoria ? (
                      <span className="rounded-full bg-[var(--ds-color-surface-muted)]/65 px-2 py-1">Categoria: {template.categoria}</span>
                    ) : null}
                    {template.periodicidade ? (
                      <span className="rounded-full bg-[var(--ds-color-surface-muted)]/65 px-2 py-1">Periodicidade: {template.periodicidade}</span>
                    ) : null}
                    {template.itens && Array.isArray(template.itens) ? (
                      <span className="rounded-full bg-[var(--ds-color-surface-muted)]/65 px-2 py-1">Itens: {template.itens.length}</span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="success"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleFill(template.id)}
                      leftIcon={<ClipboardCheck className="h-4 w-4" />}
                    >
                      Preencher
                    </Button>
                    <Link
                      href={`/dashboard/checklist-templates/edit/${template.id}`}
                      className={cn(buttonVariants({ variant: 'outline', size: 'icon' }))}
                      aria-label={`Editar template ${template.titulo}`}
                      title="Editar template"
                    >
                      <Edit className="h-4 w-4" />
                    </Link>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      onClick={() => handleDelete(template.id)}
                      aria-label={`Excluir template ${template.titulo}`}
                      title="Excluir template"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
