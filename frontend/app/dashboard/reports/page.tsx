'use client';

import { useState, useEffect } from 'react';
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

  useEffect(() => {
    loadReports();
  }, [page]);

  async function loadReports() {
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
  }

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
          toast.success('Relatório mensal gerado com sucesso pelo COMPLIANCE X!');
          if (page !== 1) {
            setPage(1);
          } else {
            loadReports();
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
      loadReports();
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
    const title = `RELATÓRIO COMPLIANCE X - ${report.mes}/${report.ano}`;
    const filename = `Relatorio_ComplianceX_${report.mes}_${report.ano}.pdf`;

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
    doc.text('Insight COMPLIANCE X', margin, analysisStart);
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
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatórios COMPLIANCE X</h1>
          <p className="text-gray-500">Relatórios inteligentes e estatísticas mensais</p>
        </div>
        <button
          onClick={handleGenerateReport}
          disabled={generating}
          className="flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {generating ? (
            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
          ) : (
            <BrainCircuit className="mr-2 h-4 w-4" />
          )}
          Gerar Relatório Mensal
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          </div>
        ) : reports.length === 0 ? (
          <div className="col-span-full rounded-xl border-2 border-dashed p-10 text-center">
            <FileText className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">Nenhum relatório gerado</h3>
            <p className="mt-2 text-gray-500">Clique no botão acima para gerar seu primeiro relatório inteligente.</p>
          </div>
        ) : (
          reports.map((report) => (
            <div key={report.id} className="flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm transition-all hover:shadow-md">
              <div className="border-b bg-gray-50/50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-indigo-600">
                    <Calendar className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      {report.mes}/{report.ano}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(report.id)}
                    className="text-gray-400 hover:text-red-600 transition-colors"
                    title="Excluir relatório"
                    aria-label="Excluir relatório"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <h3 className="mt-2 font-bold text-gray-900">{report.titulo}</h3>
              </div>
              
              <div className="flex-1 p-4 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-blue-50 p-2 text-center">
                    <p className="text-[10px] font-medium text-blue-600 uppercase">APRs</p>
                    <p className="text-lg font-bold text-blue-900">{report.estatisticas.aprs_count}</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-2 text-center">
                    <p className="text-[10px] font-medium text-amber-600 uppercase">PTs</p>
                    <p className="text-lg font-bold text-amber-900">{report.estatisticas.pts_count}</p>
                  </div>
                  <div className="rounded-lg bg-green-50 p-2 text-center">
                    <p className="text-[10px] font-medium text-green-600 uppercase">DDS</p>
                    <p className="text-lg font-bold text-green-900">{report.estatisticas.dds_count}</p>
                  </div>
                  <div className="rounded-lg bg-purple-50 p-2 text-center">
                    <p className="text-[10px] font-medium text-purple-600 uppercase">Checks</p>
                    <p className="text-lg font-bold text-purple-900">{report.estatisticas.checklists_count}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-indigo-100 bg-indigo-50/30 p-3">
                  <div className="flex items-center mb-2">
                    <BrainCircuit className="h-3 w-3 text-indigo-600 mr-1.5" />
                    <span className="text-[10px] font-bold text-indigo-700 uppercase">Insight COMPLIANCE X</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed line-clamp-4">
                    {report.analise_gandra}
                  </p>
                </div>
              </div>

              <div className="border-t p-3 bg-gray-50/30 flex items-center justify-between">
                <span className="text-[10px] text-gray-400">
                  Gerado em {format(new Date(report.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => handlePrint(report)}
                    className="rounded p-1.5 text-gray-500 hover:bg-white hover:text-indigo-600 transition-all border border-transparent hover:border-indigo-100"
                    title="Imprimir relatório"
                    aria-label="Imprimir relatório"
                  >
                    <Printer className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => handleSendEmail(report)}
                    className="rounded p-1.5 text-gray-500 hover:bg-white hover:text-indigo-600 transition-all border border-transparent hover:border-indigo-100"
                    title="Enviar relatório"
                    aria-label="Enviar relatório"
                  >
                    <Mail className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => handleDownloadPdf(report)}
                    className="rounded p-1.5 text-gray-500 hover:bg-white hover:text-indigo-600 transition-all border border-transparent hover:border-indigo-100"
                    title="Baixar relatório"
                    aria-label="Baixar relatório"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button 
                    className="rounded p-1.5 text-gray-500 hover:bg-white hover:text-indigo-600 transition-all border border-transparent hover:border-indigo-100"
                    title="Ver estatísticas"
                    aria-label="Ver estatísticas"
                  >
                    <BarChart3 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
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
