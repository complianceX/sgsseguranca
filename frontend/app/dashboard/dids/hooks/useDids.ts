'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  DID_ALLOWED_TRANSITIONS,
  DID_STATUS_LABEL,
  didsService,
  type Did,
  type DidStatus,
} from '@/services/didsService';
import { generateDidPdf } from '@/lib/pdf/didGenerator';
import { base64ToPdfBlob, base64ToPdfFile } from '@/lib/pdf/pdfFile';
import { openPdfForPrint, openUrlInNewTab } from '@/lib/print-utils';
import { buildPdfFilename } from '@/lib/pdf-system/core/format';
import { getFormErrorMessage } from '@/lib/error-handler';
import { safeFormatDate } from '@/lib/date/safeFormat';

type UseDidsOptions = {
  canManageDids: boolean;
};

export function useDids({ canManageDids }: UseDidsOptions) {
  const [dids, setDids] = useState<Did[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [statusFilter, setStatusFilter] = useState<'all' | DidStatus>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [busyDidId, setBusyDidId] = useState<string | null>(null);

  const loadDids = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await didsService.findPaginated({
        page,
        limit: 10,
        search: deferredSearchTerm || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      setDids(response.data);
      setTotal(response.total);
      setLastPage(response.lastPage);
    } catch (error) {
      setLoadError('Não foi possível carregar a lista do Início do Dia.');
      toast.error('Erro ao carregar Diálogos do Início do Dia.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [deferredSearchTerm, page, statusFilter]);

  useEffect(() => {
    void loadDids();
  }, [loadDids]);

  useEffect(() => {
    setPage(1);
  }, [deferredSearchTerm, statusFilter]);

  const summary = useMemo(
    () => ({
      total,
      alinhados: dids.filter((item) => item.status === 'alinhado').length,
      executados: dids.filter((item) => item.status === 'executado').length,
      pdfs: dids.filter((item) => Boolean(item.pdf_file_key)).length,
    }),
    [dids, total],
  );

  const getAllowedStatusTransitions = useCallback((did: Did): DidStatus[] => {
    if (did.pdf_file_key) {
      return [];
    }
    return DID_ALLOWED_TRANSITIONS[did.status] || [];
  }, []);

  const buildDidFilename = useCallback(
    (did: Did) => buildPdfFilename('DID', did.titulo || 'did', did.data),
    [],
  );

  const buildDidForFinalPdf = useCallback(
    (did: Did): Did => ({
      ...did,
      status:
        did.status === 'arquivado'
          ? 'arquivado'
          : did.status === 'rascunho'
            ? 'alinhado'
            : 'executado',
    }),
    [],
  );

  const generateLocalDidPdfBase64 = useCallback(
    async (
      did: Did,
      options?: { draftWatermark?: boolean; finalMode?: boolean },
    ) => {
      const freshDid = await didsService.findOne(did.id);
      const didForPdf = options?.finalMode
        ? buildDidForFinalPdf(freshDid)
        : freshDid;
      const base64 = await generateDidPdf(didForPdf, {
        save: false,
        output: 'base64',
        draftWatermark: options?.draftWatermark ?? false,
      });

      if (!base64) {
        throw new Error('Falha ao gerar o PDF do Início do Dia.');
      }

      return String(base64);
    },
    [buildDidForFinalPdf],
  );

  const ensureGovernedPdf = useCallback(
    async (did: Did) => {
      const existingAccess = await didsService.getPdfAccess(did.id);
      if (existingAccess.hasFinalPdf) {
        return existingAccess;
      }

      if (!canManageDids) {
        throw new Error(
          'Você não tem permissão para emitir o PDF final deste documento.',
        );
      }

      const base64 = await generateLocalDidPdfBase64(did, {
        draftWatermark: false,
        finalMode: true,
      });
      const file = base64ToPdfFile(base64, buildDidFilename(did));
      const attachResult = await didsService.attachFile(did.id, file);
      await loadDids();

      if (attachResult.degraded) {
        toast.warning(attachResult.message);
      } else {
        toast.success(attachResult.message);
      }

      return didsService.getPdfAccess(did.id);
    },
    [buildDidFilename, canManageDids, generateLocalDidPdfBase64, loadDids],
  );

  const handleOpenGovernedPdf = useCallback(
    async (did: Did) => {
      try {
        setBusyDidId(did.id);
        const access = await ensureGovernedPdf(did);
        if (access.availability !== 'ready' || !access.url) {
          toast.warning(access.message || 'PDF final indisponível no momento.');
          return;
        }

        openUrlInNewTab(access.url);
      } catch (error) {
        console.error(error);
        toast.error(
          getFormErrorMessage(error, {
            fallback:
              'Não foi possível emitir ou abrir o PDF final do documento.',
          }),
        );
      } finally {
        setBusyDidId(null);
      }
    },
    [ensureGovernedPdf],
  );

  const handlePrint = useCallback(
    async (did: Did) => {
      try {
        setBusyDidId(did.id);
        if (canManageDids) {
          const access = await ensureGovernedPdf(did);
          if (access.availability !== 'ready' || !access.url) {
            toast.warning(access.message || 'PDF final indisponível no momento.');
            return;
          }

          openPdfForPrint(access.url, () => {
            toast.info('Pop-up bloqueado. O PDF foi aberto na mesma aba.');
          });
          return;
        }

        if (did.pdf_file_key) {
          const access = await didsService.getPdfAccess(did.id);
          if (access.availability === 'ready' && access.url) {
            openPdfForPrint(access.url, () => {
              toast.info('Pop-up bloqueado. O PDF foi aberto na mesma aba.');
            });
            return;
          }
        }

        const base64 = await generateLocalDidPdfBase64(did, {
          draftWatermark: true,
        });
        const fileUrl = URL.createObjectURL(base64ToPdfBlob(base64));
        openPdfForPrint(fileUrl, () => {
          toast.info('Pop-up bloqueado. O PDF foi aberto na mesma aba.');
        });
        setTimeout(() => URL.revokeObjectURL(fileUrl), 60_000);
      } catch (error) {
        console.error(error);
        toast.error('Não foi possível gerar o PDF para impressão.');
      } finally {
        setBusyDidId(null);
      }
    },
    [canManageDids, ensureGovernedPdf, generateLocalDidPdfBase64],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!canManageDids) {
        toast.error('Você não tem permissão para excluir este documento.');
        return;
      }

      if (!window.confirm('Tem certeza que deseja excluir este registro?')) {
        return;
      }

      try {
        setBusyDidId(id);
        await didsService.delete(id);
        toast.success('Registro excluído com sucesso.');
        if (dids.length === 1 && page > 1) {
          setPage((current) => current - 1);
          return;
        }
        await loadDids();
      } catch (error) {
        console.error(error);
        toast.error('Não foi possível excluir o registro.');
      } finally {
        setBusyDidId(null);
      }
    },
    [canManageDids, dids.length, loadDids, page],
  );

  const handleStatusChange = useCallback(
    async (did: Did, nextStatus: DidStatus) => {
      if (!canManageDids) {
        toast.error('Você não tem permissão para alterar o status.');
        return;
      }

      try {
        setBusyDidId(did.id);
        const updated = await didsService.updateStatus(did.id, nextStatus);
        setDids((current) =>
          current.map((item) =>
            item.id === did.id ? { ...item, status: updated.status } : item,
          ),
        );
        toast.success(
          `Status atualizado para "${DID_STATUS_LABEL[updated.status]}".`,
        );
      } catch (error) {
        console.error(error);
        toast.error('Não foi possível atualizar o status.');
      } finally {
        setBusyDidId(null);
      }
    },
    [canManageDids],
  );

  const formattedToolbarDescription = useMemo(
    () => `${total} documento(s) encontrados com filtros por título e status.`,
    [total],
  );

  const createdAtLabel = useCallback(
    (did: Did) =>
      did.created_at
        ? `Criado em ${safeFormatDate(did.created_at, 'dd/MM/yyyy', {
            locale: ptBR,
          })}`
        : 'Sem data de criação',
    [],
  );

  return {
    dids,
    loading,
    loadError,
    searchTerm,
    setSearchTerm,
    deferredSearchTerm,
    statusFilter,
    setStatusFilter,
    page,
    setPage,
    total,
    lastPage,
    summary,
    busyDidId,
    loadDids,
    handleDelete,
    handlePrint,
    handleOpenGovernedPdf,
    handleStatusChange,
    getAllowedStatusTransitions,
    formattedToolbarDescription,
    createdAtLabel,
  };
}
