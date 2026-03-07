'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  trainingsService,
  Training,
  TrainingExpirySummary,
  TrainingBlockingUser,
} from '@/services/trainingsService';
import { signaturesService } from '@/services/signaturesService';
import { generateTrainingPdf } from '@/lib/pdf/trainingGenerator';
import {
  Plus,
  Search,
  User,
  Calendar,
  Download,
  Mail,
  Printer,
  Pencil,
  Trash2,
  FileSpreadsheet,
} from 'lucide-react';
import { downloadExcel } from '@/lib/download-excel';
import { toast } from 'sonner';
import { SendMailModal } from '@/components/SendMailModal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PaginationControls } from '@/components/PaginationControls';
import { openPdfForPrint } from '@/lib/print-utils';

export default function TrainingsPage() {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; filename: string; base64: string } | null>(null);
  const [expirySummary, setExpirySummary] = useState<TrainingExpirySummary>({
    total: 0,
    expired: 0,
    expiringSoon: 0,
    valid: 0,
  });
  const [blockingUsers, setBlockingUsers] = useState<TrainingBlockingUser[]>([]);

  const loadTrainings = useCallback(async () => {
    try {
      const [paged, summary] = await Promise.all([
        trainingsService.findPaginated({ page, limit }),
        trainingsService.getExpirySummary(),
      ]);
      setTrainings(paged.data);
      setTotal(paged.total);
      setLastPage(paged.lastPage);
      setExpirySummary(summary);
      const pendingUsers = await trainingsService.getBlockingUsers();
      setBlockingUsers(pendingUsers);
    } catch (error) {
      console.error('Erro ao carregar treinamentos:', error);
      toast.error('Não foi possível carregar os treinamentos.');
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

  useEffect(() => {
    loadTrainings();
  }, [loadTrainings]);

  const handleNotifyExpiring = async () => {
    try {
      const result = await trainingsService.notifyExpiry(7);
      toast.success(
        `${result.notificationsCreated} notificações enviadas para ${result.trainings} treinamento(s).`,
      );
    } catch (error) {
      console.error('Erro ao notificar vencimentos:', error);
      toast.error('Não foi possível enviar alertas automáticos.');
    }
  };

  const handleDownloadPdf = async (training: Training) => {
    try {
      setPrintingId(training.id);
      const signatures = await signaturesService.findByTraining(training.id);
      await generateTrainingPdf(training, signatures);
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar PDF do treinamento.');
    } finally {
      setPrintingId(null);
    }
  };

  const handleSendEmail = async (training: Training) => {
    try {
      setPrintingId(training.id);
      const signatures = await signaturesService.findByTraining(training.id);
      const pdfData = await generateTrainingPdf(training, signatures, { save: false, output: 'base64' });
      
      if (pdfData && pdfData.base64) {
        setSelectedDoc({
          name: training.nome,
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

  const handlePrint = async (training: Training) => {
    try {
      setPrintingId(training.id);
      const signatures = await signaturesService.findByTraining(training.id);
      const result = await generateTrainingPdf(training, signatures, { save: false, output: 'base64' }) as { base64: string };
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
      toast.error('Erro ao preparar impressão do treinamento.');
    } finally {
      setPrintingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este treinamento?')) return;

    try {
      await trainingsService.delete(id);
      toast.success('Treinamento excluído com sucesso!');
      loadTrainings();
    } catch (error) {
      console.error('Erro ao excluir treinamento:', error);
      toast.error('Erro ao excluir treinamento.');
    }
  };

  const filteredTrainings = trainings.filter((t) =>
    t.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.user?.nome?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (vencimento: string) => {
    const date = new Date(vencimento);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return 'text-red-600 bg-red-50 border-red-100';
    if (days <= 30) return 'text-amber-600 bg-amber-50 border-amber-100';
    return 'text-green-600 bg-green-50 border-green-100';
  };

  const getStatusLabel = (vencimento: string) => {
    const date = new Date(vencimento);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return 'Vencido';
    if (days <= 30) return 'Vence em breve';
    return 'Válido';
  };

  const handleExportCsv = () => {
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = ['Colaborador', 'Treinamento', 'Conclusão', 'Vencimento', 'Status'];
    const rows = filteredTrainings.map((training) => [
      training.user?.nome || 'Colaborador',
      training.nome,
      new Date(training.data_conclusao).toLocaleDateString('pt-BR'),
      new Date(training.data_vencimento).toLocaleDateString('pt-BR'),
      getStatusLabel(training.data_vencimento),
    ]);
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `treinamentos_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Monitor de Treinamentos</h1>
            <p className="text-gray-500">Controle de validade de NRs e capacitações.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
              {expirySummary.expired} vencido(s)
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {expirySummary.expiringSoon} a vencer
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {filteredTrainings.length} resultado(s)
            </span>
            <button
              type="button"
              onClick={() => downloadExcel('/trainings/export/excel', 'treinamentos.xlsx')}
              className="flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <FileSpreadsheet className="mr-1.5 h-4 w-4 text-green-600" />
              Exportar Excel
            </button>
            <button
              type="button"
              onClick={handleNotifyExpiring}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
            >
              Notificar vencimentos
            </button>
            <Link
              href="/dashboard/trainings/new"
              className="flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Registrar Treinamento
            </Link>
          </div>
        </div>
      </div>

      {blockingUsers.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="text-sm font-semibold">
            Bloqueio por pendencia de treinamento NR ativo para {blockingUsers.length}{' '}
            colaborador(es).
          </p>
          <p className="mt-1 text-xs">
            Esses colaboradores nao podem ser usados em emissao de PT ate regularizacao.
          </p>
        </div>
      )}

      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b bg-slate-50/70 p-4">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Buscar por treinamento ou colaborador..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          className="flex items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </button>
      </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Treinamento / NR</TableHead>
              <TableHead>Conclusão</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center">
                  <div className="flex justify-center">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredTrainings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-gray-500">
                  Nenhum treinamento encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredTrainings.map((training) => (
                <TableRow key={training.id}>
                  <TableCell>
                    <div className="flex items-center space-x-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                        <User className="h-4 w-4" />
                      </div>
                      <span className="font-medium text-gray-900">{training.user?.nome}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-gray-700">{training.nome}</TableCell>
                  <TableCell>{new Date(training.data_conclusao).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2 text-gray-500">
                      <Calendar className="h-4 w-4" />
                      <span>{new Date(training.data_vencimento).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${getStatusColor(training.data_vencimento)}`}>
                      {getStatusLabel(training.data_vencimento)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end space-x-3">
                      <button
                        onClick={() => handlePrint(training)}
                        disabled={printingId === training.id}
                        className={`text-gray-600 transition-colors hover:text-gray-800 ${printingId === training.id ? 'animate-pulse opacity-50' : ''}`}
                        title="Imprimir"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDownloadPdf(training)}
                        disabled={printingId === training.id}
                        className={`text-gray-600 transition-colors hover:text-gray-800 ${printingId === training.id ? 'animate-pulse opacity-50' : ''}`}
                        title="Baixar PDF"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleSendEmail(training)}
                        disabled={printingId === training.id}
                        className={`text-gray-600 transition-colors hover:text-gray-800 ${printingId === training.id ? 'animate-pulse opacity-50' : ''}`}
                        title="Enviar por E-mail"
                      >
                        <Mail className="h-4 w-4" />
                      </button>
                      <Link
                        href={`/dashboard/trainings/edit/${training.id}`}
                        className="text-blue-600 transition-colors hover:text-blue-800"
                        title="Editar Treinamento"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(training.id)}
                        className="text-red-600 transition-colors hover:text-red-800"
                        title="Excluir Treinamento"
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

        {!loading && (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(lastPage, p + 1))}
          />
        )}
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
