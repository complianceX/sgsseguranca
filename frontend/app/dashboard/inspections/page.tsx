'use client';

import { useState, useEffect, useCallback, useDeferredValue, useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Bot,
  ClipboardList,
  Download,
  Edit,
  Mail,
  Plus,
  Printer,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { inspectionsService, Inspection } from '@/services/inspectionsService';
import { generateInspectionPdf } from '@/lib/pdf/inspectionGenerator';
import { SendMailModal } from '@/components/SendMailModal';
import { openPdfForPrint } from '@/lib/print-utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState, ErrorState, PageLoadingState } from '@/components/ui/state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PaginationControls } from '@/components/PaginationControls';
import { ListPageLayout } from '@/components/layout';
import { cn } from '@/lib/utils';

const inputClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';

export default function InspectionsPage() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{
    name: string;
    filename: string;
    base64: string;
  } | null>(null);

  const fetchInspections = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await inspectionsService.findPaginated({
        page,
        limit: 10,
        search: deferredSearchTerm || undefined,
      });
      setInspections(response.data);
      setTotal(response.total);
      setLastPage(response.lastPage);
    } catch (error) {
      console.error('Erro ao carregar inspeções:', error);
      setLoadError('Nao foi possivel carregar os relatorios de inspecao.');
      toast.error('Erro ao carregar inspeções');
    } finally {
      setLoading(false);
    }
  }, [deferredSearchTerm, page]);

  useEffect(() => {
    void fetchInspections();
  }, [fetchInspections]);

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este relatório de inspeção?')) return;

    try {
      await inspectionsService.remove(id);
      toast.success('Inspeção excluída com sucesso');
      if (inspections.length === 1 && page > 1) {
        setPage((current) => current - 1);
        return;
      }
      await fetchInspections();
    } catch (error) {
      console.error('Erro ao excluir inspeção:', error);
      toast.error('Erro ao excluir inspeção');
    }
  };

  const handleDownloadPdf = async (inspection: Inspection) => {
    try {
      toast.info('Gerando PDF...');
      const fullInspection = await inspectionsService.findOne(inspection.id);
      await generateInspectionPdf(fullInspection);
      toast.success('PDF gerado com sucesso');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar PDF da inspeção.');
    }
  };

  const handlePrint = async (inspection: Inspection) => {
    try {
      toast.info('Preparando impressão...');
      const fullInspection = await inspectionsService.findOne(inspection.id);
      const result = (await generateInspectionPdf(fullInspection, {
        save: false,
        output: 'base64',
      })) as { base64: string } | undefined;

      if (result?.base64) {
        const byteCharacters = atob(result.base64);
        const byteNumbers = new Array(byteCharacters.length);

        for (let index = 0; index < byteCharacters.length; index += 1) {
          byteNumbers[index] = byteCharacters.charCodeAt(index);
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
      toast.error('Erro ao preparar impressão da inspeção.');
    }
  };

  const handleSendEmail = async (inspection: Inspection) => {
    try {
      toast.info('Preparando documento...');
      const fullInspection = await inspectionsService.findOne(inspection.id);
      const result = (await generateInspectionPdf(fullInspection, {
        save: false,
        output: 'base64',
      })) as { filename: string; base64: string } | undefined;

      if (result?.base64) {
        setSelectedDoc({
          name: `${inspection.tipo_inspecao} - ${inspection.setor_area}`,
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

  const summary = useMemo(() => {
    const typeCount = new Set(inspections.map((item) => item.tipo_inspecao).filter(Boolean)).size;
    const siteCount = new Set(inspections.map((item) => item.site?.id).filter(Boolean)).size;
    const withActionPlan = inspections.filter((item) => (item.plano_acao?.length || 0) > 0).length;
    const withRisks = inspections.filter((item) => (item.perigos_riscos?.length || 0) > 0).length;

    return {
      total,
      tipos: typeCount,
      sites: siteCount,
      comPlano: withActionPlan,
      comRiscos: withRisks,
    };
  }, [inspections, total]);

  if (loading) {
    return (
      <PageLoadingState
        title="Carregando inspeções"
        description="Buscando relatórios, responsáveis, riscos e planos de ação."
        cards={4}
        tableRows={6}
      />
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Falha ao carregar inspeções"
        description={loadError}
        action={
          <Button type="button" onClick={fetchInspections}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return (
    <>
      <ListPageLayout
        eyebrow="Inspeção e rastreio"
        title="Relatórios de inspeção"
        description="Gerencie inspeções de segurança, riscos observados e ações recomendadas por área."
        icon={<ClipboardList className="h-5 w-5" />}
        actions={
          <Link href="/dashboard/inspections/new" className={cn(buttonVariants(), 'inline-flex items-center')}>
            <Plus className="mr-2 h-4 w-4" />
            Novo relatório
          </Link>
        }
        metrics={[
          {
            label: 'Total de inspeções',
            value: summary.total,
            note: 'Volume total carregado no recorte atual.',
          },
          {
            label: 'Tipos na página',
            value: summary.tipos,
            note: 'Cobertura de modalidades no recorte exibido.',
            tone: 'primary',
          },
          {
            label: 'Com plano na página',
            value: summary.comPlano,
            note: 'Inspeções com tratativa já registrada.',
            tone: 'warning',
          },
          {
            label: 'Sites na página',
            value: summary.sites,
            note: 'Frentes de trabalho cobertas nesta amostra.',
            tone: 'success',
          },
        ]}
        toolbarTitle="Base de inspeções"
        toolbarDescription={`${total} relatório(s) encontrados com busca por setor, tipo, site e responsável.`}
        toolbarContent={
          <div className="ds-list-search ds-list-search--wide">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-muted)]" />
            <input
              type="text"
              placeholder="Buscar por setor, tipo, site ou responsável"
              aria-label="Buscar inspeções por setor, tipo, site ou responsável"
              className={cn(inputClassName, 'pl-10')}
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPage(1);
              }}
            />
          </div>
        }
        footer={
          !loading && total > 0 ? (
            <PaginationControls
              page={page}
              lastPage={lastPage}
              total={total}
              onPrev={() => setPage((current) => Math.max(1, current - 1))}
              onNext={() => setPage((current) => Math.min(lastPage, current + 1))}
            />
          ) : null
        }
      >
        <div className="space-y-4 p-0">
          {summary.comRiscos > 0 ? (
            <div className="mx-4 mt-4 rounded-[var(--ds-radius-lg)] border border-[color:var(--ds-color-warning)]/20 bg-[color:var(--ds-color-warning-subtle)]/70 px-4 py-3">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 text-[var(--ds-color-warning)]" />
                <div>
                  <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">Foco operacional</p>
                  <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
                    Nesta página, {summary.comRiscos} inspeção(ões) possuem perigos/riscos registrados. Revise planos de ação e responsáveis para acelerar tratativas.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {inspections.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Nenhum relatório de inspeção encontrado"
                description={
                  deferredSearchTerm
                    ? 'Nenhum resultado corresponde ao filtro aplicado.'
                    : 'Ainda não existem inspeções registradas para este tenant.'
                }
                action={
                  !deferredSearchTerm ? (
                    <Link href="/dashboard/inspections/new" className={cn(buttonVariants(), 'inline-flex items-center')}>
                      <Plus className="mr-2 h-4 w-4" />
                      Novo relatório
                    </Link>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Setor / Área</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Site / Unidade</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspections.map((inspection) => (
                  <TableRow key={inspection.id}>
                    <TableCell className="font-medium text-[var(--ds-color-text-primary)]">{inspection.setor_area}</TableCell>
                    <TableCell>
                      <span className="ds-badge ds-badge--primary">{inspection.tipo_inspecao}</span>
                    </TableCell>
                    <TableCell className="text-[var(--ds-color-text-secondary)]">{inspection.site?.nome || '—'}</TableCell>
                    <TableCell>{format(new Date(inspection.data_inspecao), 'dd/MM/yyyy', { locale: ptBR })}</TableCell>
                    <TableCell className="text-[var(--ds-color-text-secondary)]">{inspection.responsavel?.nome || '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/dashboard/sst-agent?${new URLSearchParams({
                            documentType: 'nc',
                            source_type: 'inspection',
                            source_reference: inspection.id,
                            title: `NC de inspeção - ${inspection.setor_area}`,
                            description:
                              inspection.descricao_local_atividades ||
                              `Inspeção ${inspection.tipo_inspecao} em ${inspection.setor_area}.`,
                            site_id: inspection.site_id || '',
                            source_context: `Inspeção ${inspection.tipo_inspecao} realizada em ${format(new Date(inspection.data_inspecao), 'dd/MM/yyyy', { locale: ptBR })} no setor ${inspection.setor_area}.`,
                          }).toString()}`}
                          className={buttonVariants({ size: 'icon', variant: 'ghost' })}
                          title="Abrir NC com SOPHIE"
                          aria-label={`Abrir não conformidade com SOPHIE para inspeção ${inspection.setor_area}`}
                        >
                          <Bot className="h-4 w-4 text-[var(--ds-color-warning)]" />
                        </Link>
                        <Button type="button" size="icon" variant="ghost" onClick={() => handlePrint(inspection)} title="Imprimir">
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" onClick={() => handleSendEmail(inspection)} title="Enviar por e-mail">
                          <Mail className="h-4 w-4" />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" onClick={() => handleDownloadPdf(inspection)} title="Baixar PDF">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Link href={`/dashboard/inspections/edit/${inspection.id}`} className={buttonVariants({ size: 'icon', variant: 'ghost' })} title="Editar">
                          <Edit className="h-4 w-4" />
                        </Link>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(inspection.id)}
                          title="Excluir"
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
