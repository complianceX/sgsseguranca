'use client';

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BrainCircuit, Download, FileText, RefreshCw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type {
  PhotographicReport,
  PhotographicReportExport,
} from '@/services/photographicReportsService';

interface Step3FormState {
  ai_summary: string;
  final_conclusion: string;
}

interface WizardStep3Props {
  report: PhotographicReport;
  form: Step3FormState;
  onFormChange: (key: keyof Step3FormState, value: string) => void;
  canManage: boolean;
  canUseAi: boolean;
  canFinalize: boolean;
  canExportPdf: boolean;
  canExportWord: boolean;
  saving: boolean;
  analyzing: boolean;
  exporting: 'pdf' | 'word' | null;
  onSaveDraft: () => void;
  onGenerateSummary: () => void;
  onFinalize: () => void;
  onExportPdf: () => void;
  onExportWord: () => void;
  onDownloadExport: (entry: PhotographicReportExport) => void;
  onBack: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  Rascunho: 'Rascunho',
  'Aguardando fotos': 'Aguardando fotos',
  'Aguardando análise': 'Aguardando análise',
  'Em análise': 'Em análise',
  Analisado: 'Analisado',
  Finalizado: 'Finalizado',
  Exportado: 'Exportado',
  'Em edição': 'Em edição',
};

export function WizardStep3Review({
  report,
  form,
  onFormChange,
  canManage,
  canUseAi,
  canFinalize,
  canExportPdf,
  canExportWord,
  saving,
  analyzing,
  exporting,
  onSaveDraft,
  onGenerateSummary,
  onFinalize,
  onExportPdf,
  onExportWord,
  onDownloadExport,
  onBack,
}: WizardStep3Props) {
  const hasImages = (report.images?.length ?? 0) > 0;
  const isFinalized = ['Finalizado', 'Exportado'].includes(report.status);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Revisão e exportação</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gere o resumo com IA, finalize e exporte o relatório.
          </p>
        </div>
        <Badge variant={isFinalized ? 'success' : 'neutral'}>
          {STATUS_LABELS[report.status] ?? report.status}
        </Badge>
      </div>

      {/* Summary info */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="grid gap-2 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Cliente
            </p>
            <p className="font-medium text-foreground mt-0.5">
              {report.client_name || '—'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Obra
            </p>
            <p className="font-medium text-foreground mt-0.5">
              {report.project_name || '—'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Fotos
            </p>
            <p className="font-medium text-foreground mt-0.5">
              {report.images?.length ?? 0} foto(s)
            </p>
          </div>
        </div>
      </div>

      {/* AI Summary + Conclusion */}
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <label className="block text-sm font-medium text-foreground">
              Síntese do relatório
            </label>
            {canUseAi && hasImages && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onGenerateSummary}
                loading={analyzing}
                leftIcon={
                  !analyzing ? <RefreshCw className="h-3.5 w-3.5" /> : undefined
                }
              >
                {report.ai_summary ? 'Regenerar com IA' : 'Gerar com IA'}
              </Button>
            )}
          </div>
          <textarea
            value={form.ai_summary}
            onChange={(e) => onFormChange('ai_summary', e.target.value)}
            disabled={!canManage}
            rows={5}
            placeholder="Síntese gerada pela IA ou escrita manualmente..."
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Conclusão final
          </label>
          <textarea
            value={form.final_conclusion}
            onChange={(e) => onFormChange('final_conclusion', e.target.value)}
            disabled={!canManage}
            rows={4}
            placeholder="Conclusão e recomendações finais..."
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={onSaveDraft}
          loading={saving}
          disabled={!canManage}
          leftIcon={<Save className="h-4 w-4" />}
        >
          Salvar edição
        </Button>
      </div>

      {/* Actions */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Ações do relatório</p>
        <div className="flex flex-wrap gap-2">
          {canFinalize && !isFinalized && (
            <Button
              type="button"
              onClick={onFinalize}
              loading={saving}
              disabled={!hasImages}
              leftIcon={<FileText className="h-4 w-4" />}
            >
              Finalizar relatório
            </Button>
          )}
          {canUseAi && hasImages && (
            <Button
              type="button"
              variant="outline"
              onClick={onGenerateSummary}
              loading={analyzing}
              leftIcon={<BrainCircuit className="h-4 w-4" />}
            >
              Analisar fotos com IA
            </Button>
          )}
          {canExportPdf && (
            <Button
              type="button"
              variant="outline"
              onClick={onExportPdf}
              loading={exporting === 'pdf'}
              disabled={!hasImages}
              leftIcon={<Download className="h-4 w-4" />}
            >
              Exportar PDF
            </Button>
          )}
          {canExportWord && (
            <Button
              type="button"
              variant="outline"
              onClick={onExportWord}
              loading={exporting === 'word'}
              disabled={!hasImages}
              leftIcon={<Download className="h-4 w-4" />}
            >
              Exportar Word
            </Button>
          )}
        </div>
      </div>

      {/* Export history */}
      {report.exports.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Histórico de exportações</p>
          <div className="space-y-2">
            {report.exports.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {entry.export_type.toUpperCase()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(entry.generated_at), 'dd/MM/yyyy HH:mm', {
                      locale: ptBR,
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDownloadExport(entry)}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Baixar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
        <Button type="button" variant="outline" onClick={onBack} disabled={saving || analyzing}>
          ← Voltar às fotos
        </Button>
      </div>
    </div>
  );
}
