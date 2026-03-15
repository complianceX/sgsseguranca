'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  PtPreApprovalHistoryEntry,
  ptsService,
} from '@/services/ptsService';
import { aprsService, Apr } from '@/services/aprsService';
import { sitesService, Site } from '@/services/sitesService';
import { companiesService, Company } from '@/services/companiesService';
import { usersService, User } from '@/services/usersService';
import { useForm, FormProvider } from 'react-hook-form';
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  Mail,
  ArrowRight,
  ClipboardCheck,
  FileText,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { aiService } from '@/services/aiService';
import { useAuth } from '@/context/AuthContext';
import { mailService } from '@/services/mailService';
import { SignatureModal } from '../../checklists/components/SignatureModal';
import { signaturesService } from '@/services/signaturesService';
import { AuditSection } from '@/components/AuditSection';
import { DocumentEmailModal } from '@/components/DocumentEmailModal';
import { Button, buttonVariants } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import { PageHeader } from '@/components/layout';
import { useFormSubmit } from '@/hooks/useFormSubmit';
import { toast } from 'sonner';
import { zodResolver } from '@hookform/resolvers/zod';
import { isAiEnabled } from '@/lib/featureFlags';
import { cn } from '@/lib/utils';
import {
  getPtFocusLabel,
  PtFocusTarget,
} from './pt-approval-focus';
import type {
  SophieDraftChecklistSuggestion,
  SophieDraftRiskSuggestion,
  SophieWizardDraft,
} from '@/lib/sophie-draft-storage';
import {
  ptSchema,
  PtFormData,
  initialChecklists,
  alturaQuestions,
  quenteQuestions,
  confinadoQuestions,
  escavacaoQuestions,
  eletricoQuestions,
  recomendacoesQuestions,
} from './pt-schema-and-data';
import { BasicInfoSection } from './BasicInfoSection';
import { RiskTypesSection } from './RiskTypesSection';
import { RapidRiskAnalysisSection } from './RapidRiskAnalysisSection';
import { ResponsibleExecutorsSection } from './ResponsibleExecutorsSection';
import ChecklistSection from './ChecklistSection';
import { PtPreApprovalHistoryPanel } from './PtPreApprovalHistoryPanel';
import { PtReadinessPanel } from './PtReadinessPanel';

interface PtFormProps {
  id?: string;
}

const PT_STEPS = [
  {
    id: 1,
    title: 'Dados básicos',
    description: 'Identificação, período, empresa, obra e responsável.',
    icon: FileText,
  },
  {
    id: 2,
    title: 'Checklists',
    description: 'Bloqueios técnicos e validações obrigatórias por tipo de trabalho.',
    icon: ClipboardCheck,
  },
  {
    id: 3,
    title: 'Finalização',
    description: 'Executantes, assinaturas e fechamento operacional.',
    icon: ShieldCheck,
  },
] as const;

const PT_CHECKLIST_FLAG_FIELD_MAP = {
  trabalho_altura_checklist: 'trabalho_altura',
  trabalho_eletrico_checklist: 'eletricidade',
  trabalho_quente_checklist: 'trabalho_quente',
  trabalho_espaco_confinado_checklist: 'espaco_confinado',
  trabalho_escavacao_checklist: 'escavacao',
} as const;

const PT_FOCUS_STEP_MAP: Record<PtFocusTarget, number> = {
  'basic-info': 1,
  'risk-analysis': 1,
  checklists: 2,
  team: 3,
};

const SOPHIE_PT_CRITICAL_CHECKPOINTS = {
  trabalho_altura_checklist: ['protecao_area', 'linha_vida', 'ancoragem', 'plano_resgate'],
  trabalho_eletrico_checklist: ['nr10_verificacoes', 'loto', 'aterramento_isolamento', 'plano_emergencia'],
  trabalho_quente_checklist: ['area_livre_combustiveis', 'riscos_incendio_15m', 'extintores_adequados', 'plano_resgate'],
  trabalho_espaco_confinado_checklist: ['atmosfera_testada_antes', 'monitoramento_durante', 'isolamento_sistemas', 'procedimentos_resgate_disponiveis'],
  trabalho_escavacao_checklist: ['servicos_publicos_notificados', 'escoramento_nr18', 'riscos_espaco_confinado_considerados', 'checklist_equipamento_pesado'],
} as const;

function buildCriticalChecklistJustification(
  _label: string,
  riskLevel: string,
  title?: string,
) {
  const activityLabel = title?.trim() || 'atividade';
  return `Validação crítica pendente para ${activityLabel}. A SOPHIE marcou este item como barreira obrigatória antes da liberação devido ao risco ${riskLevel.toLowerCase()}.`;
}

function applySophieCriticalPtDefaults(
  values: Partial<PtFormData>,
  metadata?: SophieWizardDraft['metadata'],
) {
  const riskLevel = String(metadata?.riskLevel || '').trim();
  if (riskLevel !== 'Alto' && riskLevel !== 'Crítico') {
    return values;
  }

  const nextValues: Partial<PtFormData> = {
    ...values,
  };

  const title = String(values.titulo || '').trim();
  const hasSpecificPermit =
    Boolean(values.trabalho_altura) ||
    Boolean(values.eletricidade) ||
    Boolean(values.trabalho_quente) ||
    Boolean(values.espaco_confinado) ||
    Boolean(values.escavacao);

  nextValues.recomendacoes_gerais_checklist = (
    values.recomendacoes_gerais_checklist || initialChecklists.recomendacoes_gerais_checklist
  ).map((item) => ({
    ...item,
    resposta: item.resposta || 'Ciente',
  }));

  nextValues.analise_risco_rapida_checklist = (
    values.analise_risco_rapida_checklist || initialChecklists.analise_risco_rapida_checklist
  ).map((item) => {
    if (item.id === 'requer_permissao_especifica') {
      return { ...item, resposta: hasSpecificPermit ? 'Sim' : item.resposta || 'Não' };
    }
    if (item.id === 'condicao_incomum_detectada') {
      return { ...item, resposta: 'Sim' };
    }
    if (item.id === 'outra_autorizacao_especifica') {
      return { ...item, resposta: riskLevel === 'Crítico' ? 'Sim' : item.resposta };
    }
    return { ...item, resposta: item.resposta || 'Sim' };
  });

  nextValues.analise_risco_rapida_observacoes =
    values.analise_risco_rapida_observacoes?.trim() ||
    [
      `SOPHIE classificou esta PT como risco ${riskLevel.toLowerCase()}.`,
      'Realizar dupla checagem dos bloqueios críticos, confirmar permissões específicas e registrar evidências antes da liberação.',
    ].join(' ');

  (
    Object.keys(SOPHIE_PT_CRITICAL_CHECKPOINTS) as Array<
      keyof typeof SOPHIE_PT_CRITICAL_CHECKPOINTS
    >
  ).forEach((fieldName) => {
    const relatedFlag = PT_CHECKLIST_FLAG_FIELD_MAP[fieldName];
    if (!values[relatedFlag]) {
      return;
    }

    const checklistItems = (
      values[fieldName] || initialChecklists[fieldName]
    ).map((item) => {
      const criticalIds = SOPHIE_PT_CRITICAL_CHECKPOINTS[fieldName] as readonly string[];
      if (!criticalIds.includes(item.id)) {
        return item;
      }

      const response = item.resposta || 'Não';
      return {
        ...item,
        resposta: response,
        justificativa:
          item.justificativa ||
          buildCriticalChecklistJustification(item.pergunta, riskLevel, title),
      };
    });

    nextValues[fieldName] = checklistItems as PtFormData[typeof fieldName];
  });

  return nextValues;
}

type PtMutationPayload = Parameters<typeof ptsService.create>[0];

function normalizeOptionalUuid(value?: string | null) {
  const normalized = String(value || '').trim();
  return normalized || undefined;
}

function normalizeOptionalDate(value?: string | null) {
  const normalized = String(value || '').trim();
  return normalized || undefined;
}

function buildPtMutationPayload(values: PtFormData): PtMutationPayload {
  const rest = { ...values };
  delete (rest as Partial<PtFormData>).company_id;

  return {
    ...rest,
    apr_id: normalizeOptionalUuid(rest.apr_id),
    auditado_por_id: normalizeOptionalUuid(rest.auditado_por_id),
    data_auditoria: normalizeOptionalDate(rest.data_auditoria),
    executantes: (rest.executantes || []).filter((executanteId) =>
      Boolean(String(executanteId || '').trim()),
    ),
  };
}

