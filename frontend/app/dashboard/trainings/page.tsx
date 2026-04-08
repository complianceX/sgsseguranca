'use client';

import dynamic from 'next/dynamic';
import { useCallback, useDeferredValue, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Training,
  TrainingBlockingUser,
  TrainingExpirySummary,
  trainingsService,
} from '@/services/trainingsService';
import { signaturesService } from '@/services/signaturesService';
import {
  Calendar,
  Download,
  FileSpreadsheet,
  Mail,
  Pencil,
  Plus,
  Printer,
  Search,
  ShieldAlert,
  Trash2,
  User,
} from 'lucide-react';
import { downloadExcel } from '@/lib/download-excel';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PaginationControls } from '@/components/PaginationControls';
import { openPdfForPrint } from '@/lib/print-utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState, ErrorState, PageLoadingState } from '@/components/ui/state';
import { ListPageLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { safeToLocaleDateString } from '@/lib/date/safeFormat';
const SendMailModal = dynamic(
  () => import('@/components/SendMailModal').then((module) => module.SendMailModal),
  { ssr: false },
);
const loadTrainingPdfGenerator = async () =>
  import('@/lib/pdf/trainingGenerator');

function getTrainingStatusTone(dataVencimento: string): StatusTone {
  const now = new Date();
  const expiry = new Date(dataVencimento);

  if (expiry.getTime() < now.getTime()) {
    return 'danger';
  }

  const daysRemaining = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return daysRemaining <= 30 ? 'warning' : 'success';
}

type PrintablePdfResult = { base64: string; filename: string };

export default function TrainingsPage() {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  const handlePrevPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, [setPage]);

  const handleNextPage = useCallback(() => {
    setPage((current) => Math.min(lastPage, current + 1));
  }, [lastPage, setPage]);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{
    name: string;
    filename: string;
    base64: string;
  } | null>(null);
  const [expirySummary, setExpirySummary] = useState<TrainingExpirySummary>({
    total: 0,
    expired: 0,
    expiringSoon: 0,
    valid: 0,
  });
  const [blockingUsers, setBlockingUsers] = useState<TrainingBlockingUser[]>([]);

  const loadTrainings = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [paged, summary, pendingUsers] = await Promise.all([
        trainingsService.findPaginated({ page, limit }),
        trainingsService.getExpirySummary(),
        trainingsService.getBlockingUsers(),
      ]);
      setTrainings(paged.data);
      setTotal(paged.total);
      setLastPage(paged.lastPage);
      setExpirySummary(summary);
      setBlockingUsers(pendingUsers);
    } catch (error) {
      console.error('Erro ao carregar treinamentos:', error);
      setLoadError('Nao foi possivel carregar o monitor de treinamentos.');
      toast.error('Nao foi possivel carregar os treinamentos.');
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

  useEffect(() => {
    void loadTrainings();
  }, [loadTrainings]);

  const handleNotifyExpiring = async () => {
    try {
      const result = await trainingsService.notifyExpiry(7);
      toast.success(
        `${result.notificationsCreated} notificacoes enviadas para ${result.trainings} treinamento(s).`,
      );
      await loadTrainings();
    } catch (error) {
      console.error('Erro ao notificar vencimentos:', error);
      toast.error('Nao foi possivel enviar alertas automaticos.');
    }
  };

  const handleDownloadPdf = async (training: Training) => {
    try {
      setPrintingId(training.id);
      const signatures = await signaturesService.findByTraining(training.id);
      const { generateTrainingPdf } = await loadTrainingPdfGenerator();
      await generateTrainingPdf(training, signatures, {
        draftWatermark: false,
      });
      toast.success('PDF gerado com sucesso.');
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
      const { generateTrainingPdf } = await loadTrainingPdfGenerator();
      const pdfData = (await generateTrainingPdf(training, signatures, {
        save: false,
        output: 'base64',
        draftWatermark: false,
      })) as PrintablePdfResult | undefined;

      if (pdfData?.base64) {
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
      const { generateTrainingPdf } = await loadTrainingPdfGenerator();
      const result = (await generateTrainingPdf(training, signatures, {
        save: false,
        output: 'base64',
        draftWatermark: false,
      })) as PrintablePdfResult | undefined;
      if (result?.base64) {
        const byteCharacters = atob(result.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i += 1) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const file = new Blob([byteArray], { type: 'application/pdf' });
        const fileURL = URL.createObjectURL(file);
        openPdfForPrint(fileURL, () => {
          toast.info('Pop-up bloqueado. O PDF foi aberto na mesma aba para impressao.');
        });
      }
    } catch (error) {
      console.error('Erro ao imprimir:', error);
      toast.error('Erro ao preparar impressao do treinamento.');
    } finally {
      setPrintingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este treinamento?')) return;

    try {
      await trainingsService.delete(id);
      toast.success('Treinamento excluido com sucesso.');
      await loadTrainings();
    } catch (error) {
      console.error('Erro ao excluir treinamento:', error);
      toast.error('Erro ao excluir treinamento.');
    }
  };

  const filteredTrainings = trainings.filter((training) => {
    const term = deferredSearchTerm.toLowerCase();
    return (
      training.nome.toLowerCase().includes(term) ||
      (training.user?.nome?.toLowerCase() || '').includes(term)
    );
  });

  const getStatusLabel = (vencimento: string) => {
    const date = new Date(vencimento);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return 'Vencido';
    if (days <= 30) return 'Vence em breve';
    return 'Valido';
  };

  const handleExportCsv = () => {
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = ['Colaborador', 'Treinamento', 'Conclusao', 'Vencimento', 'Status'];
    const rows = filteredTrainings.map((training) => [
      training.user?.nome || 'Colaborador',
      training.nome,
      safeToLocaleDateString(training.data_conclusao, 'pt-BR', undefined, '—'),
      safeToLocaleDateString(training.data_vencimento, 'pt-BR', undefined, '—'),
      getStatusLabel(training.data_vencimento),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map(escapeCsv).join(';'))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `treinamentos_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando monitor de treinamentos"
        description="Buscando validade, pendencias e indicadores de bloqueio operacional."
        cards={3}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar treinamentos"
        description={loadError}
        action={
          <Button type="button" onClick={loadTrainings}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return (
    <>
      <ListPageLayout
        eyebrow="Validade e bloqueio"
        title="Monitor de Treinamentos"
        description="Controle validade de NRs, bloqueios operacionais e disparo de alertas automaticos."
        icon={<Calendar className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadExcel('/trainings/export/excel', 'treinamentos.xlsx')}
              leftIcon={<FileSpreadsheet className="h-4 w-4 text-[var(--ds-color-success)]" />}
            >
              Exportar Excel
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={handleNotifyExpiring}>
              Notificar vencimentos
            </Button>
            <Link
              href="/dashboard/trainings/new"
              className={cn(buttonVariants({ size: 'sm' }), 'inline-flex items-center')}
            >
              <Plus className="mr-2 h-4 w-4" />
              Registrar treinamento
            </Link>
          </div>
        }
        metrics={[
          {
            label: 'Treinamentos vencidos',
            value: expirySummary.expired,
            note: 'Colaboradores em risco de bloqueio operacional.',
            tone: 'danger',
          },
          {
            label: 'Vencendo em breve',
            value: expirySummary.expiringSoon,
            note: 'Janela de acao para renovacao preventiva.',
            tone: 'warning',
          },
          {
            label: 'Treinamentos validos',
            value: expirySummary.valid,
            note: 'Capacitacoes regulares e sem vencimento proximo.',
            tone: 'success',
          },
        ]}
        toolbarTitle="Treinamentos registrados"
        toolbarDescription={`${filteredTrainings.length} resultado(s) exibidos nesta pagina.`}
        toolbarContent={
          <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-end">
            <div className="ds-list-search ds-list-search--wide min-w-[240px] flex-1 md:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
              <input
                type="text"
                placeholder="Buscar por treinamento ou colaborador"
                aria-label="Buscar treinamentos por nome do treinamento ou colaborador"
                className="w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] py-2 pl-10 pr-4 text-sm text-[var(--ds-color-text-primary)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
        }
        footer={
          filteredTrainings.length > 0 ? (
            <PaginationControls
              page={page}
              lastPage={lastPage}
              total={total}
              onPrev={handlePrevPage}
              onNext={handleNextPage}
            />
          ) : null
        }
      >
        <div className="space-y-4">
          {blockingUsers.length > 0 ? (
            <div className="mx-4 mt-4 rounded-[var(--ds-radius-lg)] border border-[color:var(--ds-color-danger)]/18 bg-[color:var(--ds-color-danger)]/6 px-4 py-3">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 text-[var(--ds-color-danger)]" />
                <div>
                  <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                    Bloqueio operacional por treinamento pendente
                  </p>
                  <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
                    {blockingUsers.length} colaborador(es) estao bloqueados para emissao de PT ate regularizacao.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {filteredTrainings.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Nenhum treinamento encontrado"
                description={
                  searchTerm
                    ? 'Nenhum resultado corresponde ao filtro aplicado.'
                    : 'Ainda nao existem treinamentos registrados para este tenant.'
                }
                action={
                  !searchTerm ? (
                    <Link
                      href="/dashboard/trainings/new"
                      className={cn(buttonVariants(), 'inline-flex items-center')}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Registrar treinamento
                    </Link>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Treinamento / NR</TableHead>
                  <TableHead>Conclusao</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTrainings.map((training) => (
                  <TableRow key={training.id}>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--ds-color-action-primary)]/12 text-[var(--ds-color-action-primary)]">
                          <User className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-medium text-[var(--ds-color-text-primary)]">
                            {training.user?.nome || 'Colaborador'}
                          </div>
                          <div className="text-xs text-[var(--ds-color-text-muted)]">
                            ID {training.user_id.slice(0, 8)}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-[var(--ds-color-text-primary)]">{training.nome}</div>
                      {training.nr_codigo ? (
                        <div className="text-xs text-[var(--ds-color-text-muted)]">{training.nr_codigo}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {safeToLocaleDateString(training.data_conclusao, 'pt-BR', undefined, '—')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2 text-[var(--ds-color-text-secondary)]">
                        <Calendar className="h-4 w-4" />
                        <span>{safeToLocaleDateString(training.data_vencimento, 'pt-BR', undefined, '—')}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusPill tone={getTrainingStatusTone(training.data_vencimento)}>
                        {getStatusLabel(training.data_vencimento)}
                      </StatusPill>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handlePrint(training)}
                          disabled={printingId === training.id}
                          title="Imprimir"
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDownloadPdf(training)}
                          disabled={printingId === training.id}
                          title="Baixar PDF"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleSendEmail(training)}
                          disabled={printingId === training.id}
                          title="Enviar por e-mail"
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                        <Link
                          href={`/dashboard/trainings/edit/${training.id}`}
                          className={buttonVariants({ size: 'icon', variant: 'ghost' })}
                          title="Editar treinamento"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(training.id)}
                          title="Excluir treinamento"
                          className="text-[var(--ds-color-danger)] hover:bg-[color:var(--ds-color-danger)]/10 hover:text-[var(--ds-color-danger)]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </ListPageLayout>

      {selectedDoc ? (
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
      ) : null}
    </>
  );
}




