'use client';

import { useState, useEffect, useCallback, useDeferredValue } from 'react';
import {
  getPtApprovalBlockedPayload,
  Pt,
  PtApprovalBlockedPayload,
  PtApprovalRules,
  ptsService,
} from '@/services/ptsService';
import { aiService } from '@/services/aiService';
import { signaturesService } from '@/services/signaturesService';
import { usersService } from '@/services/usersService';
import { generatePtPdf } from '@/lib/pdf/ptGenerator';
import { toast } from 'sonner';
import { handleApiError } from '@/lib/error-handler';
import {
  openPdfForPrint,
  openUrlInNewTab,
} from '@/lib/print-utils';
import { isAiEnabled } from '@/lib/featureFlags';
import {
  base64ToPdfBlob,
  base64ToPdfFile,
  blobToBase64,
} from '@/lib/pdf/pdfFile';
import type {
  PtApprovalChecklistState,
  PtApprovalReview,
  PtApprovalWorkerReview,
} from '../components/PtApprovalReviewPanel';

interface Insight {
  type: 'warning' | 'success' | 'info';
  title: string;
  message: string;
  action: string;
}

function summarizeChecklistAnswers<T extends { resposta?: string }>(items: T[]) {
  return items.reduce(
    (acc, item) => {
      if (!item.resposta) {
        acc.unanswered += 1;
      } else if (item.resposta === 'Não' || item.resposta === 'Não aplicável') {
        acc.adverse += 1;
      }
      return acc;
    },
    { unanswered: 0, adverse: 0 },
  );
}

function createEmptyApprovalChecklist(): PtApprovalChecklistState {
  return {
    reviewedReadiness: false,
    reviewedWorkers: false,
    confirmedRelease: false,
  };
}

function buildPreApprovalAuditPayload(
  review: PtApprovalReview,
  stage: 'preview' | 'approval_requested',
  checklist?: PtApprovalChecklistState,
) {
  return {
    stage,
    readyForRelease: review.readyForRelease,
    blockers: review.blockers,
    unansweredChecklistItems: review.unansweredChecklistItems,
    adverseChecklistItems: review.adverseChecklistItems,
    pendingSignatures: review.pendingSignatures,
    hasRapidRiskBlocker: review.hasRapidRiskBlocker,
    workerStatuses: review.workerStatuses,
    warnings: review.warnings,
    rules: review.rules || undefined,
    checklist,
  };
}

