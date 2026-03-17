'use client';

import { useState, useEffect, useCallback, useMemo, useDeferredValue } from 'react';
import { aprsService, Apr } from '@/services/aprsService';
import { aiService } from '@/services/aiService';
import { signaturesService } from '@/services/signaturesService';
import { generateAprPdf } from '@/lib/pdf/aprGenerator';
import { toast } from 'sonner';
import { handleApiError } from '@/lib/error-handler';
import { openPdfForPrint, openUrlInNewTab } from '@/lib/print-utils';
import { isAiEnabled } from '@/lib/featureFlags';
import {
  base64ToPdfBlob,
  base64ToPdfFile,
  blobToBase64,
} from '@/lib/pdf/pdfFile';

interface Insight {
  type: 'warning' | 'success' | 'info';
  title: string;
  message: string;
  action: string;
}

type AprOverviewMetrics = {
  totalAprs: number;
  aprovadas: number;
  pendentes: number;
  riscosCriticos: number;
  mediaScoreRisco: number;
};

export function useAprs() {
  const [aprs, setAprs] = useState<Apr[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [statusFilter, setStatusFilter] = useState('');
  const [insights, setInsights] = useState<Insight[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  // Estados para o modal de e-mail
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; filename: string; base64: string } | null>(null);

  const getErrorStatus = useCallback((error: unknown) => {
    return (
      Number(
        (error as { response?: { status?: number } } | undefined)?.response
          ?.status ?? 0,
      ) || null
    );
  }, []);

  const buildAprFilename = useCallback(
    (apr: Apr) => `APR_${String(apr.numero || apr.titulo || apr.id).replace(/\s+/g, '_')}.pdf`,
    [],
  );

  const loadAprs = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await aprsService.findPaginated({
        page,
        limit,
        search: deferredSearchTerm || undefined,
        status: statusFilter || undefined,
      });
      setAprs(res.data);
      setTotal(res.total);
      setLastPage(res.lastPage);
    } catch (error) {
      setLoadError('Nao foi possivel carregar a lista de APRs.');
      handleApiError(error, 'APRs');
    } finally {
      setLoading(false);
    }
  }, [page, limit, deferredSearchTerm, statusFilter]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [deferredSearchTerm, statusFilter]);

  const loadInsights = useCallback(async () => {
    if (!isAiEnabled()) return;
    try {
      const result = await aiService.getInsights();
      const aprInsights = result.insights.filter((i: Insight) => 
        i.action.includes('/aprs') || i.title.toLowerCase().includes('apr')
      );
      setInsights(aprInsights);
    } catch (error) {
      console.error('Erro ao carregar insights:', error);
    }
  }, []);

  useEffect(() => {
    loadAprs();
    loadInsights();
  }, [loadAprs, loadInsights]);

  const getStoredPdfAttachment = useCallback(
    async (apr: Apr): Promise<{ base64: string; filename: string } | null> => {
      if (!apr.pdf_file_key) {
        return null;
      }

      const access = await aprsService.getPdfAccess(apr.id);
      if (!access.url) {
        return null;
      }

      const response = await fetch(access.url);
      if (!response.ok) {
        throw new Error('Falha ao baixar o PDF final armazenado da APR.');
      }

      const blob = await response.blob();
      return {
        base64: await blobToBase64(blob),
        filename: access.originalName || buildAprFilename(apr),
      };
    },
    [buildAprFilename],
  );

  const ensureGovernedPdf = useCallback(
    async (apr: Apr) => {
      try {
        return await aprsService.getPdfAccess(apr.id);
      } catch (error) {
        if (getErrorStatus(error) !== 404) {
          throw error;
        }
      }

      if (apr.status !== 'Aprovada') {
        return null;
      }

      const [fullApr, signatures, evidences] = await Promise.all([
        aprsService.findOne(apr.id),
        signaturesService.findByDocument(apr.id, 'APR'),
        aprsService.listAprEvidences(apr.id),
      ]);
      const result = (await generateAprPdf(fullApr, signatures, {
        save: false,
        output: 'base64',
        evidences,
      })) as { base64: string; filename: string } | undefined;

      if (!result?.base64) {
        throw new Error('Falha ao gerar o PDF oficial da APR.');
      }

      const pdfFile = base64ToPdfFile(
        result.base64,
        result.filename || buildAprFilename(fullApr),
      );
      await aprsService.attachFile(apr.id, pdfFile);
      await loadAprs();
      toast.success('PDF final da APR emitido e registrado com sucesso.');
      return aprsService.getPdfAccess(apr.id);
    },
    [buildAprFilename, getErrorStatus, loadAprs],
  );

  const handleDelete = useCallback(async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta APR?')) {
      try {
        await aprsService.delete(id);
        setAprs(prev => prev.filter(a => a.id !== id));
        toast.success('APR excluída com sucesso!');
      } catch (error) {
        handleApiError(error, 'APR');
      }
    }
  }, []);

  const handleDownloadPdf = useCallback(async (id: string) => {
    try {
      const apr = aprs.find((item) => item.id === id) || (await aprsService.findOne(id));
      const shouldUseGovernedPdf = Boolean(apr.pdf_file_key) || apr.status === 'Aprovada';

      if (shouldUseGovernedPdf) {
        const access = await ensureGovernedPdf(apr);
        if (access?.url) {
          openUrlInNewTab(access.url);
          return;
        }

        toast.warning(
          'O PDF final da APR existe, mas a URL segura não está disponível no momento.',
        );
        return;
      }

      toast.info('Gerando PDF...');
      const [fullApr, signatures, evidences] = await Promise.all([
        aprsService.findOne(id),
        signaturesService.findByDocument(id, 'APR'),
        aprsService.listAprEvidences(id),
      ]);
      await generateAprPdf(fullApr, signatures, { evidences });
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      handleApiError(error, 'PDF');
    }
  }, [aprs, ensureGovernedPdf]);

  const handlePrint = useCallback(async (apr: Apr) => {
    try {
      toast.info('Preparando impressão...');
      const currentApr =
        aprs.find((item) => item.id === apr.id) || (await aprsService.findOne(apr.id));
      const shouldUseGovernedPdf =
        Boolean(currentApr.pdf_file_key) || currentApr.status === 'Aprovada';

      if (shouldUseGovernedPdf) {
        const access = await ensureGovernedPdf(currentApr);
        if (access?.url) {
          openPdfForPrint(access.url, () => {
            toast.info(
              'Pop-up bloqueado. Abrimos o PDF final da APR na mesma aba para impressão.',
            );
          });
          return;
        }

        toast.warning(
          'O PDF final da APR foi emitido, mas a URL segura não está disponível agora.',
        );
        return;
      }

      const [fullApr, signatures, evidences] = await Promise.all([
        aprsService.findOne(apr.id),
        signaturesService.findByDocument(apr.id, 'APR'),
        aprsService.listAprEvidences(apr.id),
      ]);
      const result = (await generateAprPdf(fullApr, signatures, {
        save: false,
        output: 'base64',
        evidences,
      })) as { base64: string } | undefined;

      if (result?.base64) {
        const fileURL = URL.createObjectURL(base64ToPdfBlob(result.base64));
        openPdfForPrint(fileURL, () => {
          toast.info('Pop-up bloqueado. Abrimos o PDF na mesma aba para impressão.');
        });
      }
    } catch (error) {
      handleApiError(error, 'Impressão');
    }
  }, [aprs, ensureGovernedPdf]);

  const handleSendEmail = useCallback(async (id: string) => {
    try {
      toast.info('Preparando documento...');
      const apr = aprs.find((item) => item.id === id) || (await aprsService.findOne(id));
      const shouldUseGovernedPdf = Boolean(apr.pdf_file_key) || apr.status === 'Aprovada';

      if (shouldUseGovernedPdf) {
        const access = await ensureGovernedPdf(apr);
        if (!access?.url) {
          toast.warning(
            'O PDF final da APR foi emitido, mas a URL segura não está disponível agora.',
          );
          return;
        }

        const storedAttachment = await getStoredPdfAttachment({
          ...apr,
          pdf_file_key: access.fileKey,
          pdf_folder_path: access.folderPath,
          pdf_original_name: access.originalName,
        });
        if (storedAttachment) {
          setSelectedDoc({
            name: apr.titulo,
            filename: storedAttachment.filename,
            base64: storedAttachment.base64,
          });
          setIsMailModalOpen(true);
          return;
        }
      }

      const [fullApr, signatures, evidences] = await Promise.all([
        aprsService.findOne(id),
        signaturesService.findByDocument(id, 'APR'),
        aprsService.listAprEvidences(id),
      ]);
      const result = (await generateAprPdf(fullApr, signatures, {
        save: false,
        output: 'base64',
        evidences,
      })) as { filename: string; base64: string } | undefined;

      if (result?.base64) {
        setSelectedDoc({
          name: apr.titulo,
          filename: result.filename,
          base64: result.base64,
        });
        setIsMailModalOpen(true);
      }
    } catch (error) {
      handleApiError(error, 'Email');
    }
  }, [aprs, ensureGovernedPdf, getStoredPdfAttachment]);

  // Filtering is now server-side — aprs already contains the filtered page
  const filteredAprs = aprs;

  const overviewMetrics: AprOverviewMetrics | null = useMemo(() => {
    const list = filteredAprs;
    if (!list) return null;

    const totalAprs = total;
    const aprovadas = list.filter((a) => a.status === 'Aprovada').length;
    const pendentes = list.filter((a) => a.status === 'Pendente').length;
    const riscosCriticos = list.filter((a) => (a.classificacao_resumo?.critico || 0) > 0).length;

    let scoreSum = 0;
    let scoreCount = 0;
    list.forEach((a) => {
      (a.risk_items || []).forEach((ri) => {
        if (typeof ri.score_risco === 'number') {
          scoreSum += ri.score_risco;
          scoreCount += 1;
        }
      });
    });

    const mediaScoreRisco = scoreCount > 0 ? scoreSum / scoreCount : 0;
    return { totalAprs, aprovadas, pendentes, riscosCriticos, mediaScoreRisco };
  }, [filteredAprs, total]);

  const handleFinalize = useCallback(async (id: string) => {
    if (!confirm('Deseja aprovar esta APR?')) return;
    try {
      const updated = await aprsService.approve(id);
      setAprs((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast.success('APR aprovada com sucesso!');
    } catch (error) {
      handleApiError(error, 'APR');
    }
  }, []);

  const handleReject = useCallback(async (id: string) => {
    const reason = prompt('Motivo da reprovação:');
    if (!reason) return;
    try {
      const updated = await aprsService.reject(id, reason);
      setAprs((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast.success('APR reprovada.');
    } catch (error) {
      handleApiError(error, 'APR');
    }
  }, []);

  const handleCreateNewVersion = useCallback(async (id: string) => {
    if (!confirm('Criar uma nova versão desta APR?')) return;
    try {
      await aprsService.createNewVersion(id);
      toast.success('Nova versão criada.');
      await loadAprs();
    } catch (error) {
      handleApiError(error, 'APR');
    }
  }, [loadAprs]);

  return {
    aprs,
    loading,
    loadError,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    insights,
    overviewMetrics,
    page,
    setPage,
    limit,
    total,
    lastPage,
    isMailModalOpen,
    setIsMailModalOpen,
    selectedDoc,
    setSelectedDoc,
    filteredAprs,
    handleDelete,
    handleDownloadPdf,
    handlePrint,
    handleSendEmail,
    handleFinalize,
    handleReject,
    handleCreateNewVersion,
    loadAprs,
  };
}
