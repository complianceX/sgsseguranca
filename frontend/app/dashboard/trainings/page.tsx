'use client';

import { useCallback, useDeferredValue, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Training,
  TrainingBlockingUser,
  TrainingExpirySummary,
  trainingsService,
} from '@/services/trainingsService';
import { signaturesService } from '@/services/signaturesService';
import { generateTrainingPdf } from '@/lib/pdf/trainingGenerator';
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
import { SendMailModal } from '@/components/SendMailModal';
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  EmptyState,
  ErrorState,
  PageLoadingState,
} from '@/components/ui/state';
import { cn } from '@/lib/utils';

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
      await loadTrainings();
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
      const pdfData = (await generateTrainingPdf(training, signatures, {
        save: false,
        output: 'base64',
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
      const result = (await generateTrainingPdf(training, signatures, {
        save: false,
        output: 'base64',
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
          toast.info('Pop-up bloqueado. O PDF foi aberto na mesma aba para impressão.');
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
      toast.success('Treinamento excluído com sucesso.');
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

  const getStatusTone = (vencimento: string) => {
    const date = new Date(vencimento);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return 'bg-[color:var(--ds-color-danger)]/12 text-[var(--ds-color-danger)]';
    if (days <= 30) return 'bg-[color:var(--ds-color-warning)]/14 text-[var(--ds-color-warning)]';
    return 'bg-[color:var(--ds-color-success)]/12 text-[var(--ds-color-success)]';
  };

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
    const header = ['Colaborador', 'Treinamento', 'Conclusão', 'Vencimento', 'Status'];
    const rows = filteredTrainings.map((training) => [
      training.user?.nome || 'Colaborador',
      training.nome,
      new Date(training.data_conclusao).toLocaleDateString('pt-BR'),
      new Date(training.data_vencimento).toLocaleDateString('pt-BR'),
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
    <div className="space-y-6">
      <Card tone="elevated" padding="lg">
        <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-2xl">Monitor de Treinamentos</CardTitle>
            <CardDescription>
              Controle validade de NRs, bloqueios operacionais e disparo de alertas automáticos.
            </CardDescription>
          </div>
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
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleNotifyExpiring}
            >
              Notificar vencimentos
            </Button>
            <Link
              href="/dashboard/trainings/new"
              className={cn(
                buttonVariants({ size: 'sm' }),
                'inline-flex items-center',
              )}
            >
              <Plus className="mr-2 h-4 w-4" />
              Registrar treinamento
            </Link>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Treinamentos vencidos</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-danger)]">
              {expirySummary.expired}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Vencendo em breve</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-warning)]">
              {expirySummary.expiringSoon}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card interactive padding="md">
          <CardHeader>
            <CardDescription>Treinamentos válidos</CardDescription>
            <CardTitle className="text-3xl text-[var(--ds-color-success)]">
              {expirySummary.valid}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {blockingUsers.length > 0 ? (
        <Card tone="muted" padding="md" className="border-[color:var(--ds-color-danger)]/25 bg-[color:var(--ds-color-danger)]/10">
          <CardHeader className="gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-[var(--ds-color-danger)]" />
              <CardTitle className="text-base">
                Bloqueio operacional por treinamento pendente
              </CardTitle>
            </div>
            <CardDescription>
              {blockingUsers.length} colaborador(es) estão bloqueados para emissao de PT ate regularizacao.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card tone="default" padding="none">
        <CardHeader className="border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Treinamentos registrados</CardTitle>
            <CardDescription>
              {filteredTrainings.length} resultado(s) exibidos nesta página.
            </CardDescription>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
            <div className="relative min-w-[240px] flex-1 md:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
              <input
                type="text"
                placeholder="Buscar por treinamento ou colaborador"
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
        </CardHeader>

        <CardContent className="mt-0">
          {filteredTrainings.length === 0 ? (
            <div className="p-5">
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
                  <TableHead>Conclusão</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
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
                      {new Date(training.data_conclusao).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2 text-[var(--ds-color-text-secondary)]">
                        <Calendar className="h-4 w-4" />
                        <span>{new Date(training.data_vencimento).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusTone(
                          training.data_vencimento,
                        )}`}
                      >
                        {getStatusLabel(training.data_vencimento)}
                      </span>
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
        </CardContent>

        {filteredTrainings.length > 0 ? (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(lastPage, current + 1))}
          />
        ) : null}
      </Card>

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
    </div>
  );
}