export function usePts() {
  const [pts, setPts] = useState<Pt[]>([]);
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
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [approvalIssuesById, setApprovalIssuesById] = useState<
    Record<string, PtApprovalBlockedPayload>
  >({});
  const [approvalRules, setApprovalRules] = useState<PtApprovalRules | null>(
    null,
  );
  const [approvalRulesLoading, setApprovalRulesLoading] = useState(true);
  const [approvalReviewLoadingId, setApprovalReviewLoadingId] = useState<
    string | null
  >(null);
  const [approvalReviewById, setApprovalReviewById] = useState<
    Record<string, PtApprovalReview>
  >({});
  const [approvalChecklistById, setApprovalChecklistById] = useState<
    Record<string, PtApprovalChecklistState>
  >({});

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

  const buildPtFilename = useCallback(
    (pt: Pt) => `PT_${String(pt.numero || pt.titulo || pt.id).replace(/\s+/g, '_')}.pdf`,
    [],
  );

  const loadPts = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await ptsService.findPaginated({
        page,
        limit,
        search: deferredSearchTerm || undefined,
        status: statusFilter || undefined,
      });
      setPts(res.data);
      setTotal(res.total);
      setLastPage(res.lastPage);
    } catch (error) {
      setLoadError('Nao foi possivel carregar a lista de PTs.');
      handleApiError(error, 'PTs');
    } finally {
      setLoading(false);
    }
  }, [page, limit, deferredSearchTerm, statusFilter]);

  const loadInsights = useCallback(async () => {
    if (!isAiEnabled()) return;
    try {
      const result = await aiService.getInsights();
      const ptInsights = result.insights.filter((i: Insight) => 
        i.action.includes('/pts') || i.title.toLowerCase().includes('pt') || i.title.toLowerCase().includes('risco')
      );
      setInsights(ptInsights);
    } catch (error) {
      console.error('Erro ao carregar insights:', error);
    }
  }, []);

  const loadApprovalRules = useCallback(async () => {
    try {
      setApprovalRulesLoading(true);
      const rules = await ptsService.getApprovalRules();
      setApprovalRules(rules);
    } catch (error) {
      console.error('Erro ao carregar regras de aprovação da PT:', error);
      setApprovalRules(null);
    } finally {
      setApprovalRulesLoading(false);
    }
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [deferredSearchTerm, statusFilter]);

  useEffect(() => {
    loadPts();
    loadInsights();
    loadApprovalRules();
  }, [loadApprovalRules, loadInsights, loadPts]);

  const handleDelete = useCallback(async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta PT?')) {
      try {
        await ptsService.delete(id);
        setPts(prev => prev.filter(p => p.id !== id));
        toast.success('PT excluída com sucesso!');
      } catch (error) {
        handleApiError(error, 'PTs');
      }
    }
  }, []);

  const dismissApprovalIssue = useCallback((id: string) => {
    setApprovalIssuesById((current) => {
      if (!current[id]) {
        return current;
      }

      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const dismissApprovalReview = useCallback((id: string) => {
    setApprovalReviewById((current) => {
      if (!current[id]) {
        return current;
      }

      const next = { ...current };
      delete next[id];
      return next;
    });

    setApprovalChecklistById((current) => {
      if (!current[id]) {
        return current;
      }

      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const updateApprovalChecklist = useCallback(
    (
      id: string,
      key: keyof PtApprovalChecklistState,
      checked: boolean,
    ) => {
      setApprovalChecklistById((current) => ({
        ...current,
        [id]: {
          ...(current[id] || createEmptyApprovalChecklist()),
          [key]: checked,
        },
      }));
    },
    [],
  );

  const buildWorkerReview = useCallback(
    async (pt: Pt): Promise<{ workers: PtApprovalWorkerReview[]; warnings: string[] }> => {
      const team = [
        pt.responsavel_id
          ? {
              id: pt.responsavel_id,
              nome: pt.responsavel?.nome || 'Responsável da PT',
              roleLabel: 'Responsável',
            }
          : null,
        ...(Array.isArray(pt.executantes)
          ? pt.executantes.map((executante) => ({
              id: executante.id,
              nome: executante.nome,
              roleLabel: 'Executante',
            }))
          : []),
      ].filter(
        (
          member,
        ): member is { id: string; nome: string; roleLabel: string } =>
          Boolean(member?.id),
      );

      const uniqueTeam = Array.from(
        new Map(team.map((member) => [member.id, member])).values(),
      );

      if (uniqueTeam.length === 0) {
        return { workers: [], warnings: [] };
      }

      const timelineResults = await Promise.allSettled(
        uniqueTeam.map(async (member) => ({
          member,
          timeline: await usersService.getWorkerTimelineById(member.id),
        })),
      );

      const warnings: string[] = [];
      const workers = timelineResults.map((result, index) => {
        const fallback = uniqueTeam[index];

        if (result.status === 'fulfilled') {
          return {
            userId: result.value.member.id,
            nome: result.value.member.nome,
            roleLabel: result.value.member.roleLabel,
            blocked: result.value.timeline.status.blocked,
            reasons: result.value.timeline.status.reasons,
          } satisfies PtApprovalWorkerReview;
        }

        warnings.push(
          `Não foi possível validar a prontidão operacional de ${fallback.nome} na pré-liberação.`,
        );
        return {
          userId: fallback.id,
          nome: fallback.nome,
          roleLabel: fallback.roleLabel,
          blocked: false,
          reasons: ['Validação operacional indisponível nesta leitura.'],
          unavailable: true,
        } satisfies PtApprovalWorkerReview;
      });

      return { workers, warnings };
    },
    [],
  );

  const buildApprovalReview = useCallback(
    async (pt: Pt): Promise<PtApprovalReview> => {
      const signatures = await signaturesService.findByDocument(pt.id, 'PT');
      const { workers, warnings } = await buildWorkerReview(pt);

      const generalChecklist = pt.recomendacoes_gerais_checklist ?? [];
      const workAtHeightChecklist = pt.trabalho_altura_checklist ?? [];
      const workElectricChecklist = pt.trabalho_eletrico_checklist ?? [];
      const workHotChecklist = pt.trabalho_quente_checklist ?? [];
      const workConfinedChecklist = pt.trabalho_espaco_confinado_checklist ?? [];
      const workExcavationChecklist = pt.trabalho_escavacao_checklist ?? [];
      const rapidRiskChecklist = pt.analise_risco_rapida_checklist ?? [];
      const selectedRiskTypes = [
        pt.trabalho_altura && 'Altura',
        pt.eletricidade && 'Eletricidade',
        pt.trabalho_quente && 'Trabalho a quente',
        pt.espaco_confinado && 'Espaço confinado',
        pt.escavacao && 'Escavação',
      ].filter(Boolean) as string[];
      const selectedExecutanteIds = Array.isArray(pt.executantes)
        ? pt.executantes
            .map((executante) => executante.id)
            .filter((userId): userId is string => Boolean(userId))
        : [];
      const signedExecutanteIds = new Set(
        signatures
          .map((signature) => signature.user_id)
          .filter((userId): userId is string => Boolean(userId))
          .filter((userId) => selectedExecutanteIds.includes(userId)),
      );
      const pendingSignatures = Math.max(
        0,
        selectedExecutanteIds.length - signedExecutanteIds.size,
      );

      const generalChecklistSummary = summarizeChecklistAnswers(generalChecklist);
      const workAtHeightSummary = summarizeChecklistAnswers(workAtHeightChecklist);
      const workElectricSummary = summarizeChecklistAnswers(workElectricChecklist);
      const workHotSummary = summarizeChecklistAnswers(workHotChecklist);
      const workConfinedSummary = summarizeChecklistAnswers(workConfinedChecklist);
      const workExcavationSummary =
        summarizeChecklistAnswers(workExcavationChecklist);

      const unansweredChecklistItems =
        generalChecklistSummary.unanswered +
        (pt.trabalho_altura ? workAtHeightSummary.unanswered : 0) +
        (pt.eletricidade ? workElectricSummary.unanswered : 0) +
        (pt.trabalho_quente ? workHotSummary.unanswered : 0) +
        (pt.espaco_confinado ? workConfinedSummary.unanswered : 0) +
        (pt.escavacao ? workExcavationSummary.unanswered : 0);

      const adverseChecklistItems =
        generalChecklistSummary.adverse +
        (pt.trabalho_altura ? workAtHeightSummary.adverse : 0) +
        (pt.eletricidade ? workElectricSummary.adverse : 0) +
        (pt.trabalho_quente ? workHotSummary.adverse : 0) +
        (pt.espaco_confinado ? workConfinedSummary.adverse : 0) +
        (pt.escavacao ? workExcavationSummary.adverse : 0);

      const hasRapidRiskBlocker = rapidRiskChecklist.some(
        (item) => item.secao === 'basica' && item.resposta === 'Não',
      );

      const blockers: string[] = [];

      if (!pt.company_id) blockers.push('Selecionar a empresa da PT.');
      if (!pt.site_id) blockers.push('Selecionar a obra/site da PT.');
      if (!pt.responsavel_id) blockers.push('Definir o responsável pela liberação.');
      if (!String(pt.titulo || '').trim()) blockers.push('Informar um título claro da atividade.');
      if (selectedRiskTypes.length === 0) {
        blockers.push(
          'Marcar pelo menos um tipo de trabalho crítico ou confirmar que a PT é geral.',
        );
      }
      if (
        hasRapidRiskBlocker &&
        !String(pt.analise_risco_rapida_observacoes || '').trim()
      ) {
        blockers.push('Registrar ações corretivas na análise de risco rápida.');
      }
      if (unansweredChecklistItems > 0) {
        blockers.push(
          `${unansweredChecklistItems} item(ns) de checklist ainda sem resposta.`,
        );
      }
      if (selectedExecutanteIds.length === 0) {
        blockers.push('Selecionar ao menos um executante.');
      }
      if (pendingSignatures > 0) {
        blockers.push(`${pendingSignatures} assinatura(s) ainda pendente(s).`);
      }

      workers
        .filter((worker) => worker.blocked)
        .forEach((worker) => {
          worker.reasons.forEach((reason) =>
            blockers.push(`${worker.roleLabel} ${worker.nome}: ${reason}`),
          );
        });

      return {
        readyForRelease: blockers.length === 0,
        blockers,
        unansweredChecklistItems,
        adverseChecklistItems,
        pendingSignatures,
        hasRapidRiskBlocker,
        workerStatuses: workers,
        warnings,
        rules: approvalRules,
      };
    },
    [approvalRules, buildWorkerReview],
  );

  const handlePrepareApproval = useCallback(
    async (id: string) => {
      setApprovalReviewLoadingId(id);
      dismissApprovalIssue(id);

      try {
        const pt = await ptsService.findOne(id);
        const review = await buildApprovalReview(pt);

        setApprovalReviewById((current) => ({
          ...current,
          [id]: review,
        }));
        setApprovalChecklistById((current) => ({
          ...current,
          [id]: current[id] || createEmptyApprovalChecklist(),
        }));

        try {
          await ptsService.logPreApprovalReview(
            id,
            buildPreApprovalAuditPayload(review, 'preview'),
          );
        } catch (auditError) {
          console.error('Erro ao registrar pré-liberação da PT:', auditError);
          toast.warning(
            'A pré-liberação foi aberta, mas o registro auditável não pôde ser salvo agora.',
          );
        }
      } catch (error) {
        handleApiError(error, 'Pré-liberação da PT');
      } finally {
        setApprovalReviewLoadingId((current) => (current === id ? null : current));
      }
    },
    [buildApprovalReview, dismissApprovalIssue],
  );

  const getStoredPdfAttachment = useCallback(
    async (pt: Pt): Promise<{ base64: string; filename: string } | null> => {
      if (!pt.pdf_file_key) {
        return null;
      }

      const access = await ptsService.getPdfAccess(pt.id);
      if (!access.url) {
        return null;
      }

      const response = await fetch(access.url);
      if (!response.ok) {
        throw new Error('Falha ao baixar o PDF final armazenado da PT.');
      }

      const blob = await response.blob();
      return {
        base64: await blobToBase64(blob),
        filename: access.originalName || buildPtFilename(pt),
      };
    },
    [buildPtFilename],
  );

  const ensureGovernedPdf = useCallback(
    async (pt: Pt) => {
      try {
        return await ptsService.getPdfAccess(pt.id);
      } catch (error) {
        if (getErrorStatus(error) !== 404) {
          throw error;
        }
      }

      if (pt.status !== 'Aprovada') {
        return null;
      }

      const [fullPt, signatures] = await Promise.all([
        ptsService.findOne(pt.id),
        signaturesService.findByDocument(pt.id, 'PT'),
      ]);
      const result = (await generatePtPdf(fullPt, signatures, {
        save: false,
        output: 'base64',
      })) as { base64: string; filename: string } | undefined;

      if (!result?.base64) {
        throw new Error('Falha ao gerar o PDF oficial da PT.');
      }

      const pdfFile = base64ToPdfFile(
        result.base64,
        result.filename || buildPtFilename(fullPt),
      );
      await ptsService.attachFile(pt.id, pdfFile);
      await loadPts();
      toast.success('PDF final da PT emitido e registrado com sucesso.');
      return ptsService.getPdfAccess(pt.id);
    },
    [buildPtFilename, getErrorStatus, loadPts],
  );

  const handleDownloadPdf = useCallback(async (id: string) => {
    try {
      const pt = pts.find((item) => item.id === id) || (await ptsService.findOne(id));
      const shouldUseGovernedPdf = Boolean(pt.pdf_file_key) || pt.status === 'Aprovada';

      if (shouldUseGovernedPdf) {
        const access = await ensureGovernedPdf(pt);
        if (access?.url) {
          openUrlInNewTab(access.url);
          return;
        }

        toast.warning(
          'O PDF final da PT existe, mas a URL segura não está disponível no momento.',
        );
        return;
      }

      toast.info('Gerando PDF...');
      const signatures = await signaturesService.findByDocument(id, 'PT');
      await generatePtPdf(pt, signatures);
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      handleApiError(error, 'PDF');
    }
  }, [ensureGovernedPdf, pts]);

  const handleSendEmail = useCallback(async (id: string) => {
    try {
      toast.info('Preparando documento...');
      const pt = pts.find((item) => item.id === id) || (await ptsService.findOne(id));
      const shouldUseGovernedPdf = Boolean(pt.pdf_file_key) || pt.status === 'Aprovada';

      if (shouldUseGovernedPdf) {
        const access = await ensureGovernedPdf(pt);
        if (!access?.url) {
          toast.warning(
            'O PDF final da PT foi emitido, mas a URL segura não está disponível agora.',
          );
          return;
        }

        const storedAttachment = await getStoredPdfAttachment({
          ...pt,
          pdf_file_key: access.fileKey,
          pdf_folder_path: access.folderPath,
          pdf_original_name: access.originalName,
        });
        if (storedAttachment) {
          setSelectedDoc({
            name: pt.titulo,
            filename: storedAttachment.filename,
            base64: storedAttachment.base64,
          });
          setIsMailModalOpen(true);
          return;
        }
      }

      const signatures = await signaturesService.findByDocument(id, 'PT');
      const result = (await generatePtPdf(pt, signatures, {
        save: false,
        output: 'base64',
      })) as { filename: string; base64: string } | undefined;

      if (result?.base64) {
        setSelectedDoc({
          name: pt.titulo,
          filename: result.filename,
          base64: result.base64,
        });
        setIsMailModalOpen(true);
      }
    } catch (error) {
      handleApiError(error, 'Email');
    }
  }, [ensureGovernedPdf, getStoredPdfAttachment, pts]);

  const handlePrint = useCallback(async (id: string) => {
    try {
      toast.info('Preparando impressão...');
      const pt = pts.find((item) => item.id === id) || (await ptsService.findOne(id));
      const shouldUseGovernedPdf = Boolean(pt.pdf_file_key) || pt.status === 'Aprovada';

      if (shouldUseGovernedPdf) {
        const access = await ensureGovernedPdf(pt);
        if (access?.url) {
          openPdfForPrint(access.url, () => {
            toast.info('Pop-up bloqueado. Abrimos o PDF final na mesma aba para impressão.');
          });
          return;
        }

        toast.warning(
          'O PDF final da PT foi emitido, mas a URL segura não está disponível agora.',
        );
        return;
      }

      const signatures = await signaturesService.findByDocument(id, 'PT');
      const result = (await generatePtPdf(pt, signatures, {
        save: false,
        output: 'base64',
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
  }, [ensureGovernedPdf, pts]);

  const handleApprove = useCallback(async (id: string) => {
    const review = approvalReviewById[id];
    const checklist = approvalChecklistById[id];

    if (!review) {
      toast.info('Abra a pré-liberação da PT antes de aprovar.');
      return;
    }

    if (!review.readyForRelease) {
      toast.error('Ainda existem bloqueios operacionais antes da aprovação.');
      return;
    }

    if (!checklist || !Object.values(checklist).every(Boolean)) {
      toast.error('Conclua o checklist final do aprovador antes de liberar a PT.');
      return;
    }

    setApprovingId(id);
    dismissApprovalIssue(id);

    try {
      await ptsService.logPreApprovalReview(
        id,
        buildPreApprovalAuditPayload(review, 'approval_requested', checklist),
      );
      const updated = await ptsService.approve(id);
      setPts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      dismissApprovalReview(id);
      toast.success('PT aprovada com sucesso!');
    } catch (error) {
      const blockedPayload = getPtApprovalBlockedPayload(error);

      if (blockedPayload) {
        setApprovalIssuesById((current) => ({
          ...current,
          [id]: blockedPayload,
        }));
        toast.error('A PT foi bloqueada pelas regras de segurança.');
        return;
      }

      handleApiError(error, 'PT');
    } finally {
      setApprovingId((current) => (current === id ? null : current));
    }
  }, [approvalChecklistById, approvalReviewById, dismissApprovalIssue, dismissApprovalReview]);

  const handleReject = useCallback(async (id: string) => {
    const reason = prompt('Motivo da reprovação:');
    if (!reason?.trim()) return;

    setRejectingId(id);
    dismissApprovalIssue(id);

    try {
      const updated = await ptsService.reject(id, reason.trim());
      setPts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.success('PT reprovada.');
    } catch (error) {
      handleApiError(error, 'PT');
    } finally {
      setRejectingId((current) => (current === id ? null : current));
    }
  }, [dismissApprovalIssue]);

  // Filtering is now server-side — pts already contains the filtered page
  const filteredPts = pts;

  return {
    pts,
    loading,
    loadError,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    insights,
    page,
    setPage,
    limit,
    total,
    lastPage,
    isMailModalOpen,
    setIsMailModalOpen,
    selectedDoc,
    setSelectedDoc,
    filteredPts,
    approvalRules,
    approvalRulesLoading,
    approvingId,
    rejectingId,
    approvalIssuesById,
    approvalReviewLoadingId,
    approvalReviewById,
    approvalChecklistById,
    dismissApprovalIssue,
    dismissApprovalReview,
    updateApprovalChecklist,
    handleDelete,
    handleDownloadPdf,
    handleSendEmail,
    handlePrint,
    handlePrepareApproval,
    handleApprove,
    handleReject,
    loadPts,
  };
}
