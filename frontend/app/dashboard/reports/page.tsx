'use client';

import { useCallback, useState, useEffect, type ReactNode } from 'react';
import { reportsService, Report } from '@/services/reportsService';
import { FileText, Trash2, Calendar, BrainCircuit, Download, BarChart3, Mail, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SendMailModal } from '@/components/SendMailModal';
import { openPdfForPrint } from '@/lib/print-utils';
import { PaginationControls } from '@/components/PaginationControls';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; filename: string; base64: string } | null>(null);

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      const response = await reportsService.findPaginated({ page, limit: 9 });
      setReports(response.data);
      setTotal(response.total);
      setLastPage(response.lastPage);
    } catch (error) {
      console.error('Erro ao carregar relatórios:', error);
      toast.error('Erro ao carregar lista de relatórios.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  async function handleGenerateReport() {
    try {
      setGenerating(true);
      const now = new Date();
      const mes = now.getMonth() + 1;
      const ano = now.getFullYear();
      
      const job = await reportsService.generate(mes, ano);
      toast.info('Relatório enfileirado. Aguardando processamento...');

      for (let attempt = 0; attempt < 20; attempt += 1) {
        await wait(3000);
        const status = await reportsService.getStatus(job.jobId);

        if (status.state === 'completed') {
          toast.success('Relatório mensal gerado com sucesso pelo GST!');
          if (page !== 1) {
            setPage(1);
          } else {
            void loadReports();
          }
          return;
        }

        if (status.state === 'failed') {
          throw new Error('A fila de geração retornou falha.');
        }
      }

      toast.warning('Relatório ainda está processando. Atualize a lista em instantes.');
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      toast.error('Erro ao gerar relatório mensal.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja excluir este relatório?')) return;

    try {
      await reportsService.delete(id);
      toast.success('Relatório excluído com sucesso!');
      if (reports.length === 1 && page > 1) {
        setPage((current) => current - 1);
        return;
      }
      void loadReports();
    } catch (error) {
      console.error('Erro ao excluir relatório:', error);
      toast.error('Erro ao excluir relatório.');
    }
  }

  const generateReportPdf = (report: Report, options: { save?: boolean; output?: 'base64' } = { save: true }) => {
    interface jsPDFWithAutoTable extends jsPDF {
      lastAutoTable: {
        finalY: number;
      };
    }
    const doc = new jsPDF() as jsPDFWithAutoTable;
    const pageWidth = doc.internal.pageSize.width;
    const margin = 14;
    const title = `RELATÓRIO <GST> - ${report.mes}/${report.ano}`;
    const filename = `Relatorio_GST_Gestao_Seguranca_Trabalho_${report.mes}_${report.ano}.pdf`;

    doc.setFontSize(16);
    doc.setTextColor(41, 128, 185);
    doc.text(title, pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Gerado em ${format(new Date(report.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, pageWidth - margin, 28, { align: 'right' });

    autoTable(doc, {
      startY: 36,
      head: [['Estatísticas Mensais', '']],
      body: [
        ['APRs:', report.estatisticas.aprs_count.toString()],
        ['PTs:', report.estatisticas.pts_count.toString()],
        ['DDS:', report.estatisticas.dds_count.toString()],
        ['Checklists:', report.estatisticas.checklists_count.toString()],
        ['Treinamentos:', report.estatisticas.trainings_count.toString()],
      ],
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185], textColor: 255 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
    });

    const analysisStart = doc.lastAutoTable.finalY + 12;
    doc.setFontSize(12);
    doc.setTextColor(41, 128, 185);
    doc.text('Insight <GST>', margin, analysisStart);
    doc.setDrawColor(41, 128, 185);
    doc.line(margin, analysisStart + 2, pageWidth - margin, analysisStart + 2);

    doc.setFontSize(10);
    doc.setTextColor(0);
    const text = doc.splitTextToSize(report.analise_gandra || '-', pageWidth - margin * 2);
    doc.text(text, margin, analysisStart + 10);

    if (options.save) {
      doc.save(filename);
    }

    if (options.output === 'base64') {
      return {
        filename,
        base64: doc.output('datauristring').split(',')[1],
      };
    }
  };

  const handleDownloadPdf = (report: Report) => {
    try {
      generateReportPdf(report);
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar PDF do relatório.');
    }
  };

  const handlePrint = (report: Report) => {
    try {
      const result = generateReportPdf(report, { save: false, output: 'base64' }) as { base64: string };
      if (result?.base64) {
        const byteCharacters = atob(result.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const file = new Blob([byteArray], { type: 'application/pdf' });
        const fileURL = URL.createObjectURL(file);
        openPdfForPrint(fileURL, () => {
          toast.info('Pop-up bloqueado. Abrimos o PDF na mesma aba para impressão.');
        });
      }
    } catch (error) {
      console.error('Erro ao imprimir:', error);
      toast.error('Erro ao preparar impressão do relatório.');
    }
  };

  const handleSendEmail = (report: Report) => {
    try {
      const result = generateReportPdf(report, { save: false, output: 'base64' }) as { filename: string; base64: string };
      if (result?.base64) {
        setSelectedDoc({
          name: report.titulo,
          filename: result.filename,
          base64: result.base64,
        });
        setIsMailModalOpen(true);
      }
    } catch (error) {
      console.error('Erro ao preparar e-mail:', error);
      toast.error('Erro ao preparar o documento para envio.');
    }
  };

  return (
    <div className="space-y-6">
      <Card tone="elevated" padding="lg">
        <CardHeader className="gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <Badge variant="accent" className="w-fit">
              <BrainCircuit className="h-3.5 w-3.5" />
              Inteligência mensal
            </Badge>
            <div>
              <CardTitle className="text-xl">Relatórios &lt;GST&gt;</CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                Relatórios executivos mensais com consolidação operacional, estatísticas de emissão
                e síntese automática da IA.
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="ds-badge ds-badge--info">Total: {total}</div>
            <Button
              type="button"
              onClick={handleGenerateReport}
              disabled={generating}
              leftIcon={
                generating ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <BrainCircuit className="h-4 w-4" />
                )
              }
            >
              {generating ? 'Gerando relatório' : 'Gerar relatório mensal'}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-primary)] border-t-transparent"></div>
          </div>
        ) : reports.length === 0 ? (
          <Card tone="muted" className="col-span-full border-dashed p-10 text-center">
            <FileText className="mx-auto h-12 w-12 text-[var(--color-text-muted)]/40" />
            <h3 className="mt-4 text-base font-semibold text-[var(--color-text)]">Nenhum relatório gerado</h3>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Gere o primeiro relatório mensal para consolidar indicadores e insights.
            </p>
          </Card>
        ) : (
          reports.map((report) => (
            <Card key={report.id} tone="default" padding="none" interactive className="overflow-hidden">
              <div className="border-b border-[var(--color-border-subtle)] bg-[color:var(--color-card-muted)]/18 px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="primary" className="text-[10px] uppercase tracking-[0.12em]">
                        <Calendar className="h-3 w-3" />
                        {report.mes}/{report.ano}
                      </Badge>
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        {format(new Date(report.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    <h3 className="mt-2 text-[0.95rem] font-semibold text-[var(--color-text)]">
                      {report.titulo}
                    </h3>
                  </div>
                  <button
                    onClick={() => handleDelete(report.id)}
                    className="rounded-lg border border-transparent p-1.5 text-[var(--color-text-muted)] transition-colors hover:border-[color:var(--color-danger)]/20 hover:bg-[color:var(--ds-color-danger-subtle)] hover:text-[var(--color-danger)]"
                    title="Excluir relatório"
                    aria-label="Excluir relatório"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <CardContent className="space-y-3.5 p-4">
                <div className="grid grid-cols-2 gap-2.5">
                  <MetricCell label="APRs" value={report.estatisticas.aprs_count} variant="primary" />
                  <MetricCell label="PTs" value={report.estatisticas.pts_count} variant="warning" />
                  <MetricCell label="DDS" value={report.estatisticas.dds_count} variant="success" />
                  <MetricCell label="Checks" value={report.estatisticas.checklists_count} variant="accent" />
                </div>

                <div className="rounded-xl border border-[color:var(--color-primary)]/16 bg-[color:var(--ds-color-primary-subtle)] p-3">
                  <div className="mb-2 flex items-center gap-1.5">
                    <BrainCircuit className="h-3.5 w-3.5 text-[var(--color-primary)]" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-primary)]">
                      Insight &lt;GST&gt;
                    </span>
                  </div>
                  <p className="line-clamp-4 text-[12px] leading-relaxed text-[var(--color-text-secondary)]">
                    {report.analise_gandra}
                  </p>
                </div>
              </CardContent>

              <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] bg-[color:var(--color-card-muted)]/12 px-3.5 py-3">
                <span className="text-[10px] text-[var(--color-text-muted)]">Exportar ou compartilhar</span>
                <div className="flex gap-1.5">
                  <ActionIcon onClick={() => handlePrint(report)} title="Imprimir relatório" icon={<Printer className="h-4 w-4" />} />
                  <ActionIcon onClick={() => handleSendEmail(report)} title="Enviar relatório" icon={<Mail className="h-4 w-4" />} />
                  <ActionIcon onClick={() => handleDownloadPdf(report)} title="Baixar relatório" icon={<Download className="h-4 w-4" />} />
                  <ActionIcon title="Ver estatísticas" icon={<BarChart3 className="h-4 w-4" />} />
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {!loading && total > 0 ? (
        <PaginationControls
          page={page}
          lastPage={lastPage}
          total={total}
          onPrev={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => Math.min(lastPage, current + 1))}
        />
      ) : null}

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

function MetricCell({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: 'primary' | 'warning' | 'success' | 'accent';
}) {
  const classes =
    variant === 'warning'
      ? 'bg-[color:var(--ds-color-warning-subtle)] text-[var(--color-warning)]'
      : variant === 'success'
        ? 'bg-[color:var(--ds-color-success-subtle)] text-[var(--color-success)]'
        : variant === 'accent'
          ? 'bg-[color:var(--ds-color-accent-subtle)] text-[var(--color-secondary)]'
          : 'bg-[color:var(--ds-color-primary-subtle)] text-[var(--color-primary)]';

  return (
    <div className={`rounded-xl border border-[var(--color-border-subtle)] p-2.5 text-center ${classes}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</p>
      <p className="mt-1 text-[1.1rem] font-bold">{value}</p>
    </div>
  );
}

function ActionIcon({
  onClick,
  title,
  icon,
}: {
  onClick?: () => void;
  title: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-transparent p-1.5 text-[var(--color-text-muted)] transition-colors hover:border-[color:var(--color-primary)]/18 hover:bg-[color:var(--ds-color-primary-subtle)] hover:text-[var(--color-primary)]"
      title={title}
      aria-label={title}
    >
      {icon}
    </button>
  );
}