function extractPtKeywordsFromApr(apr?: Apr | null) {
  if (!apr) return '';

  const parts = [
    apr.titulo,
    apr.descricao,
    ...(apr.risks || []).map((risk) => risk.nome),
    ...(apr.activities || []).map((activity) => activity.nome),
    ...(apr.tools || []).map((tool) => tool.nome),
    ...(apr.machines || []).map((machine) => machine.nome),
    ...(apr.risk_items || []).flatMap((item) => [
      item.atividade,
      item.agente_ambiental,
      item.condicao_perigosa,
      item.fonte_circunstancia,
      item.categoria_risco,
      item.prioridade,
    ]),
  ];

  return parts.filter(Boolean).join(' ');
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

export function PtForm({ id }: PtFormProps) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const prefillCompanyId = searchParams.get('company_id') || '';
  const prefillSiteId = searchParams.get('site_id') || '';
  const prefillResponsibleId =
    searchParams.get('responsavel_id') ||
    searchParams.get('user_id') ||
    '';
  const prefillTitle = searchParams.get('title') || '';
  const prefillDescription = searchParams.get('description') || '';
  const isFieldMode = searchParams.get('field') === '1';
  const focusTarget = searchParams.get('focus') as PtFocusTarget | null;
  const [fetching, setFetching] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  
  const [aprs, setAprs] = useState<Apr[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Email modal
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

  // Signature States
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [currentSigningUser, setCurrentSigningUser] = useState<User | null>(null);
  const [signatures, setSignatures] = useState<Record<string, { data: string; type: string }>>({});
  const [currentStep, setCurrentStep] = useState(1);
  const [draftRestored, setDraftRestored] = useState(false);
  const [sophieSuggestedRisks, setSophieSuggestedRisks] = useState<SophieDraftRiskSuggestion[]>([]);
  const [sophieMandatoryChecklists, setSophieMandatoryChecklists] = useState<SophieDraftChecklistSuggestion[]>([]);
  const [sophieRiskLevel, setSophieRiskLevel] = useState<string>('');
  const [draftSavedAt, setDraftSavedAt] = useState<string>('');
  const [preApprovalHistory, setPreApprovalHistory] = useState<PtPreApprovalHistoryEntry[]>([]);
  const [preApprovalHistoryLoading, setPreApprovalHistoryLoading] = useState(false);
  const lastHandledAprIdRef = useRef<string>('');
  const getFocusHighlightClass = useCallback(
    (target: PtFocusTarget) =>
      focusTarget === target
        ? 'scroll-mt-28 rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-action-primary)]/35 bg-[var(--ds-color-action-primary)]/8 p-3 shadow-[var(--ds-shadow-sm)]'
        : '',
    [focusTarget],
  );

  const methods = useForm<PtFormData>({
    resolver: zodResolver(ptSchema),
    defaultValues: {
      numero: '',
      titulo: prefillTitle,
      descricao: prefillDescription,
      status: 'Pendente',
      data_hora_inicio: new Date().toISOString().slice(0, 16),
      data_hora_fim: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
      company_id: prefillCompanyId,
      site_id: prefillSiteId,
      apr_id: '',
      responsavel_id: prefillResponsibleId,
      trabalho_altura: false,
      espaco_confinado: false,
      trabalho_quente: false,
      eletricidade: false,
      escavacao: false,
      ...initialChecklists,
      executantes: prefillResponsibleId ? [prefillResponsibleId] : [],
      auditado_por_id: '',
      data_auditoria: '',
      resultado_auditoria: '',
      notas_auditoria: '',
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    trigger,
  } = methods;

  const draftStorageKey = useMemo(
    () => (id ? null : `gst.pt.wizard.draft.${user?.company_id || 'default'}`),
    [id, user?.company_id],
  );

  useEffect(() => {
    if (!focusTarget) return;

    const nextStep = PT_FOCUS_STEP_MAP[focusTarget];
    if (nextStep) {
      setCurrentStep(nextStep);
    }
  }, [focusTarget]);

  useEffect(() => {
    if (!focusTarget) return;

    const timeout = window.setTimeout(() => {
      const targetElement = document.querySelector<HTMLElement>(
        `[data-pt-focus-target="${focusTarget}"]`,
      );

      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);

    return () => window.clearTimeout(timeout);
  }, [currentStep, focusTarget]);
  const legacyDraftStorageKey = useMemo(
    () => (id ? null : `compliancex.pt.wizard.draft.${user?.company_id || 'default'}`),
    [id, user?.company_id],
  );

  const selectedCompanyId = watch('company_id');
  const selectedSiteId = watch('site_id');
  const selectedResponsavelId = watch('responsavel_id');
  const selectedAprId = watch('apr_id');
  const selectedAuditadoPorId = watch('auditado_por_id');
  const selectedTitle = watch('titulo');
  const workAtHeight = watch('trabalho_altura');
  const workElectric = watch('eletricidade');
  const workHot = watch('trabalho_quente');
  const workConfined = watch('espaco_confinado');
  const workExcavation = watch('escavacao');
  const filteredSites = sites.filter(site => site.company_id === selectedCompanyId);
  const filteredAprs = aprs.filter(apr => apr.company_id === selectedCompanyId);
  const filteredUsers = users.filter(user => user.company_id === selectedCompanyId);
  const watchedExecutanteIds = watch('executantes');
  const selectedExecutanteIds = useMemo(
    () => watchedExecutanteIds ?? [],
    [watchedExecutanteIds],
  );
  const selectedCompany = companies.find((company) => company.id === selectedCompanyId);
  const selectedSite = filteredSites.find((site) => site.id === selectedSiteId);
  const selectedResponsavel = filteredUsers.find((responsavel) => responsavel.id === selectedResponsavelId);
  const selectedApr = filteredAprs.find((apr) => apr.id === selectedAprId);
  const rapidRiskChecklist =
    watch('analise_risco_rapida_checklist') ?? initialChecklists.analise_risco_rapida_checklist;
  const rapidRiskObservacoes = watch('analise_risco_rapida_observacoes') ?? '';
  const generalChecklist =
    watch('recomendacoes_gerais_checklist') ?? initialChecklists.recomendacoes_gerais_checklist;
  const workAtHeightChecklist =
    watch('trabalho_altura_checklist') ?? initialChecklists.trabalho_altura_checklist;
  const workElectricChecklist =
    watch('trabalho_eletrico_checklist') ?? initialChecklists.trabalho_eletrico_checklist;
  const workHotChecklist =
    watch('trabalho_quente_checklist') ?? initialChecklists.trabalho_quente_checklist;
  const workConfinedChecklist =
    watch('trabalho_espaco_confinado_checklist') ?? initialChecklists.trabalho_espaco_confinado_checklist;
  const workExcavationChecklist =
    watch('trabalho_escavacao_checklist') ?? initialChecklists.trabalho_escavacao_checklist;
  const selectedRiskTypes = [
    workAtHeight && 'Altura',
    workElectric && 'Eletricidade',
    workHot && 'Trabalho a quente',
    workConfined && 'Espaço confinado',
    workExcavation && 'Escavação',
  ].filter(Boolean) as string[];
  const checklistGroupsEnabled = [
    true,
    workAtHeight,
    workElectric,
    workHot,
    workConfined,
    workExcavation,
  ].filter(Boolean).length;
  const completedSignatures = Object.keys(signatures).length;
  const pendingSignatures = Math.max(0, selectedExecutanteIds.length - completedSignatures);

  const generalChecklistSummary = useMemo(
    () => summarizeChecklistAnswers(generalChecklist),
    [generalChecklist],
  );
  const workAtHeightSummary = useMemo(
    () => summarizeChecklistAnswers(workAtHeightChecklist),
    [workAtHeightChecklist],
  );
  const workElectricSummary = useMemo(
    () => summarizeChecklistAnswers(workElectricChecklist),
    [workElectricChecklist],
  );
  const workHotSummary = useMemo(
    () => summarizeChecklistAnswers(workHotChecklist),
    [workHotChecklist],
  );
  const workConfinedSummary = useMemo(
    () => summarizeChecklistAnswers(workConfinedChecklist),
    [workConfinedChecklist],
  );
  const workExcavationSummary = useMemo(
    () => summarizeChecklistAnswers(workExcavationChecklist),
    [workExcavationChecklist],
  );
  const unansweredChecklistItems =
    generalChecklistSummary.unanswered +
    (workAtHeight ? workAtHeightSummary.unanswered : 0) +
    (workElectric ? workElectricSummary.unanswered : 0) +
    (workHot ? workHotSummary.unanswered : 0) +
    (workConfined ? workConfinedSummary.unanswered : 0) +
    (workExcavation ? workExcavationSummary.unanswered : 0);
  const adverseChecklistItems =
    generalChecklistSummary.adverse +
    (workAtHeight ? workAtHeightSummary.adverse : 0) +
    (workElectric ? workElectricSummary.adverse : 0) +
    (workHot ? workHotSummary.adverse : 0) +
    (workConfined ? workConfinedSummary.adverse : 0) +
    (workExcavation ? workExcavationSummary.adverse : 0);
  const hasRapidRiskBasicNo = rapidRiskChecklist.some(
    (item) => item.secao === 'basica' && item.resposta === 'Não',
  );
  const readinessBlockers = useMemo(() => {
    const blockers: string[] = [];

    if (!selectedCompanyId) blockers.push('Selecionar a empresa da PT.');
    if (!selectedSiteId) blockers.push('Selecionar a obra/site da PT.');
    if (!selectedResponsavelId) blockers.push('Definir o responsável pela liberação.');
    if (!String(selectedTitle || '').trim()) blockers.push('Informar um título claro da atividade.');
    if (selectedRiskTypes.length === 0) blockers.push('Marcar pelo menos um tipo de trabalho crítico ou confirmar que a PT é geral.');
    if (hasRapidRiskBasicNo && !String(rapidRiskObservacoes || '').trim()) {
      blockers.push('Registrar ações corretivas na análise de risco rápida.');
    }
    if (unansweredChecklistItems > 0) {
      blockers.push(`${unansweredChecklistItems} item(ns) de checklist ainda sem resposta.`);
    }
    if (selectedExecutanteIds.length === 0) {
      blockers.push('Selecionar ao menos um executante.');
    }
    if (pendingSignatures > 0) {
      blockers.push(`${pendingSignatures} assinatura(s) ainda pendente(s).`);
    }

    return blockers;
  }, [
    hasRapidRiskBasicNo,
    pendingSignatures,
    rapidRiskObservacoes,
    selectedCompanyId,
    selectedExecutanteIds.length,
    selectedResponsavelId,
    selectedRiskTypes.length,
    selectedSiteId,
    selectedTitle,
    unansweredChecklistItems,
  ]);
  const readyForRelease = readinessBlockers.length === 0;

  const normalizeSuggestionText = useCallback(
    (value: string) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase(),
    [],
  );

  const buildChecklistSuggestionHref = useCallback(
    (suggestion: SophieDraftChecklistSuggestion) => {
      const params = new URLSearchParams();
      params.set('templateId', suggestion.id);
      if (selectedCompanyId) params.set('company_id', selectedCompanyId);
      if (selectedSiteId) params.set('site_id', selectedSiteId);
      if (selectedTitle) params.set('title', `${selectedTitle} • ${suggestion.label}`);
      if (methods.getValues('descricao')) {
        params.set('description', String(methods.getValues('descricao')));
      }
      return `/dashboard/checklists/new?${params.toString()}`;
    },
    [methods, selectedCompanyId, selectedSiteId, selectedTitle],
  );

  const resolvePtRiskFlagsFromText = useCallback(
    (value: string) => {
      const normalized = normalizeSuggestionText(value);
      return {
        trabalho_altura:
          /altura|queda|escada|andaime|telhado|linha de vida/.test(normalized),
        eletricidade:
          /eletric|choque|arco|painel|subestacao|energiz/.test(normalized),
        trabalho_quente:
          /quente|solda|fumos|faisca|incend|queimad|oxicorte/.test(normalized),
        espaco_confinado:
          /confinado|atmosfera|asfix|resgate|tanque|silo|galeria/.test(normalized),
        escavacao:
          /escava|vala|talude|soterr|subterr/.test(normalized),
      };
    },
    [normalizeSuggestionText],
  );

  const applyPtFlags = useCallback(
    (flags: Partial<Record<(typeof PT_CHECKLIST_FLAG_FIELD_MAP)[keyof typeof PT_CHECKLIST_FLAG_FIELD_MAP], boolean>>) => {
      const changedLabels: string[] = [];

      if (flags.trabalho_altura && !workAtHeight) {
        setValue('trabalho_altura', true, { shouldDirty: true, shouldValidate: true });
        changedLabels.push('Altura');
      }
      if (flags.eletricidade && !workElectric) {
        setValue('eletricidade', true, { shouldDirty: true, shouldValidate: true });
        changedLabels.push('Eletricidade');
      }
      if (flags.trabalho_quente && !workHot) {
        setValue('trabalho_quente', true, { shouldDirty: true, shouldValidate: true });
        changedLabels.push('Trabalho a quente');
      }
      if (flags.espaco_confinado && !workConfined) {
        setValue('espaco_confinado', true, { shouldDirty: true, shouldValidate: true });
        changedLabels.push('Espaço confinado');
      }
      if (flags.escavacao && !workExcavation) {
        setValue('escavacao', true, { shouldDirty: true, shouldValidate: true });
        changedLabels.push('Escavação');
      }

      return changedLabels;
    },
    [setValue, workAtHeight, workConfined, workElectric, workExcavation, workHot],
  );

  const applySuggestedPtRisk = useCallback(
    (suggestion: SophieDraftRiskSuggestion) => {
      const changes = applyPtFlags(resolvePtRiskFlagsFromText(`${suggestion.label} ${suggestion.category || ''}`));
      if (changes.length > 0) {
        toast.success(`SOPHIE ativou os grupos: ${changes.join(', ')}.`);
        return;
      }

      toast.info(`O risco ${suggestion.label} já está refletido na PT ou não exige um grupo adicional.`);
    },
    [applyPtFlags, resolvePtRiskFlagsFromText],
  );

  const applyAllSuggestedPtRisks = useCallback(() => {
    const allFlags = sophieSuggestedRisks.reduce(
      (acc, suggestion) => {
        const current = resolvePtRiskFlagsFromText(`${suggestion.label} ${suggestion.category || ''}`);
        return {
          trabalho_altura: acc.trabalho_altura || current.trabalho_altura,
          eletricidade: acc.eletricidade || current.eletricidade,
          trabalho_quente: acc.trabalho_quente || current.trabalho_quente,
          espaco_confinado: acc.espaco_confinado || current.espaco_confinado,
          escavacao: acc.escavacao || current.escavacao,
        };
      },
      {
        trabalho_altura: false,
        eletricidade: false,
        trabalho_quente: false,
        espaco_confinado: false,
        escavacao: false,
      },
    );

    const changes = applyPtFlags(allFlags);
    if (changes.length > 0) {
      toast.success(`Grupos ativados na PT: ${changes.join(', ')}.`);
    } else {
      toast.info('Os grupos sugeridos pela SOPHIE já estão ativos nesta PT.');
    }
  }, [applyPtFlags, resolvePtRiskFlagsFromText, sophieSuggestedRisks]);

  const applyMandatoryChecklistSuggestion = useCallback(
    (suggestion: SophieDraftChecklistSuggestion) => {
      const mappedField =
        PT_CHECKLIST_FLAG_FIELD_MAP[
          suggestion.id as keyof typeof PT_CHECKLIST_FLAG_FIELD_MAP
        ];

      if (!mappedField) {
        toast.info('Este checklist sugerido deve ser aberto como checklist operacional complementar.');
        return;
      }

      const changes = applyPtFlags({ [mappedField]: true });
      if (changes.length > 0) {
        toast.success(`Checklist mandatório aplicado: ${suggestion.label}.`);
      } else {
        toast.info(`O checklist ${suggestion.label} já está ativo na PT.`);
      }
    },
    [applyPtFlags],
  );

  const applyAllMandatoryChecklistSuggestions = useCallback(() => {
    const allFlags = sophieMandatoryChecklists.reduce(
      (acc, suggestion) => {
        const mappedField =
          PT_CHECKLIST_FLAG_FIELD_MAP[
            suggestion.id as keyof typeof PT_CHECKLIST_FLAG_FIELD_MAP
          ];
        if (mappedField) {
          acc[mappedField] = true;
        }
        return acc;
      },
      {} as Partial<Record<(typeof PT_CHECKLIST_FLAG_FIELD_MAP)[keyof typeof PT_CHECKLIST_FLAG_FIELD_MAP], boolean>>,
    );

    const changes = applyPtFlags(allFlags);
    if (changes.length > 0) {
      toast.success(`Checklists mandatórios ativados: ${changes.join(', ')}.`);
      setCurrentStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      toast.info('Os checklists mandatórios sugeridos já estão ativos nesta PT.');
    }
  }, [applyPtFlags, sophieMandatoryChecklists]);

  const handleCompanyChange = useCallback(
    (companyId: string) => {
      setValue('site_id', '', { shouldDirty: true, shouldValidate: true });
      setValue('apr_id', '', { shouldDirty: true, shouldValidate: false });
      setValue('responsavel_id', '', { shouldDirty: true, shouldValidate: true });
      setValue('auditado_por_id', '', { shouldDirty: true, shouldValidate: false });
      setValue('executantes', [], { shouldDirty: true, shouldValidate: true });
      setSignatures({});
      lastHandledAprIdRef.current = '';

      if (companyId) {
        toast.info('Empresa alterada. Obra, APR, responsável, executantes e assinaturas foram limpos para evitar inconsistências.');
      }
    },
    [setValue],
  );

  const handleAprLinked = useCallback(
    async (aprId: string) => {
      if (aprId && lastHandledAprIdRef.current === aprId) {
        return;
      }
      lastHandledAprIdRef.current = aprId;

      if (!aprId) {
        toast.info('APR desvinculada. A PT mantém os dados já preenchidos.');
        return;
      }

      try {
        const apr = filteredAprs.find((currentApr) => currentApr.id === aprId) || (await aprsService.findOne(aprId));
        const currentValues = methods.getValues();

        if (!currentValues.company_id) {
          setValue('company_id', apr.company_id, { shouldDirty: true, shouldValidate: true });
        }
        if (!currentValues.site_id && apr.site_id) {
          setValue('site_id', apr.site_id, { shouldDirty: true, shouldValidate: true });
        }
        if (!String(currentValues.titulo || '').trim()) {
          setValue('titulo', apr.titulo, { shouldDirty: true, shouldValidate: true });
        }
        if (!String(currentValues.descricao || '').trim() && apr.descricao) {
          setValue('descricao', apr.descricao, { shouldDirty: true, shouldValidate: false });
        }

        const eligibleResponsibleId =
          apr.elaborador?.id && apr.elaborador.company_id === apr.company_id
            ? apr.elaborador.id
            : '';
        if (!currentValues.responsavel_id && eligibleResponsibleId) {
          setValue('responsavel_id', eligibleResponsibleId, {
            shouldDirty: true,
            shouldValidate: true,
          });
        }

        if ((currentValues.executantes || []).length === 0 && apr.participants?.length > 0) {
          const participantIds = apr.participants
            .filter((participant) => participant.company_id === apr.company_id)
            .map((participant) => participant.id);
          if (participantIds.length > 0) {
            setValue('executantes', participantIds, {
              shouldDirty: true,
              shouldValidate: true,
            });
          }
        }

        const aprFlagChanges = applyPtFlags(
          resolvePtRiskFlagsFromText(extractPtKeywordsFromApr(apr)),
        );

        toast.success('APR vinculada com sucesso.', {
          description:
            aprFlagChanges.length > 0
              ? `A SOPHIE ativou grupos coerentes com a APR: ${aprFlagChanges.join(', ')}.`
              : 'Título, descrição e contexto operacional foram reaproveitados quando estavam em branco.',
        });
      } catch (error) {
        console.error('Erro ao aplicar contexto da APR na PT:', error);
        toast.error('Não foi possível aproveitar automaticamente o contexto da APR.');
      }
    },
    [applyPtFlags, filteredAprs, methods, resolvePtRiskFlagsFromText, setValue],
  );

  const saveDraftSnapshot = useCallback(() => {
    if (!draftStorageKey || typeof window === 'undefined' || id) {
      return;
    }

    window.localStorage.setItem(
      draftStorageKey,
      JSON.stringify({
        step: currentStep,
        values: methods.getValues(),
        signatures,
        metadata: {
          suggestedRisks: sophieSuggestedRisks,
          mandatoryChecklists: sophieMandatoryChecklists,
          riskLevel: sophieRiskLevel,
        },
      }),
    );
    setDraftSavedAt(new Date().toISOString());
    toast.success('Rascunho local da PT atualizado.');
  }, [
    currentStep,
    draftStorageKey,
    id,
    methods,
    signatures,
    sophieMandatoryChecklists,
    sophieRiskLevel,
    sophieSuggestedRisks,
  ]);

  const { handleSubmit: onSubmit, loading } = useFormSubmit(
    async (data: PtFormData) => {
      let ptId = id;
      let queuedOffline = false;
      const payload = buildPtMutationPayload(data);

      if (id) {
        const updatedPt = await ptsService.update(id, payload);
        queuedOffline = 'offlineQueued' in updatedPt && Boolean(updatedPt.offlineQueued);
      } else {
        const newPt = await ptsService.create(payload);
        ptId = newPt.id;
        queuedOffline = 'offlineQueued' in newPt && Boolean(newPt.offlineQueued);
      }

      if (queuedOffline) {
        return { offlineQueued: true, ptId };
      }

        // Attach final PDF and save signatures if we have a ptId
        if (ptId) {
          if (pdfFile) {
            await ptsService.attachFile(ptId, pdfFile);
          }

          const signaturePromises = Object.entries(signatures).map(([userId, sig]) => 
          signaturesService.create({
            user_id: userId,
            document_id: ptId as string,
            document_type: 'PT',
            signature_data: sig.data,
            type: sig.type
          })
        );
        
        if (signaturePromises.length > 0) {
          await Promise.all(signaturePromises);
        }
      }

      return { offlineQueued: false, ptId };
    },
    {
      successMessage: (result) => {
        const queuedOffline =
          typeof result === 'object' &&
          result !== null &&
          'offlineQueued' in result &&
          Boolean(result.offlineQueued);

        if (queuedOffline) {
          return 'PT salva na fila offline. Vamos sincronizar quando a conexão voltar.';
        }

        return id
          ? 'Permissão de Trabalho atualizada com sucesso!'
          : 'Permissão de Trabalho cadastrada com sucesso!';
      },
      redirectTo: '/dashboard/pts',
      context: 'PT',
      skipRedirect: (result) =>
        typeof result === 'object' &&
        result !== null &&
        'offlineQueued' in result &&
        Boolean(result.offlineQueued),
      onSuccess: (result) => {
        const queuedOffline =
          typeof result === 'object' &&
          result !== null &&
          'offlineQueued' in result &&
          Boolean(result.offlineQueued);

        if (queuedOffline) {
          saveDraftSnapshot();
          return;
        }

        if (draftStorageKey && typeof window !== 'undefined') {
          window.localStorage.removeItem(draftStorageKey);
        }
        if (legacyDraftStorageKey && typeof window !== 'undefined') {
          window.localStorage.removeItem(legacyDraftStorageKey);
        }
        setDraftSavedAt('');
      },
    }
  );

  useEffect(() => {
    async function loadData() {
      try {
        let companySeedId = user?.company_id || '';

        const loadCompanies = async (currentCompanyId?: string) => {
          let nextCompanies: Company[] = [];

          if (user?.profile?.nome === 'Administrador Geral') {
            const companiesPage = await companiesService.findPaginated({
              page: 1,
              limit: 100,
            });
            nextCompanies = companiesPage.data;

            if (
              currentCompanyId &&
              !nextCompanies.some((company) => company.id === currentCompanyId)
            ) {
              try {
                const currentCompany =
                  await companiesService.findOne(currentCompanyId);
                nextCompanies = dedupeById([currentCompany, ...nextCompanies]);
              } catch {
                nextCompanies = dedupeById(nextCompanies);
              }
            }
          } else if (currentCompanyId) {
            try {
              const currentCompany =
                await companiesService.findOne(currentCompanyId);
              nextCompanies = [currentCompany];
            } catch {
              nextCompanies = [];
            }
          }

          setCompanies(dedupeById(nextCompanies));
        };

        if (id) {
          setPreApprovalHistoryLoading(true);
          const [pt, sigs, history] = await Promise.all([
            ptsService.findOne(id),
            signaturesService.findByDocument(id, 'PT'),
            ptsService.getPreApprovalHistory(id).catch(() => []),
          ]);
          setPreApprovalHistory(history);

          // Pre-populate signatures state from backend
          const sigMap: Record<string, { data: string; type: string }> = {};
          sigs.forEach(s => {
            if (!s.user_id) return;
            sigMap[s.user_id] = { data: s.signature_data, type: s.type };
          });
          setSignatures(sigMap);
          companySeedId = pt.company_id;
          setAprs(
            dedupeById(
              isEntityWithId<Apr>(pt.apr) ? [pt.apr] : [],
            ),
          );
          setSites(
            dedupeById(
              isEntityWithId<Site>(pt.site) ? [pt.site] : [],
            ),
          );
          setUsers(
            dedupeById([
              ...(isEntityWithId<User>(pt.responsavel) ? [pt.responsavel] : []),
              ...((pt.executantes || []) as User[]),
              ...(isEntityWithId<User>(pt.auditado_por) ? [pt.auditado_por] : []),
            ]),
          );

          reset({
            ...initialChecklists,
            numero: pt.numero,
            titulo: pt.titulo,
            descricao: pt.descricao || '',
            data_hora_inicio: new Date(pt.data_hora_inicio).toISOString().slice(0, 16),
            data_hora_fim: new Date(pt.data_hora_fim).toISOString().slice(0, 16),
            status: pt.status,
            company_id: pt.company_id,
            site_id: pt.site_id,
            apr_id: pt.apr_id,
            responsavel_id: pt.responsavel_id,
            trabalho_altura: pt.trabalho_altura,
            espaco_confinado: pt.espaco_confinado,
            trabalho_quente: pt.trabalho_quente,
            eletricidade: pt.eletricidade,
            escavacao: pt.escavacao || false,
            analise_risco_rapida_checklist:
              pt.analise_risco_rapida_checklist &&
              pt.analise_risco_rapida_checklist.length > 0 ? pt.analise_risco_rapida_checklist : initialChecklists.analise_risco_rapida_checklist,
            analise_risco_rapida_observacoes:
              pt.analise_risco_rapida_observacoes || '',
            recomendacoes_gerais_checklist: pt.recomendacoes_gerais_checklist?.length ? pt.recomendacoes_gerais_checklist : initialChecklists.recomendacoes_gerais_checklist,
            trabalho_altura_checklist: pt.trabalho_altura_checklist?.length ? pt.trabalho_altura_checklist : initialChecklists.trabalho_altura_checklist,
            trabalho_eletrico_checklist: pt.trabalho_eletrico_checklist?.length ? pt.trabalho_eletrico_checklist : initialChecklists.trabalho_eletrico_checklist,
            trabalho_quente_checklist: pt.trabalho_quente_checklist?.length ? pt.trabalho_quente_checklist : initialChecklists.trabalho_quente_checklist,
            trabalho_espaco_confinado_checklist: pt.trabalho_espaco_confinado_checklist?.length ? pt.trabalho_espaco_confinado_checklist : initialChecklists.trabalho_espaco_confinado_checklist,
            trabalho_escavacao_checklist: pt.trabalho_escavacao_checklist?.length ? pt.trabalho_escavacao_checklist : initialChecklists.trabalho_escavacao_checklist,
            executantes: pt.executantes.map((e: User) => e.id),
            auditado_por_id: pt.auditado_por_id || '',
            data_auditoria: pt.data_auditoria ? new Date(pt.data_auditoria).toISOString().split('T')[0] : '',
            resultado_auditoria: pt.resultado_auditoria || '',
            notas_auditoria: pt.notas_auditoria || '',
          });
          setSophieSuggestedRisks([]);
          setSophieMandatoryChecklists([]);
          setSophieRiskLevel('');
        } else if (draftStorageKey && typeof window !== 'undefined') {
          setPreApprovalHistory([]);
          const rawDraft =
            window.localStorage.getItem(draftStorageKey) ||
            (legacyDraftStorageKey
              ? window.localStorage.getItem(legacyDraftStorageKey)
              : null);
          if (rawDraft) {
            if (
              legacyDraftStorageKey &&
              !window.localStorage.getItem(draftStorageKey)
            ) {
              window.localStorage.setItem(draftStorageKey, rawDraft);
              window.localStorage.removeItem(legacyDraftStorageKey);
            }
            const parsedDraft = JSON.parse(rawDraft) as SophieWizardDraft & {
              values?: Partial<PtFormData>;
            };

            if (parsedDraft.values) {
              const preparedValues = applySophieCriticalPtDefaults(
                parsedDraft.values,
                parsedDraft.metadata,
              );
              reset({
                ...methods.getValues(),
                ...preparedValues,
              });
              companySeedId = preparedValues.company_id || companySeedId;
            }

            if (parsedDraft.step && parsedDraft.step >= 1 && parsedDraft.step <= 3) {
              setCurrentStep(parsedDraft.step);
            }

            if (parsedDraft.signatures) {
              setSignatures(parsedDraft.signatures);
            }
            setSophieSuggestedRisks(parsedDraft.metadata?.suggestedRisks || []);
            setSophieMandatoryChecklists(parsedDraft.metadata?.mandatoryChecklists || []);
            setSophieRiskLevel(String(parsedDraft.metadata?.riskLevel || ''));
            setDraftRestored(true);
            setDraftSavedAt(new Date().toISOString());
          } else {
            setSophieSuggestedRisks([]);
            setSophieMandatoryChecklists([]);
            setSophieRiskLevel('');
          }
        }

        await loadCompanies(companySeedId);
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        toast.error('Erro ao carregar dados para o formulário.');
      } finally {
        setPreApprovalHistoryLoading(false);
        setFetching(false);
      }
    }
    loadData();
  }, [draftStorageKey, id, legacyDraftStorageKey, methods, reset, user?.company_id, user?.profile?.nome]);

  useEffect(() => {
    async function loadCompanyScopedCatalogs() {
      if (!selectedCompanyId) {
        setAprs([]);
        setSites([]);
        setUsers([]);
        return;
      }

      try {
        const [aprPage, sitePage, userPage] = await Promise.all([
          aprsService.findPaginated({
            page: 1,
            limit: 100,
            companyId: selectedCompanyId,
          }),
          sitesService.findPaginated({
            page: 1,
            limit: 100,
            companyId: selectedCompanyId,
          }),
          usersService.findPaginated({
            page: 1,
            limit: 100,
            companyId: selectedCompanyId,
          }),
        ]);

        let nextAprs = aprPage.data;
        let nextSites = sitePage.data;
        let nextUsers = userPage.data;

        if (selectedAprId && !nextAprs.some((apr) => apr.id === selectedAprId)) {
          try {
            const currentApr = await aprsService.findOne(selectedAprId);
            if (currentApr.company_id === selectedCompanyId) {
              nextAprs = dedupeById([currentApr, ...nextAprs]);
            }
          } catch {}
        }

        if (
          selectedSiteId &&
          !nextSites.some((site) => site.id === selectedSiteId)
        ) {
          try {
            const currentSite = await sitesService.findOne(selectedSiteId);
            if (currentSite.company_id === selectedCompanyId) {
              nextSites = dedupeById([currentSite, ...nextSites]);
            }
          } catch {}
        }

        const requiredUserIds = Array.from(
          new Set(
            [
              selectedResponsavelId,
              selectedAuditadoPorId,
              ...selectedExecutanteIds,
            ].filter(Boolean),
          ),
        ) as string[];
        const missingUserIds = requiredUserIds.filter(
          (userId) => !nextUsers.some((currentUser) => currentUser.id === userId),
        );

        if (missingUserIds.length > 0) {
          const fetchedUsers = await Promise.all(
            missingUserIds.map((userId) =>
              usersService.findOne(userId).catch(() => null),
            ),
          );
          const presentUsers = fetchedUsers.filter(
            (currentUser): currentUser is User => currentUser !== null,
          );
          nextUsers = dedupeById([
            ...presentUsers.filter(
              (currentUser) => currentUser.company_id === selectedCompanyId,
            ),
            ...nextUsers,
          ]);
        }

        setAprs((prev) =>
          dedupeById([
            ...prev.filter((apr) => apr.company_id === selectedCompanyId),
            ...nextAprs,
          ]),
        );
        setSites((prev) =>
          dedupeById([
            ...prev.filter((site) => site.company_id === selectedCompanyId),
            ...nextSites,
          ]),
        );
        setUsers((prev) =>
          dedupeById([
            ...prev.filter((currentUser) => currentUser.company_id === selectedCompanyId),
            ...nextUsers,
          ]),
        );
      } catch (error) {
        console.error('Erro ao carregar catálogos da PT:', error);
        toast.error('Erro ao carregar catálogos da PT.');
      }
    }

    void loadCompanyScopedCatalogs();
  }, [
    selectedAprId,
    selectedAuditadoPorId,
    selectedCompanyId,
    selectedExecutanteIds,
    selectedResponsavelId,
    selectedSiteId,
  ]);

  useEffect(() => {
    if (id) return;
    if (selectedCompanyId) return;
    const companyId = user?.company_id;
    if (!companyId) return;
    setValue('company_id', companyId);
    if (user?.site_id) {
      setValue('site_id', user.site_id);
    }
  }, [id, selectedCompanyId, setValue, user?.company_id, user?.site_id]);

  // APR auto-fill: propaga site_id e responsavel_id quando o usuário seleciona uma APR
  useEffect(() => {
    if (!selectedAprId) return;
    const apr = filteredAprs.find((a) => a.id === selectedAprId);
    if (!apr) return;

    const changes: string[] = [];
    if (!selectedSiteId && apr.site_id) {
      setValue('site_id', apr.site_id, { shouldDirty: true });
      changes.push('obra');
    }
    if (!selectedResponsavelId && apr.elaborador_id) {
      setValue('responsavel_id', apr.elaborador_id, { shouldDirty: true });
      changes.push('responsável');
    }
    if (changes.length > 0) {
      toast.info(`Preenchido automaticamente a partir da APR: ${changes.join(', ')}.`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAprId]);

  useEffect(() => {
    if (!draftStorageKey || typeof window === 'undefined' || id) {
      return;
    }

    const subscription = methods.watch((values) => {
      window.localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          step: currentStep,
          values,
          signatures,
          metadata: {
            suggestedRisks: sophieSuggestedRisks,
            mandatoryChecklists: sophieMandatoryChecklists,
            riskLevel: sophieRiskLevel,
          },
        }),
      );
      setDraftSavedAt(new Date().toISOString());
    });

    return () => subscription.unsubscribe();
  }, [
    currentStep,
    draftStorageKey,
    id,
    methods,
    signatures,
    sophieMandatoryChecklists,
    sophieRiskLevel,
    sophieSuggestedRisks,
  ]);

  useEffect(() => {
    if (!draftStorageKey || typeof window === 'undefined' || id) {
      return;
    }

    window.localStorage.setItem(
      draftStorageKey,
      JSON.stringify({
        step: currentStep,
        values: methods.getValues(),
        signatures,
        metadata: {
          suggestedRisks: sophieSuggestedRisks,
          mandatoryChecklists: sophieMandatoryChecklists,
          riskLevel: sophieRiskLevel,
        },
      }),
    );
    setDraftSavedAt(new Date().toISOString());
  }, [
    currentStep,
    draftStorageKey,
    id,
    methods,
    signatures,
    sophieMandatoryChecklists,
    sophieRiskLevel,
    sophieSuggestedRisks,
  ]);

  const toggleExecutante = useCallback((userId: string) => {
    const selectedExecutanteIds = methods.getValues('executantes') || [];
    const isSelected = selectedExecutanteIds.includes(userId);

    if (isSelected) {
      const updated = selectedExecutanteIds.filter(id => id !== userId);
      setValue('executantes', updated, { shouldValidate: true });
      const newSignatures = { ...signatures };
      delete newSignatures[userId];
      setSignatures(newSignatures);
    } else {
      const user = users.find(u => u.id === userId);
      if (user) {
        setCurrentSigningUser(user);
        setIsSignatureModalOpen(true);
      }
    }
  }, [methods, setValue, signatures, users]);

  const handleSaveSignature = useCallback((signatureData: string, type: string) => {
    if (currentSigningUser) {
      setSignatures(prev => ({
        ...prev,
        [currentSigningUser.id]: { data: signatureData, type }
      }));
      
      const current = watch('executantes') || [];
      const updated = [...current, currentSigningUser.id];
      setValue('executantes', updated, { shouldValidate: true });
      toast.success(`Assinatura de ${currentSigningUser.nome} capturada!`);
    }
  }, [currentSigningUser, setValue, watch]);

  const handleAiAnalysis = async () => {
    if (!isAiEnabled()) {
      toast.error('IA desativada neste ambiente.');
      return;
    }
    const data = watch();
    if (!data.titulo) {
      toast.error('Preencha pelo menos o título para a análise do GST.');
      return;
    }

    try {
      setAnalyzing(true);
      const result = await aiService.analyzePt({
        titulo: data.titulo,
        descricao: data.descricao || '',
        trabalho_altura: !!data.trabalho_altura,
        espaco_confinado: !!data.espaco_confinado,
        trabalho_quente: !!data.trabalho_quente,
        eletricidade: !!data.eletricidade,
      });

      toast.success('GST analisou os riscos da PT!', {
        description: (
          <div className="mt-2 space-y-2">
            <p className="font-bold text-[var(--ds-color-text-primary)]">{result.summary}</p>
            <ul className="list-inside list-disc text-xs">
              {result.suggestions.map((s: string, i: number) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <p className="text-[10px] italic">Nível de Risco Identificado: {result.riskLevel}</p>
          </div>
        ),
        duration: 8000,
      });
    } catch (error) {
      console.error('Erro na análise do GST:', error);
      toast.error('Não foi possível realizar a análise no momento.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSendEmail = () => {
    if (!id) return;
    setIsEmailModalOpen(true);
  };

  const handleConfirmSendEmail = async (email: string) => {
    if (!id || !email.trim()) return;
    try {
      await mailService.sendStoredDocument(id, 'PT', email.trim());
    } catch (error) {
      console.error('Erro ao enviar email:', error);
      toast.error('Erro ao enviar o documento. Verifique se o PDF foi gerado.');
      throw error;
    }
  };

  const nextStep = async () => {
    let fields: (keyof PtFormData)[] = [];
    if (currentStep === 1) {
      fields = ['numero', 'titulo', 'data_hora_inicio', 'data_hora_fim', 'company_id', 'site_id', 'apr_id', 'responsavel_id'];
    } else if (currentStep === 2) {
      fields = ['recomendacoes_gerais_checklist'];
      if (workAtHeight) fields.push('trabalho_altura_checklist');
      if (workElectric) fields.push('trabalho_eletrico_checklist');
      if (workHot) fields.push('trabalho_quente_checklist');
      if (workConfined) fields.push('trabalho_espaco_confinado_checklist');
      if (workExcavation) fields.push('trabalho_escavacao_checklist');
    }

    const isValid = await trigger(fields);
    if (isValid) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => prev - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (fetching) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--ds-color-action-primary)] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className={cn(
      "ds-form-page mx-auto max-w-7xl space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500",
      isFieldMode && "pb-28",
    )}>
      <PageHeader
        eyebrow={isFieldMode ? 'Modo campo' : 'Permissão de trabalho'}
        title={id ? 'Editar PT' : isFieldMode ? 'Nova PT em campo' : 'Nova PT'}
        description={
          isFieldMode
            ? 'Liberação operacional adaptada para obra, com rascunho automático e navegação reduzida para celular.'
            : `Preencha os campos abaixo para ${id ? 'atualizar' : 'criar'} a Permissão de Trabalho.`
        }
        icon={<ShieldCheck className="h-5 w-5" />}
        actions={
          <Link
            href="/dashboard/pts"
            className={cn(buttonVariants({ variant: 'outline' }), 'inline-flex items-center')}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        }
      />

      {isFieldMode ? (
        <div className="ds-form-section">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-success)]">
                PT em campo
              </p>
              <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
                Wizard pensado para liberação rápida, com retomada automática e foco em checklists críticos da operação.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center md:w-[260px]">
              <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/28 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">Rascunho</p>
                <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">Automático</p>
              </div>
              <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/28 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">Operação</p>
                <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">Campo / obra</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <FormProvider {...methods}>
        <form
          onSubmit={handleSubmit(onSubmit, (errors) => {
            const step1Fields = ['numero', 'titulo', 'data_hora_inicio', 'data_hora_fim', 'company_id', 'site_id', 'responsavel_id'];
            const step2Fields = ['recomendacoes_gerais_checklist', 'trabalho_altura_checklist', 'trabalho_eletrico_checklist', 'trabalho_quente_checklist', 'trabalho_espaco_confinado_checklist', 'trabalho_escavacao_checklist'];
            const errorKeys = Object.keys(errors);
            if (errorKeys.some((k) => step1Fields.includes(k))) {
              setCurrentStep(1);
              toast.error('Corrija os campos obrigatórios na etapa 1 antes de continuar.');
            } else if (errorKeys.some((k) => step2Fields.includes(k))) {
              setCurrentStep(2);
              toast.error('Há itens de checklist pendentes na etapa 2.');
            } else if (errors.executantes) {
              setCurrentStep(3);
              toast.error('Adicione pelo menos um executante antes de salvar.');
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
          })}
          className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]"
        >
          <aside className="space-y-4 xl:sticky xl:top-28 xl:self-start">
            <div className="ds-form-section overflow-hidden p-0">
              <div className="border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/16 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-muted)]">
                  Wizard operacional
                </p>
                <h2 className="mt-2 text-lg font-bold text-[var(--ds-color-text-primary)]">
                  Emissão guiada de PT
                </h2>
                <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
                  Avance etapa por etapa para reduzir falhas de liberação e manter rastreabilidade.
                </p>
              </div>
              <div className="space-y-3 px-4 py-4">
                {PT_STEPS.map((step) => {
                  const Icon = step.icon;
                  const isActive = currentStep === step.id;
                  const isCompleted = currentStep > step.id;

                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => {
                        if (step.id <= currentStep) {
                          setCurrentStep(step.id);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                      }}
                        className={`w-full rounded-[var(--ds-radius-lg)] border px-4 py-3 text-left transition-all ${
                        isActive
                          ? 'border-[var(--ds-color-action-primary)] bg-[var(--ds-color-action-primary)]/12 shadow-[var(--ds-shadow-sm)]'
                          : isCompleted
                            ? 'border-[color:var(--ds-color-success)]/20 bg-[color:var(--ds-color-success-subtle)] hover:border-[color:var(--ds-color-success)]/28'
                            : 'border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]/75'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                            isActive
                              ? 'bg-[var(--ds-color-action-primary)] text-white'
                              : isCompleted
                                ? 'bg-[color:var(--ds-color-success-subtle)] text-[var(--ds-color-success)]'
                                : 'bg-[var(--ds-color-surface-muted)]/22 text-[var(--ds-color-text-muted)]'
                          }`}
                        >
                          {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                            {step.title}
                          </p>
                          <p className="mt-1 text-xs text-[var(--ds-color-text-muted)]">{step.description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="ds-form-section px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-muted)]">
                    Resumo da PT
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                    {selectedTitle || 'Título ainda não definido'}
                  </p>
                </div>
                {draftStorageKey && draftRestored ? (
                  <StatusPill tone="warning">
                    Rascunho restaurado
                  </StatusPill>
                ) : null}
              </div>

              <div className="mt-4 space-y-3 text-sm text-[var(--ds-color-text-secondary)]">
                <SummaryRow label="Empresa" value={selectedCompany?.razao_social || 'Não definida'} />
                <SummaryRow label="Obra" value={selectedSite?.nome || 'Não definida'} />
                <SummaryRow label="Responsável" value={selectedResponsavel?.nome || 'Não definido'} />
                <SummaryRow label="APR vinculada" value={selectedApr?.numero || 'Não vinculada'} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <WizardMetric label="Riscos marcados" value={String(selectedRiskTypes.length)} tone="info" />
                <WizardMetric label="Checklists ativos" value={String(checklistGroupsEnabled)} tone="warning" />
                <WizardMetric label="Executantes" value={String(selectedExecutanteIds.length)} tone="success" />
                <WizardMetric label="Assinaturas" value={String(completedSignatures)} tone="default" />
              </div>

              {selectedRiskTypes.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedRiskTypes.map((risk) => (
                    <StatusPill key={risk}>
                      {risk}
                    </StatusPill>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[var(--ds-radius-lg)] border border-[color:var(--ds-color-warning)]/20 bg-[color:var(--ds-color-warning-subtle)] px-3 py-2 text-xs text-[var(--ds-color-warning)]">
                  Marque os tipos de trabalho para habilitar os checklists específicos.
                </div>
              )}

              {draftSavedAt ? (
                <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                  Último rascunho salvo às{' '}
                  {new Date(draftSavedAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              ) : null}
            </div>

            <PtReadinessPanel
              readyForRelease={readyForRelease}
              blockers={readinessBlockers}
              unansweredChecklistItems={unansweredChecklistItems}
              adverseChecklistItems={adverseChecklistItems}
              pendingSignatures={pendingSignatures}
              hasRapidRiskBlocker={hasRapidRiskBasicNo}
            />

            <div className="rounded-[var(--ds-radius-xl)] border border-[color:var(--ds-color-danger)]/18 bg-[color:var(--ds-color-danger-subtle)] px-4 py-3 text-sm text-[var(--ds-color-danger)]">
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Não avance sem validar bloqueios críticos, vigência documental e assinaturas mínimas dos executantes.
                </p>
              </div>
            </div>
          </aside>

          <div className="space-y-8">
            {(sophieSuggestedRisks.length > 0 || sophieMandatoryChecklists.length > 0) && (
              <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-action-primary)]/25 bg-[var(--ds-color-action-primary)]/8 p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-action-primary)]">
                      Sugestões da SOPHIE
                    </p>
                    <h3 className="mt-2 text-lg font-bold text-[var(--ds-color-text-primary)]">
                      Aplicações rápidas para esta PT
                    </h3>
                    <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
                      Ative grupos de risco e checklists mandatórios com um clique para deixar a liberação coerente com a atividade e o site.
                    </p>
                    {sophieRiskLevel === 'Alto' || sophieRiskLevel === 'Crítico' ? (
                      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-warning)]">
                        SOPHIE já pré-preencheu observações e checkpoints críticos porque o risco sugerido foi {sophieRiskLevel}.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sophieSuggestedRisks.length > 0 ? (
                      <button
                        type="button"
                        onClick={applyAllSuggestedPtRisks}
                        className="rounded-[var(--ds-radius-md)] border border-[color:var(--ds-color-info)]/22 bg-[color:var(--ds-color-info-subtle)] px-3 py-2 text-xs font-semibold text-[var(--ds-color-info)] transition-colors hover:bg-[color:var(--ds-color-info-subtle)]/80"
                      >
                        Aplicar grupos de risco
                      </button>
                    ) : null}
                    {sophieMandatoryChecklists.length > 0 ? (
                      <button
                        type="button"
                        onClick={applyAllMandatoryChecklistSuggestions}
                        className="rounded-[var(--ds-radius-md)] border border-[color:var(--ds-color-warning)]/22 bg-[color:var(--ds-color-warning-subtle)] px-3 py-2 text-xs font-semibold text-[var(--ds-color-warning)] transition-colors hover:bg-[color:var(--ds-color-warning-subtle)]/80"
                      >
                        Ativar checklists mandatórios
                      </button>
                    ) : null}
                  </div>
                </div>

                {sophieSuggestedRisks.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-secondary)]">
                      Riscos sugeridos
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {sophieSuggestedRisks.map((suggestion, index) => (
                        <button
                          key={`${suggestion.label}-${index}`}
                          type="button"
                          onClick={() => applySuggestedPtRisk(suggestion)}
                          className="rounded-full border border-[color:var(--ds-color-info)]/22 bg-[color:var(--ds-color-info-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--ds-color-info)] transition-colors hover:bg-[color:var(--ds-color-info-subtle)]/80"
                        >
                          {suggestion.label}
                          {suggestion.category ? ` • ${suggestion.category}` : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {sophieMandatoryChecklists.length > 0 ? (
                  <div className="mt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-secondary)]">
                      Checklists mandatórios e complementares
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {sophieMandatoryChecklists.map((suggestion) => {
                        const canApplyInline = suggestion.source === 'pt-group';
                        return (
                          <div
                            key={suggestion.id}
                            className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-4 py-3"
                          >
                            <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                              {suggestion.label}
                            </p>
                            <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                              {suggestion.reason}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-3">
                              {canApplyInline ? (
                                <button
                                  type="button"
                                  onClick={() => applyMandatoryChecklistSuggestion(suggestion)}
                                  className="text-xs font-semibold text-[var(--ds-color-warning)] hover:text-[var(--ds-color-warning-hover)]"
                                >
                                  Ativar no wizard
                                </button>
                              ) : (
                                <Link
                                  href={buildChecklistSuggestionHref(suggestion)}
                                  className="text-xs font-semibold text-[var(--ds-color-info)] hover:text-[var(--ds-color-info-hover)]"
                                >
                                  Abrir checklist recomendado
                                </Link>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {focusTarget ? (
              <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-action-primary)]/25 bg-[var(--ds-color-action-primary)]/10 px-4 py-3 text-sm text-[var(--ds-color-text-primary)]">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-action-primary)]">
                  Correção guiada
                </p>
                <p className="mt-2">
                  Esta PT foi aberta já focada em <strong>{getPtFocusLabel(focusTarget)}</strong> a partir da pré-liberação.
                </p>
              </div>
            ) : null}

            {currentStep === 1 && (
              <div className="space-y-4">
                <div
                  data-pt-focus-target="basic-info"
                  className={getFocusHighlightClass('basic-info')}
                >
                  <BasicInfoSection
                    companies={companies}
                    filteredSites={filteredSites}
                    filteredAprs={filteredAprs}
                    filteredUsers={filteredUsers}
                    analyzing={analyzing}
                    onAiAnalysis={handleAiAnalysis}
                    onPdfSelected={setPdfFile}
                    onCompanyChange={handleCompanyChange}
                    onAprChange={handleAprLinked}
                  />
                </div>
                <div
                  data-pt-focus-target="risk-analysis"
                  className={cn('space-y-4', getFocusHighlightClass('risk-analysis'))}
                >
                  <RiskTypesSection />
                  <RapidRiskAnalysisSection />
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div
                data-pt-focus-target="checklists"
                className={cn('space-y-4', getFocusHighlightClass('checklists'))}
              >
                <ChecklistSection
                  name="recomendacoes_gerais_checklist"
                  title="Recomendações Gerais"
                  description="Esta verificação é obrigatória em toda emissão de PT."
                  questions={recomendacoesQuestions}
                  baseResponses={['Ciente', 'Não']}
                  showJustificationOn={['Não']}
                />
                {workAtHeight && (
                  <ChecklistSection
                    name="trabalho_altura_checklist"
                    title="Trabalhos em Altura - Verificação das Condições"
                    description="Todos os itens devem ser verificados e devidamente organizados. Caso não aplicável, marque como N/A antes da emissão desta PT."
                    questions={alturaQuestions}
                    baseResponses={['Sim', 'Não', 'Não aplicável']}
                    showJustificationOn={['Não', 'Não aplicável']}
                  />
                )}
                {workElectric && (
                  <ChecklistSection
                    name="trabalho_eletrico_checklist"
                    title="Trabalhos Elétricos - Verificação das Condições"
                    description="Todos os itens devem ser verificados antes da emissão da PT."
                    questions={eletricoQuestions}
                    baseResponses={['Sim', 'Não', 'Não aplicável']}
                    showJustificationOn={['Não']}
                  />
                )}
                {workHot && (
                  <ChecklistSection
                    name="trabalho_quente_checklist"
                    title="Trabalhos a Quente - Verificação das Condições"
                    description="Todos os itens devem ser verificados antes da emissão da PT."
                    questions={quenteQuestions}
                    baseResponses={['Sim', 'Não', 'Não aplicável']}
                    showJustificationOn={['Não']}
                  />
                )}
                {workConfined && (
                  <ChecklistSection
                    name="trabalho_espaco_confinado_checklist"
                    title="Espaço Confinado - Verificação das Condições"
                    description="Todos os itens devem ser verificados antes da emissão da PT."
                    questions={confinadoQuestions}
                    baseResponses={['Sim', 'Não', 'Não aplicável']}
                    showJustificationOn={['Não']}
                  />
                )}
                {workExcavation && (
                  <ChecklistSection
                    name="trabalho_escavacao_checklist"
                    title="Escavação - Verificação das Condições"
                    description="Todos os itens devem ser verificados antes da emissão da PT."
                    questions={escavacaoQuestions}
                    baseResponses={['Sim', 'Não', 'Não aplicável']}
                    showJustificationOn={['Não']}
                  />
                )}
              </div>
            )}

            {currentStep === 3 && (
              <div
                data-pt-focus-target="team"
                className={cn('space-y-4', getFocusHighlightClass('team'))}
              >
                <ResponsibleExecutorsSection
                  filteredUsers={filteredUsers}
                  selectedCompanyId={selectedCompanyId}
                  signatures={signatures}
                  onToggleExecutante={toggleExecutante}
                />
                <PtReadinessPanel
                  readyForRelease={readyForRelease}
                  blockers={readinessBlockers}
                  unansweredChecklistItems={unansweredChecklistItems}
                  adverseChecklistItems={adverseChecklistItems}
                  pendingSignatures={pendingSignatures}
                  hasRapidRiskBlocker={hasRapidRiskBasicNo}
                />
                {id && (
                  <div className="ds-form-section">
                    <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-[var(--ds-color-text-primary)]">
                      Auditoria do Trabalho
                      <span className="h-2 w-2 rounded-full bg-[var(--ds-color-action-primary)]"></span>
                    </h2>
                    <AuditSection<PtFormData>
                      register={register}
                      auditors={filteredUsers}
                    />
                  </div>
                )}
                {id && (
                  <PtPreApprovalHistoryPanel
                    entries={preApprovalHistory}
                    users={filteredUsers}
                    loading={preApprovalHistoryLoading}
                  />
                )}
              </div>
            )}

            <div className={cn(
              "flex flex-col gap-4 border-t border-[var(--ds-color-border-subtle)] pt-6 sm:flex-row sm:items-center sm:justify-between",
              isFieldMode && "ds-form-sticky-bar border-none p-0 shadow-none",
            )}>
              <div className="flex gap-2">
                {currentStep > 1 ? (
                  <Button type="button" variant="outline" onClick={prevStep}>
                    Voltar
                  </Button>
                ) : (
                  <Link
                    href="/dashboard/pts"
                    className={buttonVariants({ variant: 'outline' })}
                  >
                    Cancelar
                  </Link>
                )}
              </div>

              <div className={cn(
                "flex flex-col gap-3 sm:flex-row sm:items-center sm:space-x-4 sm:gap-0",
                isFieldMode && "grid grid-cols-2 gap-3 sm:flex-none sm:space-x-0",
              )}>
                {!id && draftStorageKey ? (
                  <Button
                    type="button"
                    variant="outline"
                    leftIcon={<Save className="h-4 w-4" />}
                    onClick={saveDraftSnapshot}
                    className={cn(isFieldMode && "min-h-12")}
                  >
                    Salvar rascunho
                  </Button>
                ) : null}
                {id && (
                  <Button
                    type="button"
                    variant="outline"
                    leftIcon={<Mail className="h-4 w-4" />}
                    onClick={handleSendEmail}
                    className={cn(isFieldMode && "min-h-12")}
                  >
                    Enviar por e-mail
                  </Button>
                )}
                
                {currentStep < 3 ? (
                  <Button
                    type="button"
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                    onClick={nextStep}
                    className={cn(isFieldMode && "min-h-12")}
                  >
                    Próximo
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    loading={loading}
                    leftIcon={!loading ? <Save className="h-4 w-4" /> : undefined}
                    className={cn(isFieldMode && "min-h-12")}
                  >
                    {id ? 'Salvar alterações' : isFieldMode ? 'Salvar PT em campo' : 'Criar Permissão de Trabalho'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </form>
      </FormProvider>

      <DocumentEmailModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        documentName={selectedTitle || 'Permissão de Trabalho'}
        onSend={handleConfirmSendEmail}
      />

      <SignatureModal
        isOpen={isSignatureModalOpen}
        onClose={() => {
          setIsSignatureModalOpen(false);
          setCurrentSigningUser(null);
        }}
        onSave={handleSaveSignature}
        userName={currentSigningUser?.nome || ''}
      />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
        {label}
      </span>
      <span className="max-w-[13rem] truncate text-right text-sm font-medium text-[var(--ds-color-text-primary)]">
        {value}
      </span>
    </div>
  );
}

function WizardMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'default' | 'info' | 'warning' | 'success';
}) {
  const tones = {
    default: 'bg-[var(--ds-color-surface-muted)]/18 text-[var(--ds-color-text-secondary)]',
    info: 'bg-[color:var(--ds-color-info-subtle)] text-[var(--ds-color-info)]',
    warning: 'bg-[color:var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]',
    success: 'bg-[color:var(--ds-color-success-subtle)] text-[var(--ds-color-success)]',
  };

  return (
    <div className={`rounded-[var(--ds-radius-lg)] px-3 py-3 ${tones[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function isEntityWithId<T extends { id: string }>(value: unknown): value is T {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return (
    'id' in value &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}
