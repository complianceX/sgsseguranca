'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Apr, aprsService } from '@/services/aprsService';
import { activitiesService, Activity } from '@/services/activitiesService';
import { risksService, Risk } from '@/services/risksService';
import { episService, Epi } from '@/services/episService';
import { toolsService, Tool } from '@/services/toolsService';
import { machinesService, Machine } from '@/services/machinesService';
import { sitesService, Site } from '@/services/sitesService';
import { companiesService, Company } from '@/services/companiesService';
import { usersService, User } from '@/services/usersService';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Save,
  ArrowLeft,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ClipboardList,
  ShieldCheck,
  FileText,
  Printer,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { aiService } from '@/services/aiService';
import { isAiEnabled } from '@/lib/featureFlags';
import { SignatureModal } from '../../checklists/components/SignatureModal';
import { signaturesService } from '@/services/signaturesService';
import { useFormSubmit } from '@/hooks/useFormSubmit';
import { AuditSection } from '@/components/AuditSection';
import { cn } from '@/lib/utils';
import { generateAprPdf } from '@/lib/pdf/aprGenerator';
import { base64ToPdfBlob, base64ToPdfFile } from '@/lib/pdf/pdfFile';
import { openPdfForPrint } from '@/lib/print-utils';
import { AprLogEntry, AprTimeline } from './AprTimeline';
import { useAuth } from '@/context/AuthContext';
import type {
  SophieDraftChecklistSuggestion,
  SophieDraftRiskSuggestion,
  SophieWizardDraft,
} from '@/lib/sophie-draft-storage';

const aprSchema = z.object({
  // Campo interno: indica que o usuário anexou uma APR já preenchida e assinada (PDF).
  // Usado somente para validação/UX do wizard; não deve ser enviado para a API.
  pdf_signed: z.boolean().optional(),
  numero: z.string().min(1, 'O número é obrigatório'),
  titulo: z.string().min(5, 'O título deve ter pelo menos 5 caracteres'),
  descricao: z.string().optional(),
  data_inicio: z.string(),
  data_fim: z.string(),
  status: z.enum(['Pendente', 'Aprovada', 'Cancelada', 'Encerrada']),
  is_modelo: z.boolean().optional(),
  is_modelo_padrao: z.boolean().optional(),
  company_id: z.string().min(1, 'Selecione uma empresa'),
  site_id: z.string().min(1, 'Selecione um site'),
  elaborador_id: z.string().min(1, 'Selecione um elaborador'),
  activities: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
  epis: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  machines: z.array(z.string()).optional(),
  participants: z.array(z.string()).optional(),
  itens_risco: z.array(z.object({
    atividade_processo: z.string().optional(),
    agente_ambiental: z.string().optional(),
    condicao_perigosa: z.string().optional(),
    fontes_circunstancias: z.string().optional(),
    possiveis_lesoes: z.string().optional(),
    probabilidade: z.string().optional(),
    severidade: z.string().optional(),
    categoria_risco: z.string().optional(),
    medidas_prevencao: z.string().optional(),
  })).optional(),
  auditado_por_id: z.string().optional(),
  data_auditoria: z.string().optional(),
  resultado_auditoria: z.string().optional(),
  notas_auditoria: z.string().optional(),
});

type AprFormData = z.infer<typeof aprSchema>;
type AprMutationPayload = Omit<AprFormData, 'pdf_signed'>;
type AprSubmitResult = {
  aprId?: string;
  offlineQueued?: boolean;
};

interface AprFormProps {
  id?: string;
}

const APR_STEPS = [
  {
    id: 1,
    title: 'Dados básicos',
    description: 'Identificação da APR, empresa, obra, responsável e escopo.',
    icon: FileText,
  },
  {
    id: 2,
    title: 'Riscos e controles',
    description: 'Participantes, assinaturas e planilha técnica da APR.',
    icon: ClipboardList,
  },
  {
    id: 3,
    title: 'Revisão final',
    description: 'Validação final, assinaturas e encaminhamento para emissão governada.',
    icon: ShieldCheck,
  },
] as const;

const aprBackButtonClass =
  'group rounded-full p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-card-muted)] hover:text-[var(--color-text)]';
const aprHeadingClass = 'text-2xl font-bold text-[var(--color-text)]';
const aprSubheadingClass = 'text-sm text-[var(--color-text-muted)]';
const aprSectionTitleClass = 'mb-3 text-sm font-bold text-[var(--color-text)]';
const aprLabelClass = 'mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]';
const aprLabelCompactClass = 'mb-1.5 block text-[13px] font-semibold text-[var(--color-text-secondary)]';
const aprFieldClass =
  'w-full min-h-[2.875rem] rounded-[var(--ds-radius-md)] border border-[var(--component-field-border)] bg-[color:var(--component-field-bg)] px-4 py-2.5 text-base leading-6 text-[var(--component-field-text)] shadow-[var(--component-field-shadow)] transition-all focus:border-[var(--component-field-border-focus)] focus:outline-none focus:shadow-[var(--component-field-shadow-focus)]';
const aprFileFieldClass =
  'block w-full rounded-[var(--ds-radius-md)] border border-[var(--component-field-border)] bg-[color:var(--component-field-bg)] px-4 py-2.5 text-base text-[var(--component-field-text)] shadow-[var(--component-field-shadow)] transition-all focus:border-[var(--component-field-border-focus)] focus:outline-none focus:shadow-[var(--component-field-shadow-focus)] file:mr-4 file:rounded-[var(--ds-radius-sm)] file:border-0 file:bg-[color:var(--color-card-muted)] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[var(--color-text-secondary)] hover:file:bg-[color:var(--ds-color-primary-subtle)]';
const aprFieldErrorClass = 'border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)]';
const aprFieldDisabledClass = 'disabled:bg-[color:var(--color-card-muted)]/60 disabled:cursor-not-allowed disabled:opacity-60';
const aprCheckboxClass =
  'h-5 w-5 rounded border-[var(--component-field-border)] text-[var(--color-primary)] transition-all focus:ring-[var(--color-primary)]';
const aprErrorTextClass = 'mt-1 text-xs text-[var(--color-danger)]';
const aprSuccessButtonCompactClass =
  'rounded-[var(--ds-radius-md)] bg-[var(--component-button-success-bg)] px-3 py-2 text-xs font-semibold text-[var(--component-button-success-text)] shadow-[var(--ds-shadow-sm)] transition-all hover:-translate-y-px hover:shadow-[var(--ds-shadow-md)] disabled:opacity-60';
const aprPrimaryCompactButtonClass =
  'rounded-[var(--ds-radius-md)] bg-[var(--component-button-primary-bg)] px-3 py-2 text-xs font-semibold text-[var(--color-text-inverse)] shadow-[var(--ds-shadow-sm)] transition-all hover:-translate-y-px hover:shadow-[var(--ds-shadow-md)] disabled:opacity-60';
const aprSuccessButtonClass =
  'rounded-[var(--ds-radius-md)] bg-[var(--component-button-success-bg)] px-4 py-2 text-sm font-semibold text-[var(--component-button-success-text)] shadow-[var(--ds-shadow-sm)] transition-all hover:-translate-y-px hover:shadow-[var(--ds-shadow-md)] disabled:opacity-60';
const aprNeutralButtonClass =
  'rounded-[var(--ds-radius-md)] bg-[var(--ds-color-action-secondary-active)] px-4 py-2 text-sm font-semibold text-[var(--ds-color-action-secondary-foreground)] shadow-[var(--ds-shadow-sm)] transition-colors hover:bg-[var(--ds-color-action-secondary-hover)] disabled:opacity-60';
const aprSoftPrimaryButtonClass =
  'rounded-[var(--ds-radius-md)] border border-[var(--ds-color-primary-border)] bg-[color:var(--ds-color-primary-subtle)] px-3 py-2 text-xs font-semibold text-[var(--color-primary)] transition-colors hover:bg-[color:var(--ds-color-primary-subtle)]/78 disabled:opacity-60';
const aprInteractivePanelClass =
  'rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[color:var(--component-card-bg)] p-6 shadow-[var(--component-card-shadow)] transition-shadow hover:shadow-[var(--component-card-shadow-elevated)]';
const aprSubtleMetaCardClass =
  'flex flex-col gap-1 rounded-[var(--ds-radius-lg)] border border-[var(--color-border-subtle)] bg-[color:var(--color-card)] p-3 text-sm text-[var(--color-text-secondary)]';
const aprWarningInlineClass =
  'rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-3 py-2 text-xs text-[var(--color-warning)]';
const aprDangerInlineClass =
  'rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] px-4 py-3 text-sm text-[var(--color-danger)]';
const aprGhostActionClass =
  'rounded-[var(--ds-radius-md)] border border-[var(--component-button-secondary-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--component-button-secondary-bg-hover)]';
const aprPrimaryActionClass =
  'flex items-center justify-center space-x-2 rounded-[var(--ds-radius-md)] bg-[var(--component-button-primary-bg)] px-6 py-2.5 text-sm font-bold text-[var(--color-text-inverse)] shadow-[var(--ds-shadow-md)] transition-all hover:-translate-y-px hover:shadow-[var(--ds-shadow-lg)] disabled:opacity-60';
const aprPrimarySubmitActionClass =
  'flex items-center justify-center space-x-2 rounded-[var(--ds-radius-md)] bg-[var(--component-button-primary-bg)] px-8 py-2.5 text-sm font-bold text-[var(--color-text-inverse)] shadow-[var(--ds-shadow-md)] transition-all hover:-translate-y-px hover:shadow-[var(--ds-shadow-lg)] active:scale-95 disabled:opacity-50';

function calculateRiskCategory(probabilidade?: string, severidade?: string) {
  const p = Number(probabilidade || 0);
  const s = Number(severidade || 0);
  if (!p || !s) return { score: 0, categoria: '', prioridade: '' };

  const score = p * s;
  if (score <= 2) return { score, categoria: 'Aceitável', prioridade: 'Baixa' };
  if (score <= 4) return { score, categoria: 'De Atenção', prioridade: 'Média' };
  if (score <= 6) return { score, categoria: 'Substancial', prioridade: 'Alta' };
  return { score, categoria: 'Crítico', prioridade: 'Urgente' };
}

function getCategoriaBadgeClass(categoria?: string) {
  switch (categoria) {
    case 'Aceitável':
      return 'risk-badge-acceptable';
    case 'De Atenção':
      return 'risk-badge-attention';
    case 'Substancial':
      return 'risk-badge-substantial';
    case 'Crítico':
      return 'risk-badge-critical';
    default:
      return 'bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]';
  }
}

export function AprForm({ id }: AprFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const prefillCompanyIdParam = searchParams.get('company_id');
  const prefillSiteIdParam = searchParams.get('site_id');
  const prefillUserIdParam =
    searchParams.get('elaborador_id') || searchParams.get('user_id');
  const prefillCompanyId = isUuidLike(prefillCompanyIdParam)
    ? String(prefillCompanyIdParam)
    : '';
  const prefillSiteId = isUuidLike(prefillSiteIdParam)
    ? String(prefillSiteIdParam)
    : '';
  const prefillUserId = isUuidLike(prefillUserIdParam)
    ? String(prefillUserIdParam)
    : '';
  const prefillTitle = searchParams.get('title') || '';
  const prefillDescription = searchParams.get('description') || '';
  const isFieldMode = searchParams.get('field') === '1';
  const [fetching, setFetching] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [currentApr, setCurrentApr] = useState<Apr | null>(null);
  const [aprLogs, setAprLogs] = useState<AprLogEntry[]>([]);
  const [versionHistory, setVersionHistory] = useState<
    Array<{ id: string; numero: string; versao: number; status: string }>
  >([]);
  const [compareTargetId, setCompareTargetId] = useState('');
  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<{
    summary: {
      totalBase: number;
      totalTarget: number;
      added: number;
      removed: number;
      changed: number;
    };
  } | null>(null);
  const [selectedRiskItemEvidence, setSelectedRiskItemEvidence] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [evidenceLatitude, setEvidenceLatitude] = useState<string>('');
  const [evidenceLongitude, setEvidenceLongitude] = useState<string>('');
  const [evidenceAccuracy, setEvidenceAccuracy] = useState<string>('');
  const [aprEvidences, setAprEvidences] = useState<
    Array<{
      id: string;
      apr_risk_item_id: string;
      original_name?: string;
      hash_sha256: string;
      watermarked_hash_sha256?: string;
      uploaded_at: string;
      captured_at?: string;
      url?: string;
      watermarked_url?: string;
      integrity_flags?: Record<string, unknown>;
    }>
  >([]);
  const [hashToVerify, setHashToVerify] = useState('');
  const [verifyingHash, setVerifyingHash] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    verified: boolean;
    matchedIn?: 'original' | 'watermarked';
    message?: string;
  } | null>(null);
  const [suggestingControls, setSuggestingControls] = useState(false);
  
  const [, setActivities] = useState<Activity[]>([]);
  const [, setRisks] = useState<Risk[]>([]);
  const [, setEpis] = useState<Epi[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [, setTools] = useState<Tool[]>([]);
  const [, setMachines] = useState<Machine[]>([]);

  // Signature States
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [currentSigningUser, setCurrentSigningUser] = useState<User | null>(null);
  const [signatures, setSignatures] = useState<Record<string, { data: string; type: string }>>({});
  const [persistedSignatures, setPersistedSignatures] = useState<
    Record<string, { id?: string; data: string; type: string }>
  >({});
  const [currentStep, setCurrentStep] = useState(1);
  const [draftRestored, setDraftRestored] = useState(false);
  const [sophieSuggestedRisks, setSophieSuggestedRisks] = useState<SophieDraftRiskSuggestion[]>([]);
  const [sophieMandatoryChecklists, setSophieMandatoryChecklists] = useState<SophieDraftChecklistSuggestion[]>([]);
  const submitIntentRef = useRef<'save' | 'save_and_print'>('save');

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    trigger,
    formState: { errors },
  } = useForm<AprFormData>({
    resolver: zodResolver(aprSchema),
    defaultValues: {
      pdf_signed: false,
      numero: '',
      titulo: prefillTitle,
      descricao: prefillDescription,
      status: 'Pendente',
      is_modelo: false,
      is_modelo_padrao: false,
      data_inicio: new Date().toISOString().split('T')[0],
      data_fim: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      company_id: prefillCompanyId,
      site_id: prefillSiteId,
      elaborador_id: prefillUserId,
      activities: [],
      risks: [],
      epis: [],
      tools: [],
      machines: [],
      participants: prefillUserId ? [prefillUserId] : [],
      itens_risco: [],
    },
  });

  const selectedCompanyId = watch('company_id');
  const selectedSiteId = watch('site_id');
  const selectedElaboradorId = watch('elaborador_id');
  const tituloApr = watch('titulo');
  const dataInicioApr = watch('data_inicio');
  const filteredSites = sites.filter(site => site.company_id === selectedCompanyId);
  const filteredUsers = users.filter(user => user.company_id === selectedCompanyId);
  const draftStorageKey = useMemo(
    () => (id ? null : `gst.apr.wizard.draft.${user?.company_id || 'default'}`),
    [id, user?.company_id],
  );
  const legacyDraftStorageKey = useMemo(
    () => (id ? null : `compliancex.apr.wizard.draft.${user?.company_id || 'default'}`),
    [id, user?.company_id],
  );
  
  const selectedRiskIdsRaw = useWatch({ control, name: 'risks', defaultValue: [] });
  const selectedEpiIdsRaw = useWatch({ control, name: 'epis', defaultValue: [] });
  const selectedParticipantIdsRaw = useWatch({
    control,
    name: 'participants',
    defaultValue: [],
  });
  const watchedRiskItemsRaw = useWatch({
    control,
    name: 'itens_risco',
    defaultValue: [],
  });
  const selectedRiskIds = useMemo(() => selectedRiskIdsRaw ?? [], [selectedRiskIdsRaw]);
  const selectedEpiIds = useMemo(() => selectedEpiIdsRaw ?? [], [selectedEpiIdsRaw]);
  const selectedParticipantIds = useMemo(
    () => selectedParticipantIdsRaw ?? [],
    [selectedParticipantIdsRaw],
  );
  const watchedRiskItems = useMemo(
    () => watchedRiskItemsRaw ?? [],
    [watchedRiskItemsRaw],
  );
  const isModelo = watch('is_modelo');
  const isApproved = currentApr?.status === 'Aprovada';
  const hasFinalPdf = Boolean(currentApr?.pdf_file_key);
  const aiEnabled = isAiEnabled();
  const selectedCompany = companies.find((company) => company.id === selectedCompanyId);
  const selectedSite = sites.find((site) => site.id === selectedSiteId);
  const selectedElaborador = users.find((user) => user.id === selectedElaboradorId);

  const buildAprFilename = useCallback(
    (apr: Apr) =>
      `APR_${String(apr.numero || apr.titulo || apr.id).replace(/\s+/g, '_')}.pdf`,
    [],
  );

  const getErrorStatus = useCallback((error: unknown) => {
    return (
      Number(
        (error as { response?: { status?: number } } | undefined)?.response
          ?.status ?? 0,
      ) || null
    );
  }, []);

  const getGovernedPdfAccess = useCallback(
    async (aprId: string) => {
      try {
        return await aprsService.getPdfAccess(aprId);
      } catch (error) {
        if (getErrorStatus(error) === 404) {
          return null;
        }
        throw error;
      }
    },
    [getErrorStatus],
  );

  const ensureGovernedPdf = useCallback(
    async (apr: Apr) => {
      const existingAccess = await getGovernedPdfAccess(apr.id);
      if (existingAccess) {
        return existingAccess;
      }

      if (apr.status !== 'Aprovada') {
        return null;
      }

      const [fullApr, aprSignatures, evidences] = await Promise.all([
        aprsService.findOne(apr.id),
        signaturesService.findByDocument(apr.id, 'APR'),
        aprsService.listAprEvidences(apr.id),
      ]);

      const result = (await generateAprPdf(fullApr, aprSignatures, {
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
      toast.success('PDF final da APR emitido e registrado com sucesso.');
      return aprsService.getPdfAccess(apr.id);
    },
    [buildAprFilename, getGovernedPdfAccess],
  );

  const handlePrintAfterSave = useCallback(
    async (aprId: string) => {
      toast.info('Preparando impressão da APR...');
      const current = await aprsService.findOne(aprId);
      const shouldUseGovernedPdf =
        Boolean(current.pdf_file_key) || current.status === 'Aprovada';

      if (shouldUseGovernedPdf) {
        const access = await ensureGovernedPdf(current);
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

      const [fullApr, aprSignatures, evidences] = await Promise.all([
        aprsService.findOne(aprId),
        signaturesService.findByDocument(aprId, 'APR'),
        aprsService.listAprEvidences(aprId),
      ]);
      const result = (await generateAprPdf(fullApr, aprSignatures, {
        save: false,
        output: 'base64',
        evidences,
      })) as { base64: string } | undefined;

      if (!result?.base64) {
        throw new Error('Falha ao gerar o PDF da APR para impressão.');
      }

      const fileURL = URL.createObjectURL(base64ToPdfBlob(result.base64));
      openPdfForPrint(fileURL, () => {
        toast.info('Pop-up bloqueado. Abrimos o PDF na mesma aba para impressão.');
      });
      setTimeout(() => URL.revokeObjectURL(fileURL), 60_000);
    },
    [ensureGovernedPdf],
  );

  const buildChecklistSuggestionHref = useCallback(
    (suggestion: SophieDraftChecklistSuggestion) => {
      const params = new URLSearchParams();
      params.set('templateId', suggestion.id);
      if (selectedCompanyId) params.set('company_id', selectedCompanyId);
      if (selectedSiteId) params.set('site_id', selectedSiteId);
      if (tituloApr) params.set('title', `${tituloApr} • ${suggestion.label}`);
      if (watch('descricao')) {
        params.set('description', String(watch('descricao')));
      }
      return `/dashboard/checklists/new?${params.toString()}`;
    },
    [selectedCompanyId, selectedSiteId, tituloApr, watch],
  );

  const {
    fields: riskFields,
    append: appendRisk,
    remove: removeRisk,
    replace: replaceRisk,
  } = useFieldArray({
    control,
    name: 'itens_risco',
  });
  const totalRiskLines = riskFields.length;
  const completedSignatures = Object.keys(signatures).length;

  const hasSuggestedRiskInMatrix = useCallback(
    (suggestion: SophieDraftRiskSuggestion) =>
      (watchedRiskItems ?? []).some((item) =>
        String(item?.condicao_perigosa || '')
          .trim()
          .toLowerCase() === suggestion.label.trim().toLowerCase(),
      ),
    [watchedRiskItems],
  );

  const applySuggestedAprRisk = useCallback(
    (suggestion: SophieDraftRiskSuggestion) => {
      let appliedSelection = false;

      if (suggestion.id && !selectedRiskIds.includes(suggestion.id)) {
        setValue('risks', [...selectedRiskIds, suggestion.id], {
          shouldDirty: true,
          shouldValidate: true,
        });
        appliedSelection = true;
      }

      if (!hasSuggestedRiskInMatrix(suggestion)) {
        appendRisk({
          atividade_processo: tituloApr || 'Atividade assistida pela SOPHIE',
          agente_ambiental: suggestion.category || '',
          condicao_perigosa: suggestion.label,
          fontes_circunstancias: '',
          possiveis_lesoes: '',
          probabilidade: '',
          severidade: '',
          categoria_risco: '',
          medidas_prevencao: '',
        });
        appliedSelection = true;
      }

      if (appliedSelection) {
        toast.success(`Sugestão aplicada: ${suggestion.label}`);
      } else {
        toast.info(`A sugestão ${suggestion.label} já está refletida na APR.`);
      }
    },
    [appendRisk, hasSuggestedRiskInMatrix, selectedRiskIds, setValue, tituloApr],
  );

  const applyAllSuggestedAprRisks = useCallback(() => {
    let appliedCount = 0;
    const nextSelectedRiskIds = [...selectedRiskIds];
    sophieSuggestedRisks.forEach((suggestion) => {
      const shouldSelect = suggestion.id && !nextSelectedRiskIds.includes(suggestion.id);
      const shouldAppend = !hasSuggestedRiskInMatrix(suggestion);

      if (shouldSelect || shouldAppend) {
        if (shouldSelect) {
          nextSelectedRiskIds.push(suggestion.id as string);
        }

        if (shouldAppend) {
          appendRisk({
            atividade_processo: tituloApr || 'Atividade assistida pela SOPHIE',
            agente_ambiental: suggestion.category || '',
            condicao_perigosa: suggestion.label,
            fontes_circunstancias: '',
            possiveis_lesoes: '',
            probabilidade: '',
            severidade: '',
            categoria_risco: '',
            medidas_prevencao: '',
          });
        }
        appliedCount += 1;
      }
    });

    if (nextSelectedRiskIds.length !== selectedRiskIds.length) {
      setValue('risks', Array.from(new Set(nextSelectedRiskIds)), {
        shouldDirty: true,
        shouldValidate: true,
      });
    }

    if (appliedCount > 0) {
      toast.success(`${appliedCount} sugestão(ões) da SOPHIE aplicadas na APR.`);
    } else {
      toast.info('As sugestões da SOPHIE já foram refletidas na APR.');
    }
  }, [
    appendRisk,
    hasSuggestedRiskInMatrix,
    selectedRiskIds,
    setValue,
    sophieSuggestedRisks,
    tituloApr,
  ]);

  const { handleSubmit: onSubmit, loading } = useFormSubmit(
    async (data: AprFormData) => {
      if (id && hasFinalPdf) {
        throw new Error('APR com PDF final emitido está bloqueada. Crie uma nova versão.');
      }

      let aprId = id;
      let offlineQueued = false;
      const payload = Object.fromEntries(
        Object.entries(data).filter(([key]) => key !== 'pdf_signed'),
      ) as AprMutationPayload;

      if (id && isApproved) {
        throw new Error(
          'APR aprovada está bloqueada para edição. Emita o PDF final na listagem ou crie uma nova versão para alterar o documento.',
        );
      }

      if (id) {
        const updated = await aprsService.update(id, payload);
        offlineQueued = Boolean((updated as Apr & { offlineQueued?: boolean }).offlineQueued);
      } else {
        const newApr = await aprsService.create(payload);
        aprId = newApr.id;
        offlineQueued = Boolean((newApr as Apr & { offlineQueued?: boolean }).offlineQueued);
      }

      if (aprId) {
        const signaturesToDelete = Object.entries(persistedSignatures).filter(
          ([userId, persisted]) => {
            const current = signatures[userId];
            return (
              !current ||
              current.data !== persisted.data ||
              current.type !== persisted.type
            );
          },
        );
        const signaturesToCreate = Object.entries(signatures).filter(
          ([userId, current]) => {
            const persisted = persistedSignatures[userId];
            return (
              !persisted ||
              current.data !== persisted.data ||
              current.type !== persisted.type
            );
          },
        );

        const signatureIdsToDelete = signaturesToDelete
          .map(([, persisted]) => persisted.id)
          .filter((signatureId): signatureId is string => Boolean(signatureId));

        if (signatureIdsToDelete.length > 0) {
          await Promise.all(
            signatureIdsToDelete.map((signatureId) =>
              signaturesService.deleteById(signatureId),
            ),
          );
        }

        if (signaturesToCreate.length > 0) {
          await Promise.all(
            signaturesToCreate.map(([userId, sig]) =>
              signaturesService.create({
                user_id: userId,
                document_id: aprId as string,
                document_type: 'APR',
                signature_data: sig.data,
                type: sig.type,
              }),
            ),
          );
        }
      }

      if (id) {
        const [updatedApr, logs, versions, evidences] = await Promise.all([
          aprsService.findOne(id),
          aprsService.getLogs(id),
          aprsService.getVersionHistory(id),
          aprsService.listAprEvidences(id),
        ]);
        setCurrentApr(updatedApr);
        setAprLogs(logs);
        setAprEvidences(evidences);
        setVersionHistory(
          versions.map((item) => ({
            id: item.id,
            numero: item.numero,
            versao: item.versao,
            status: item.status,
          })),
        );
      }

      return { aprId: aprId || undefined, offlineQueued } as AprSubmitResult;
    },
    {
      successMessage: () =>
        id ? 'APR atualizada com sucesso!' : 'APR cadastrada com sucesso!',
      redirectTo: '/dashboard/aprs',
      skipRedirect: () => submitIntentRef.current === 'save_and_print',
      context: 'APR',
      onSuccess: (result) => {
        if (draftStorageKey && typeof window !== 'undefined') {
          window.localStorage.removeItem(draftStorageKey);
        }
        if (legacyDraftStorageKey && typeof window !== 'undefined') {
          window.localStorage.removeItem(legacyDraftStorageKey);
        }

        if (submitIntentRef.current !== 'save_and_print') {
          return;
        }

        const submitResult = (result as AprSubmitResult | undefined) || {};
        const finishRedirect = () => {
          router.push('/dashboard/aprs');
          router.refresh();
        };

        if (!submitResult.aprId || submitResult.offlineQueued) {
          toast.info(
            'APR salva em modo offline. A impressão ficará disponível após sincronização.',
          );
          finishRedirect();
          return;
        }

        void (async () => {
          try {
            await handlePrintAfterSave(submitResult.aprId as string);
          } catch (printError) {
            console.error('Erro ao preparar impressão automática da APR:', printError);
            toast.warning(
              'APR salva, mas não foi possível abrir a impressão automática.',
            );
          } finally {
            finishRedirect();
          }
        })();
      },
    }
  );

  useEffect(() => {
    if (!isModelo) {
      setValue('is_modelo_padrao', false);
    }
  }, [isModelo, setValue]);

  const handleAiAnalysis = async () => {
    if (!isAiEnabled()) {
      toast.error('IA desativada neste ambiente.');
      return;
    }
    const titulo = watch('titulo');
    const descricao = watch('descricao');
    
    if (!titulo && !descricao) {
      toast.error('Preencha o título ou descrição para a análise do GST.');
      return;
    }

    try {
      setAnalyzing(true);
      const result = await aiService.analyzeApr(titulo + ' ' + (descricao || ''));
      
      if (result.risks.length > 0) {
        setValue('risks', [...new Set([...selectedRiskIds, ...result.risks])]);
      }
      
      if (result.epis.length > 0) {
        setValue('epis', [...new Set([...selectedEpiIds, ...result.epis])]);
      }

      toast.success('GST analisou a atividade e sugeriu riscos e EPIs!', {
        description: result.explanation,
        duration: 5000,
      });
    } catch (error) {
      console.error('Erro na análise do GST:', error);
      toast.error('Não foi possível realizar a análise no momento.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSuggestControls = useCallback(async () => {
    if (riskFields.length === 0) {
      toast.error('Adicione ao menos uma linha de risco para gerar sugestões.');
      return;
    }

    try {
      setSuggestingControls(true);
      const rows = watch('itens_risco') || [];
      await Promise.all(
        rows.map(async (row, index) => {
          const result = await aprsService.getControlSuggestions({
            probability: row?.probabilidade ? Number(row.probabilidade) : undefined,
            severity: row?.severidade ? Number(row.severidade) : undefined,
            exposure: 1,
            activity: row?.atividade_processo || tituloApr,
            condition: row?.condicao_perigosa,
          });

          const suggestionText = result.suggestions
            .map((item) => `${item.title}: ${item.description}`)
            .join(' | ');

          if (suggestionText) {
            setValue(`itens_risco.${index}.medidas_prevencao`, suggestionText, {
              shouldDirty: true,
              shouldValidate: true,
            });
          }
        }),
      );

      toast.success('Sugestões de controles aplicadas nas linhas de risco.');
    } catch (error) {
      console.error('Erro ao sugerir controles:', error);
      toast.error('Não foi possível gerar sugestões de controles.');
    } finally {
      setSuggestingControls(false);
    }
  }, [riskFields.length, setValue, tituloApr, watch]);

  const handleFinalizeApr = useCallback(async () => {
    if (!id) return;
    if (!confirm('Deseja aprovar esta APR?')) return;

    try {
      setFinalizing(true);
      const updated = await aprsService.approve(id);
      setCurrentApr(updated);
      setValue('status', updated.status);
      const [logs, versions] = await Promise.all([
        aprsService.getLogs(id),
        aprsService.getVersionHistory(id),
      ]);
      setAprLogs(logs);
      setVersionHistory(
        versions.map((item) => ({
          id: item.id,
          numero: item.numero,
          versao: item.versao,
          status: item.status,
        })),
      );
      toast.success('APR aprovada com sucesso.');
    } catch (error) {
      console.error('Erro ao aprovar APR:', error);
      toast.error('Não foi possível aprovar a APR.');
    } finally {
      setFinalizing(false);
    }
  }, [id, setValue]);

  const handleCreateVersion = useCallback(async () => {
    if (!id) return;
    try {
      setCreatingVersion(true);
      const newApr = await aprsService.createNewVersion(id);
      toast.success(`Nova versão criada: ${newApr.numero}`);
      router.push(`/dashboard/aprs/edit/${newApr.id}`);
    } catch (error) {
      console.error('Erro ao criar nova versão:', error);
      toast.error('Não foi possível criar nova versão.');
    } finally {
      setCreatingVersion(false);
    }
  }, [id, router]);

  const handleCompareVersions = useCallback(async () => {
    if (!id || !compareTargetId) return;
    try {
      setComparing(true);
      const result = await aprsService.compareVersions(id, compareTargetId);
      setCompareResult({ summary: result.summary });
      toast.success('Comparação de versões concluída.');
    } catch (error) {
      console.error('Erro ao comparar versões:', error);
      toast.error('Não foi possível comparar as versões.');
    } finally {
      setComparing(false);
    }
  }, [id, compareTargetId]);

  const handleCaptureLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('Geolocalização não suportada neste navegador.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setEvidenceLatitude(String(position.coords.latitude));
        setEvidenceLongitude(String(position.coords.longitude));
        setEvidenceAccuracy(String(position.coords.accuracy));
        toast.success('Localização capturada.');
      },
      () => toast.error('Não foi possível capturar a localização.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  const handleUploadEvidence = useCallback(async () => {
    if (!id || !selectedRiskItemEvidence || !evidenceFile) {
      toast.error('Selecione item de risco e imagem.');
      return;
    }
    if (!evidenceLatitude || !evidenceLongitude) {
      toast.error('Capture a geolocalização antes de enviar a evidência.');
      return;
    }
    if (!evidenceFile.type.startsWith('image/')) {
      toast.error('Envie uma imagem válida para manter a trilha de evidência.');
      return;
    }
    try {
      setUploadingEvidence(true);
      await aprsService.uploadRiskEvidence(id, selectedRiskItemEvidence, evidenceFile, {
        captured_at: new Date().toISOString(),
        latitude: evidenceLatitude ? Number(evidenceLatitude) : undefined,
        longitude: evidenceLongitude ? Number(evidenceLongitude) : undefined,
        accuracy_m: evidenceAccuracy ? Number(evidenceAccuracy) : undefined,
        device_id: typeof window !== 'undefined' ? window.navigator.userAgent.slice(0, 110) : undefined,
      });
      const evidences = await aprsService.listAprEvidences(id);
      setAprEvidences(evidences);
      setEvidenceFile(null);
      toast.success('Evidência enviada com hash de integridade.');
    } catch (error) {
      console.error('Erro ao enviar evidência:', error);
      toast.error('Falha ao enviar evidência.');
    } finally {
      setUploadingEvidence(false);
    }
  }, [
    id,
    selectedRiskItemEvidence,
    evidenceFile,
    evidenceLatitude,
    evidenceLongitude,
    evidenceAccuracy,
  ]);

  const handleVerifyHash = useCallback(async () => {
    if (!hashToVerify.trim()) {
      toast.error('Informe o hash SHA-256 para validar.');
      return;
    }
    try {
      setVerifyingHash(true);
      const result = await aprsService.verifyEvidenceHash(hashToVerify.trim());
      setVerificationResult({
        verified: result.verified,
        matchedIn: result.matchedIn,
        message: result.message,
      });
      if (result.verified) {
        toast.success('Hash validado com sucesso.');
      } else {
        toast.error(result.message || 'Hash não encontrado.');
      }
    } catch (error) {
      console.error('Erro ao verificar hash:', error);
      toast.error('Falha ao validar hash.');
    } finally {
      setVerifyingHash(false);
    }
  }, [hashToVerify]);

  useEffect(() => {
    async function loadData() {
      try {
        let companySeedId = isUuidLike(user?.company_id)
          ? String(user?.company_id)
          : '';

        const loadCompanies = async (selectedCompanyId?: string) => {
          const isGlobalAdmin = user?.profile?.nome === 'Administrador Geral';
          let nextCompanies: Company[] = [];
          const scopedCompanyId = isUuidLike(selectedCompanyId)
            ? String(selectedCompanyId)
            : undefined;

          if (isGlobalAdmin) {
            try {
              const companiesPage = await companiesService.findPaginated({
                page: 1,
                limit: 100,
              });
              nextCompanies = companiesPage.data;
            } catch (error) {
              console.error('Erro ao carregar lista de empresas da APR:', error);
            }
          } else {
            const fallbackCompanyId =
              scopedCompanyId ||
              (isUuidLike(user?.company_id)
                ? String(user?.company_id)
                : undefined);
            if (fallbackCompanyId) {
              try {
                const selectedCompany = await companiesService.findOne(
                  fallbackCompanyId,
                );
                nextCompanies = [selectedCompany];
              } catch (error) {
                console.error(
                  'Erro ao carregar empresa padrão da APR para o usuário:',
                  error,
                );
              }
            }
          }

          if (
            isGlobalAdmin &&
            scopedCompanyId &&
            !nextCompanies.some((company) => company.id === scopedCompanyId)
          ) {
            try {
              const selectedCompany = await companiesService.findOne(
                scopedCompanyId,
              );
              nextCompanies = dedupeById([selectedCompany, ...nextCompanies]);
            } catch {
              nextCompanies = dedupeById(nextCompanies);
            }
          }

          setCompanies(dedupeById(nextCompanies));
        };

        if (id) {
          setLoadingTimeline(true);
          const [apr, sigs] = await Promise.all([
            aprsService.findOne(id),
            signaturesService.findByDocument(id, 'APR')
          ]);
          setCurrentApr(apr);
          const [logs, versions, evidences] = await Promise.all([
            aprsService.getLogs(id),
            aprsService.getVersionHistory(id),
            aprsService.listAprEvidences(id),
          ]);
          setAprLogs(logs);
          setAprEvidences(evidences);
          setVersionHistory(
            versions.map((item) => ({
              id: item.id,
              numero: item.numero,
              versao: item.versao,
              status: item.status,
            })),
          );

          // Pre-populate signatures state from backend
          const sigMap: Record<string, { data: string; type: string }> = {};
          const persistedSigMap: Record<
            string,
            { id?: string; data: string; type: string }
          > = {};
          sigs.forEach(s => {
            if (!s.user_id) return;
            sigMap[s.user_id] = { data: s.signature_data, type: s.type };
            persistedSigMap[s.user_id] = {
              id: s.id,
              data: s.signature_data,
              type: s.type,
            };
          });
          setSignatures(sigMap);
          setPersistedSignatures(persistedSigMap);
          companySeedId = apr.company_id;
          setActivities(dedupeById(apr.activities || []));
          setRisks(dedupeById(apr.risks || []));
          setEpis(dedupeById(apr.epis || []));
          setTools(dedupeById(apr.tools || []));
          setMachines(dedupeById(apr.machines || []));
          setSites(dedupeById(apr.site ? [apr.site] : []));
          setUsers(
            dedupeById([
              ...(apr.elaborador ? [apr.elaborador] : []),
              ...(apr.participants || []),
              ...(apr.auditado_por ? [apr.auditado_por] : []),
            ]),
          );
          setSophieSuggestedRisks([]);
          setSophieMandatoryChecklists([]);

          reset({
            pdf_signed: Boolean(apr.pdf_file_key),
            numero: apr.numero,
            titulo: apr.titulo,
            descricao: apr.descricao || '',
            data_inicio: new Date(apr.data_inicio).toISOString().split('T')[0],
            data_fim: new Date(apr.data_fim).toISOString().split('T')[0],
            status: apr.status,
            company_id: apr.company_id,
            site_id: apr.site_id,
            elaborador_id: apr.elaborador_id,
            activities: apr.activities.map((a: Activity) => a.id),
            risks: apr.risks.map((r: Risk) => r.id),
            epis: apr.epis.map((e: Epi) => e.id),
            tools: apr.tools.map((t: Tool) => t.id),
            machines: apr.machines.map((m: Machine) => m.id),
            participants: apr.participants.map((p: User) => p.id),
            is_modelo: apr.is_modelo || false,
            is_modelo_padrao: apr.is_modelo_padrao || false,
            itens_risco: apr.itens_risco && apr.itens_risco.length > 0 ? apr.itens_risco : [],
            auditado_por_id: apr.auditado_por_id || '',
            data_auditoria: apr.data_auditoria ? new Date(apr.data_auditoria).toISOString().split('T')[0] : '',
            resultado_auditoria: apr.resultado_auditoria || '',
            notas_auditoria: apr.notas_auditoria || '',
          });
          setLoadingTimeline(false);
        } else if (draftStorageKey && typeof window !== 'undefined') {
          setPersistedSignatures({});
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
              values?: Partial<AprFormData>;
            };

            if (parsedDraft.values) {
              reset({
                ...watch(),
                ...parsedDraft.values,
              });
              companySeedId = parsedDraft.values.company_id || companySeedId;
              replaceRisk(
                parsedDraft.values.itens_risco && parsedDraft.values.itens_risco.length > 0
                  ? parsedDraft.values.itens_risco
                  : [],
              );
            }

            if (parsedDraft.step && parsedDraft.step >= 1 && parsedDraft.step <= 3) {
              setCurrentStep(parsedDraft.step);
            }

            if (parsedDraft.signatures) {
              setSignatures(parsedDraft.signatures);
            }

            setSophieSuggestedRisks(parsedDraft.metadata?.suggestedRisks || []);
            setSophieMandatoryChecklists(parsedDraft.metadata?.mandatoryChecklists || []);

            setDraftRestored(true);
          } else {
            setPersistedSignatures({});
            setSophieSuggestedRisks([]);
            setSophieMandatoryChecklists([]);
            const defaultAprPage = await aprsService.findPaginated({
              page: 1,
              limit: 20,
              companyId: user?.company_id,
              isModeloPadrao: true,
            });
            const defaultAprItem = defaultAprPage.data[0];

            if (defaultAprItem) {
              const defaultApr = await aprsService.findOne(defaultAprItem.id);
              companySeedId = defaultApr.company_id;
              setValue('company_id', defaultApr.company_id);
              setValue('titulo', defaultApr.titulo);
              setValue('descricao', defaultApr.descricao || '');
              setValue(
                'activities',
                (defaultApr.activities || []).map((activity) => activity.id),
              );
              setValue(
                'risks',
                (defaultApr.risks || []).map((risk) => risk.id),
              );
              setValue(
                'epis',
                (defaultApr.epis || []).map((epi) => epi.id),
              );
              setValue(
                'tools',
                (defaultApr.tools || []).map((tool) => tool.id),
              );
              setValue(
                'machines',
                (defaultApr.machines || []).map((machine) => machine.id),
              );
              setValue(
                'participants',
                (defaultApr.participants || []).map((participant) => participant.id),
              );
              replaceRisk(defaultApr.itens_risco && defaultApr.itens_risco.length > 0 ? defaultApr.itens_risco : []);
              setActivities(dedupeById(defaultApr.activities || []));
              setRisks(dedupeById(defaultApr.risks || []));
              setEpis(dedupeById(defaultApr.epis || []));
              setTools(dedupeById(defaultApr.tools || []));
              setMachines(dedupeById(defaultApr.machines || []));
              setSites(dedupeById(defaultApr.site ? [defaultApr.site] : []));
              setUsers(
                dedupeById([
                  ...(defaultApr.elaborador ? [defaultApr.elaborador] : []),
                  ...(defaultApr.participants || []),
                  ...(defaultApr.auditado_por ? [defaultApr.auditado_por] : []),
                ]),
              );
            }
          }
        }

        await loadCompanies(companySeedId);
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        toast.error('Erro ao carregar dados para o formulário.');
      } finally {
        setLoadingTimeline(false);
        setFetching(false);
      }
    }
    loadData();
  }, [
    draftStorageKey,
    id,
    legacyDraftStorageKey,
    replaceRisk,
    reset,
    setValue,
    user?.company_id,
    user?.profile?.nome,
    watch,
  ]);

  useEffect(() => {
    async function loadCompanyScopedCatalogs() {
      if (!selectedCompanyId) {
        setActivities([]);
        setRisks([]);
        setEpis([]);
        setTools([]);
        setMachines([]);
        setSites([]);
        setUsers([]);
        return;
      }

      if (!isUuidLike(selectedCompanyId)) {
        console.warn('Empresa inválida ao carregar catálogos da APR:', selectedCompanyId);
        setActivities([]);
        setRisks([]);
        setEpis([]);
        setTools([]);
        setMachines([]);
        setSites([]);
        setUsers([]);
        toast.error('A empresa selecionada para a APR está inválida. Recarregue a tela e selecione novamente.');
        return;
      }

      try {
        const [
          actResult,
          riskResult,
          epiResult,
          siteResult,
          userResult,
          toolResult,
          machineResult,
        ] = await Promise.allSettled([
          activitiesService.findPaginated({
            page: 1,
            limit: 100,
            companyId: selectedCompanyId,
          }),
          risksService.findPaginated({
            page: 1,
            limit: 100,
            companyId: selectedCompanyId,
          }),
          episService.findPaginated({
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
          toolsService.findPaginated({
            page: 1,
            limit: 100,
            companyId: selectedCompanyId,
          }),
          machinesService.findPaginated({
            page: 1,
            limit: 100,
            companyId: selectedCompanyId,
          }),
        ]);

        const catalogFailures: string[] = [];

        const mergeCatalog = <T extends { id: string; company_id: string }>(
          result: PromiseSettledResult<{ data: T[] }>,
          label: string,
          setter: (updater: (prev: T[]) => T[]) => void,
        ) => {
          if (result.status === 'fulfilled') {
            setter((prev) =>
              dedupeById([
                ...prev.filter((item) => item.company_id !== selectedCompanyId),
                ...result.value.data,
              ]),
            );
            return;
          }

          catalogFailures.push(label);
          console.error(`Erro ao carregar catálogo da APR: ${label}`, result.reason);
        };

        mergeCatalog(actResult, 'atividades', setActivities);
        mergeCatalog(riskResult, 'riscos', setRisks);
        mergeCatalog(epiResult, 'EPIs', setEpis);
        mergeCatalog(siteResult, 'obras', setSites);
        mergeCatalog(userResult, 'usuários', setUsers);
        mergeCatalog(toolResult, 'ferramentas', setTools);
        mergeCatalog(machineResult, 'máquinas', setMachines);

        if (catalogFailures.length > 0) {
          toast.error('Alguns catálogos da APR não puderam ser carregados.', {
            description: `Falharam: ${catalogFailures.join(', ')}.`,
          });
        }
      } catch (error) {
        console.error('Erro inesperado ao carregar catálogos da APR:', error);
        toast.error('Erro ao carregar catálogos da APR.');
      }
    }

    void loadCompanyScopedCatalogs();
  }, [selectedCompanyId]);

  useEffect(() => {
    if (id || selectedCompanyId) return;
    const companyId = user?.company_id;
    if (!isUuidLike(companyId)) return;
    setValue('company_id', String(companyId));
    if (isUuidLike(user?.site_id)) {
      setValue('site_id', String(user?.site_id));
    }
    if (isUuidLike(user?.id)) {
      setValue('elaborador_id', String(user?.id));
      setValue('participants', [String(user?.id)]);
    }
  }, [id, selectedCompanyId, setValue, user?.company_id, user?.id, user?.site_id]);

  useEffect(() => {
    if (!draftStorageKey || typeof window === 'undefined' || id) {
      return;
    }

    const subscription = watch((values) => {
      window.localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          step: currentStep,
          values,
          signatures,
        }),
      );
    });

    return () => subscription.unsubscribe();
  }, [currentStep, draftStorageKey, id, signatures, watch]);

  useEffect(() => {
    if (!draftStorageKey || typeof window === 'undefined' || id) {
      return;
    }

    window.localStorage.setItem(
      draftStorageKey,
      JSON.stringify({
        step: currentStep,
        values: watch(),
        signatures,
      }),
    );
  }, [currentStep, draftStorageKey, id, signatures, watch]);

  const toggleSelection = useCallback((field: 'activities' | 'risks' | 'epis' | 'tools' | 'machines' | 'participants', value: string) => {
    const current = watch(field) || [];
    const isSelected = current.includes(value);

    if (field === 'participants') {
      if (isSelected) {
        const updated = current.filter((id: string) => id !== value);
        setValue(field, updated, { shouldValidate: true });
        const newSignatures = { ...signatures };
        delete newSignatures[value];
        setSignatures(newSignatures);
      } else {
        const user = users.find(u => u.id === value);
        if (user) {
          setCurrentSigningUser(user);
          setIsSignatureModalOpen(true);
        }
      }
    } else {
      const updated = isSelected
        ? current.filter((id: string) => id !== value)
        : [...current, value];
      setValue(field, updated, { shouldValidate: true });
    }
  }, [watch, setValue, signatures, users]);

  const handleSaveSignature = useCallback((signatureData: string, type: string) => {
    if (currentSigningUser) {
      setSignatures(prev => ({
        ...prev,
        [currentSigningUser.id]: { data: signatureData, type }
      }));
      
      const current = watch('participants') || [];
      const updated = Array.from(new Set([...current, currentSigningUser.id]));
      setValue('participants', updated, { shouldValidate: true });
      toast.success(`Assinatura de ${currentSigningUser.nome} capturada!`);
    }
  }, [currentSigningUser, setValue, watch]);

  const nextStep = useCallback(async () => {
    let fields: (keyof AprFormData)[] = [];

    if (currentStep === 1) {
      fields = ['numero', 'titulo', 'company_id', 'site_id', 'elaborador_id', 'data_inicio', 'data_fim'];
    } else if (currentStep === 2) {
      fields = ['participants'];
    }

    const isValid = await trigger(fields);
    if (!isValid) return;

    setCurrentStep((prev) => prev + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep, trigger]);

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => prev - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  if (fetching) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--ds-color-action-primary)] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className={cn(
      "ds-form-page mx-auto max-w-4xl space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500",
      isFieldMode && "max-w-5xl pb-28",
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            href="/dashboard/aprs"
            className={aprBackButtonClass}
            title="Voltar para APRs"
          >
            <ArrowLeft className="h-5 w-5 group-hover:-translate-x-0.5 transition-transform" />
          </Link>
          <div>
            {isFieldMode ? (
              <span className="inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                modo campo
              </span>
            ) : null}
            <h1 className={aprHeadingClass}>
              {id ? 'Editar APR' : isFieldMode ? 'Nova APR em campo' : 'Nova APR'}
            </h1>
            <p className={aprSubheadingClass}>
              {isFieldMode
                ? 'Fluxo adaptado para obra e celular, com retomada automática do rascunho e ações maiores para uso em campo.'
                : `Preencha os campos abaixo para ${id ? 'atualizar' : 'criar'} a Análise Preliminar de Risco.`}
            </p>
          </div>
        </div>
      </div>

      {isFieldMode ? (
        <div className="rounded-[var(--ds-radius-xl)] border border-emerald-400/25 bg-emerald-500/8 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                APR em campo
              </p>
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                Registre atividade, riscos e controles no local da operação. O rascunho continua salvo enquanto você avança no wizard.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center md:w-[260px]">
              <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/20 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Rascunho</p>
                <p className="mt-1 text-sm font-semibold text-white">Automático</p>
              </div>
              <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/20 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Uso</p>
                <p className="mt-1 text-sm font-semibold text-white">Obra / celular</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {id && currentApr && (
        <div className="sst-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--color-text)]">
                {currentApr.numero} | Versão {currentApr.versao || 1}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                Status: {currentApr.status}
                {currentApr.aprovado_em
                  ? ` | Aprovada em ${new Date(currentApr.aprovado_em).toLocaleString('pt-BR')}`
                  : ''}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {!isApproved && (
                <button
                  type="button"
                  onClick={handleFinalizeApr}
                  disabled={finalizing}
                  className={aprSuccessButtonCompactClass}
                >
                  {finalizing ? 'Aprovando...' : 'Aprovar APR'}
                </button>
              )}
              {isApproved && (
                <button
                  type="button"
                  onClick={handleCreateVersion}
                  disabled={creatingVersion}
                  className={aprPrimaryCompactButtonClass}
                >
                  {creatingVersion ? 'Criando...' : 'Criar nova versão'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {id && (
        <div className="sst-card p-4">
          <h2 className={aprSectionTitleClass}>Timeline da APR</h2>
          <AprTimeline logs={aprLogs} loading={loadingTimeline} />
        </div>
      )}

      {id && versionHistory.length > 1 && (
        <div className="sst-card p-4">
          <h2 className={aprSectionTitleClass}>
            Comparação entre versões
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className={aprLabelCompactClass}>
                Comparar com
              </label>
              <select
                value={compareTargetId}
                onChange={(e) => setCompareTargetId(e.target.value)}
                className={aprFieldClass}
              >
                <option value="">Selecione uma versão</option>
                {versionHistory
                  .filter((item) => item.id !== id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.numero} | v{item.versao} | {item.status}
                    </option>
                  ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleCompareVersions}
              disabled={!compareTargetId || comparing}
              className={aprNeutralButtonClass}
            >
              {comparing ? 'Comparando...' : 'Comparar'}
            </button>
          </div>

          {compareResult && (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-5">
              <MiniStat label="Base" value={compareResult.summary.totalBase} />
              <MiniStat label="Alvo" value={compareResult.summary.totalTarget} />
              <MiniStat label="Adicionados" value={compareResult.summary.added} />
              <MiniStat label="Removidos" value={compareResult.summary.removed} />
              <MiniStat label="Alterados" value={compareResult.summary.changed} />
            </div>
          )}
        </div>
      )}

      {id && currentApr?.risk_items && currentApr.risk_items.length > 0 && (
        <div className="sst-card p-4">
          <h2 className={aprSectionTitleClass}>
            Evidência fotográfica da equipe
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className={aprLabelCompactClass}>
                Item de risco
              </label>
              <select
                value={selectedRiskItemEvidence}
                onChange={(e) => setSelectedRiskItemEvidence(e.target.value)}
                className={aprFieldClass}
              >
                <option value="">Selecione</option>
                {currentApr.risk_items
                  .slice()
                  .sort((a, b) => a.ordem - b.ordem)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      #{item.ordem + 1} {item.atividade || item.condicao_perigosa || 'Risco'}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className={aprLabelCompactClass}>
                Foto da evidência
              </label>
              <input
                type="file"
                accept="image/*"
                aria-label="Selecionar foto da evidência da APR"
                onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                className={aprFileFieldClass}
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={evidenceLatitude}
                onChange={(e) => setEvidenceLatitude(e.target.value)}
                placeholder="Latitude"
                aria-label="Latitude da evidência"
                className={aprFieldClass}
              />
              <input
                type="text"
                value={evidenceLongitude}
                onChange={(e) => setEvidenceLongitude(e.target.value)}
                placeholder="Longitude"
                aria-label="Longitude da evidência"
                className={aprFieldClass}
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={evidenceAccuracy}
                onChange={(e) => setEvidenceAccuracy(e.target.value)}
                placeholder="Precisão (m)"
                aria-label="Precisão do GPS da evidência"
                className={aprFieldClass}
              />
              <button
                type="button"
                onClick={handleCaptureLocation}
                className={aprSoftPrimaryButtonClass}
              >
                Capturar GPS
              </button>
            </div>
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={handleUploadEvidence}
              disabled={uploadingEvidence || !selectedRiskItemEvidence || !evidenceFile}
              className={aprSuccessButtonClass}
            >
              {uploadingEvidence ? 'Enviando...' : 'Enviar evidência'}
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {aprEvidences
              .filter((item) =>
                selectedRiskItemEvidence
                  ? item.apr_risk_item_id === selectedRiskItemEvidence
                  : true,
              )
              .slice(0, 6)
              .map((item) => (
                <div
                  key={item.id}
                  className={aprSubtleMetaCardClass}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--ds-color-text-primary)]">
                      {item.original_name || 'Evidência'}
                    </span>
                    <span>{new Date(item.uploaded_at).toLocaleString('pt-BR')}</span>
                  </div>
                  <span>Hash SHA-256: {item.hash_sha256}</span>
                  {item.watermarked_hash_sha256 && (
                    <span>Hash watermark: {item.watermarked_hash_sha256}</span>
                  )}
                  {item.url && (
                    <div className="flex gap-3">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[var(--ds-color-text-primary)] hover:underline"
                      >
                        Abrir original
                      </a>
                      {item.watermarked_url && (
                        <a
                          href={item.watermarked_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-[var(--color-success)] hover:underline"
                        >
                          Abrir com watermark
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}
          </div>

          <div className="mt-4 rounded-[var(--ds-radius-lg)] border border-[var(--color-border-subtle)] bg-[color:var(--color-card-muted)]/30 p-3">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">
              Verificação criptográfica
            </h3>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={hashToVerify}
                onChange={(e) => setHashToVerify(e.target.value)}
                placeholder="Cole o hash SHA-256 da evidência"
                aria-label="Hash SHA-256 para verificação"
                className={aprFieldClass}
              />
              <button
                type="button"
                onClick={handleVerifyHash}
                disabled={verifyingHash}
                className={aprNeutralButtonClass}
              >
                {verifyingHash ? 'Validando...' : 'Validar hash'}
              </button>
            </div>
            {verificationResult && (
              <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                {verificationResult.verified
                  ? `Hash válido (${verificationResult.matchedIn === 'watermarked' ? 'imagem com watermark' : 'imagem original'}).`
                  : verificationResult.message || 'Hash não validado.'}
              </p>
            )}
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit((data) => {
          submitIntentRef.current = 'save';
          return onSubmit(data);
        })}
        className="space-y-6"
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="ds-dashboard-panel overflow-hidden">
            <div className="border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/16 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-muted)]">
                Wizard operacional
              </p>
              <h2 className="mt-2 text-lg font-bold text-[var(--ds-color-text-primary)]">
                Emissão operacional da APR
              </h2>
              <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
                Conduza a análise por etapas com foco em preenchimento técnico, revisão e emissão governada.
              </p>
            </div>
            <div className="grid gap-4 px-5 py-5 lg:grid-cols-3">
              {APR_STEPS.map((step) => {
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
                    className={`w-full rounded-[var(--ds-radius-lg)] border px-4 py-4 text-left transition-all ${
                      isActive
                        ? 'border-[var(--ds-color-action-primary)] bg-[var(--ds-color-action-primary)]/12 shadow-[var(--ds-shadow-sm)]'
                        : isCompleted
                          ? 'border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] hover:border-[var(--ds-color-success)]/50'
                          : 'border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]/75'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                          isActive
                            ? 'bg-[var(--ds-color-action-primary)] text-[var(--color-text-inverse)]'
                            : isCompleted
                              ? 'bg-[color:var(--ds-color-success-subtle)] text-[var(--color-success)]'
                              : 'bg-[var(--ds-color-surface-muted)]/22 text-[var(--ds-color-text-muted)]'
                        }`}
                      >
                        {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">{step.title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-[var(--ds-color-text-muted)]">{step.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div className="ds-dashboard-panel px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-muted)]">
                    Resumo da APR
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                    {tituloApr || 'Título ainda não definido'}
                  </p>
                </div>
                {draftStorageKey && draftRestored ? (
                  <span className="rounded-full border border-[var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-warning)]">
                    Rascunho restaurado
                  </span>
                ) : null}
              </div>

              <div className="mt-4 space-y-3 text-sm text-[var(--ds-color-text-secondary)]">
                <SummaryRow label="Empresa" value={selectedCompany?.razao_social || 'Não definida'} />
                <SummaryRow label="Obra" value={selectedSite?.nome || 'Não definida'} />
                <SummaryRow label="Elaborador" value={selectedElaborador?.nome || 'Não definido'} />
                <SummaryRow label="Status" value={watch('status') || 'Pendente'} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <WizardMetric label="Linhas APR" value={String(totalRiskLines)} tone="default" />
                <WizardMetric label="Participantes" value={String(selectedParticipantIds.length)} tone="info" />
                <WizardMetric label="Assinaturas" value={String(completedSignatures)} tone="success" />
                <WizardMetric label="Evidências" value={String(aprEvidences.length)} tone="warning" />
              </div>

              {selectedParticipantIds.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedParticipantIds.slice(0, 5).map((participantId) => {
                    const participant = filteredUsers.find((item) => item.id === participantId);
                    return (
                      <span
                        key={participantId}
                        className="rounded-full border border-[var(--color-border-subtle)] bg-[color:var(--color-card-muted)]/20 px-2.5 py-1 text-xs font-semibold text-[var(--color-text-secondary)]"
                      >
                        {participant?.nome || 'Participante'}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <div className={`mt-4 ${aprWarningInlineClass}`}>
                  Defina participantes e assinaturas antes de concluir a APR.
                </div>
              )}
            </div>

            <div className={aprDangerInlineClass}>
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Não finalize a APR sem revisar a matriz de risco, controles sugeridos e evidências associadas ao trabalho.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {currentStep === 1 && (
            <div className={aprInteractivePanelClass}>
              <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--color-text)]">
                  Informações Básicas
                  <span className="h-2 w-2 rounded-full bg-[var(--ds-color-action-primary)]"></span>
                </h2>
                {aiEnabled && (
                  <button
                    type="button"
                    onClick={handleAiAnalysis}
                    disabled={analyzing}
                    className="group flex items-center justify-center space-x-2 rounded-[var(--ds-radius-md)] bg-[var(--component-button-primary-bg)] px-4 py-2.5 text-sm font-bold text-[var(--color-text-inverse)] shadow-[var(--ds-shadow-md)] transition-all hover:-translate-y-px hover:shadow-[var(--ds-shadow-lg)] active:scale-95 disabled:opacity-50"
                  >
                    {analyzing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 group-hover:rotate-12 transition-transform" />
                    )}
                    <span>Analisar com GST</span>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className={aprLabelClass}>Número da APR</label>
              <input
                type="text"
                {...register('numero')}
                className={cn(
                  aprFieldClass,
                  errors.numero && aprFieldErrorClass
                )}
                placeholder="Ex: 2024/001"
              />
              {errors.numero && <p className={aprErrorTextClass}>{errors.numero.message}</p>}
            </div>

            <div>
              <label className={aprLabelClass}>Título da APR</label>
              <input
                type="text"
                {...register('titulo')}
                className={cn(
                  aprFieldClass,
                  errors.titulo && aprFieldErrorClass
                )}
                placeholder="Ex: Instalação de Painéis Solares"
              />
              {errors.titulo && <p className={aprErrorTextClass}>{errors.titulo.message}</p>}
            </div>

            <div className="md:col-span-2">
              <label className={aprLabelClass}>Descrição/Escopo</label>
              <textarea
                {...register('descricao')}
                rows={3}
                className={aprFieldClass}
                placeholder="Descreva o escopo do trabalho..."
              />
            </div>

            <div className="md:col-span-2">
              <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-primary-border)] bg-[color:var(--ds-color-primary-subtle)]/45 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-primary)]">
                  Emissão documental
                </p>
                <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
                  O PDF final da APR não é mais anexado manualmente neste formulário. Depois da aprovação,
                  use a listagem para emitir, abrir ou compartilhar o documento governado.
                </p>
                {hasFinalPdf ? (
                  <p className="mt-2 text-sm font-semibold text-[var(--color-success)]">
                    Esta APR já possui PDF final emitido e está bloqueada para edição.
                  </p>
                ) : isApproved ? (
                  <p className="mt-2 text-sm font-semibold text-[var(--color-warning)]">
                    APR aprovada. O próximo passo é emitir o PDF final governado na listagem.
                  </p>
                ) : null}
              </div>
            </div>

            <div>
              <label className={aprLabelClass}>Empresa</label>
              <select
                {...register('company_id')}
                className={cn(
                  aprFieldClass,
                  errors.company_id && aprFieldErrorClass
                )}
                onChange={(e) => {
                  const companyId = e.target.value;
                  setValue('company_id', companyId);
                  setValue('site_id', '');
                  setValue('elaborador_id', '');
                  setValue('activities', []);
                  setValue('risks', []);
                  setValue('epis', []);
                  setValue('tools', []);
                  setValue('machines', []);
                  setValue('participants', []);
                }}
              >
                <option value="">Selecione uma empresa</option>
                {companies.map(company => (
                  <option key={company.id} value={company.id}>{company.razao_social}</option>
                ))}
              </select>
              {errors.company_id && <p className={aprErrorTextClass}>{errors.company_id.message}</p>}
            </div>

            <div>
              <label className={aprLabelClass}>Site/Obra</label>
              <select
                {...register('site_id')}
                disabled={!selectedCompanyId}
                className={cn(
                  aprFieldClass,
                  errors.site_id && aprFieldErrorClass,
                  !selectedCompanyId && aprFieldDisabledClass
                )}
              >
                <option value="">{selectedCompanyId ? 'Selecione um site' : 'Selecione uma empresa primeiro'}</option>
                {filteredSites.map(site => (
                  <option key={site.id} value={site.id}>{site.nome}</option>
                ))}
              </select>
              {errors.site_id && <p className={aprErrorTextClass}>{errors.site_id.message}</p>}
            </div>

            <div>
              <label className={aprLabelClass}>Elaborador</label>
              <select
                {...register('elaborador_id')}
                disabled={!selectedCompanyId}
                className={cn(
                  aprFieldClass,
                  errors.elaborador_id && aprFieldErrorClass,
                  !selectedCompanyId && aprFieldDisabledClass
                )}
              >
                <option value="">{selectedCompanyId ? 'Selecione um elaborador' : 'Selecione uma empresa primeiro'}</option>
                {filteredUsers.map(user => (
                  <option key={user.id} value={user.id}>{user.nome}</option>
                ))}
              </select>
              {errors.elaborador_id && <p className={aprErrorTextClass}>{errors.elaborador_id.message}</p>}
            </div>

            <div>
              <label className={aprLabelClass}>Status</label>
              <select
                {...register('status')}
                disabled
                className={cn(aprFieldClass, aprFieldDisabledClass)}
              >
                <option value="Pendente">Pendente</option>
                <option value="Aprovada">Aprovada</option>
                <option value="Cancelada">Cancelada</option>
                <option value="Encerrada">Encerrada</option>
              </select>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                O status da APR é controlado pelos fluxos formais de aprovação, reprovação e encerramento.
              </p>
            </div>

            <div>
              <label className={aprLabelClass}>Data Início</label>
              <input
                type="date"
                {...register('data_inicio')}
                className={aprFieldClass}
              />
            </div>

            <div>
              <label className={aprLabelClass}>Data Fim</label>
              <input
                type="date"
                {...register('data_fim')}
                className={aprFieldClass}
              />
            </div>

            <div className="flex flex-col space-y-3 md:flex-row md:space-x-6 md:space-y-0 md:col-span-2 pt-2">
              <label className="flex items-center space-x-3 cursor-pointer group">
                <input
                  type="checkbox"
                  {...register('is_modelo')}
                  className={aprCheckboxClass}
                />
                <span className="text-sm font-semibold text-[var(--color-text-secondary)] transition-colors group-hover:text-[var(--color-text)]">Salvar como Modelo</span>
              </label>

              {isModelo && (
                <label className="flex items-center space-x-3 cursor-pointer group animate-in slide-in-from-left-2 duration-300">
                  <input
                    type="checkbox"
                    {...register('is_modelo_padrao')}
                    className={aprCheckboxClass}
                  />
                  <span className="text-sm font-semibold text-[var(--color-text-secondary)] transition-colors group-hover:text-[var(--color-text)]">Definir como Modelo Padrão</span>
                </label>
              )}
            </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <>
              <div className="space-y-6">
          {(sophieSuggestedRisks.length > 0 || sophieMandatoryChecklists.length > 0) && (
            <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-primary-border)] bg-[color:var(--ds-color-primary-subtle)]/45 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
                    Sugestões da SOPHIE
                  </p>
                  <h3 className="mt-2 text-lg font-bold text-[var(--color-text)]">
                    Aplicações rápidas para esta APR
                  </h3>
                  <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                    Use um clique para refletir os riscos sugeridos na seleção e na planilha, ou abrir os checklists operacionais recomendados.
                  </p>
                </div>
                {sophieSuggestedRisks.length > 0 ? (
                  <button
                    type="button"
                    onClick={applyAllSuggestedAprRisks}
                    className={aprSoftPrimaryButtonClass}
                  >
                    Aplicar todos os riscos
                  </button>
                ) : null}
              </div>

              {sophieSuggestedRisks.length > 0 ? (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
                    Riscos sugeridos
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sophieSuggestedRisks.map((suggestion, index) => {
                      const alreadySelected =
                        (suggestion.id && selectedRiskIds.includes(suggestion.id)) ||
                        hasSuggestedRiskInMatrix(suggestion);
                      return (
                        <button
                          key={`${suggestion.label}-${index}`}
                          type="button"
                          onClick={() => applySuggestedAprRisk(suggestion)}
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                            alreadySelected
                              ? 'border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] text-[var(--color-success)]'
                              : 'border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] text-[var(--color-danger)] hover:bg-[color:var(--ds-color-danger-subtle)]/70',
                          )}
                        >
                          {suggestion.label}
                          {suggestion.category ? ` • ${suggestion.category}` : ''}
                          {alreadySelected ? ' • Aplicado' : ' • Aplicar'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {sophieMandatoryChecklists.length > 0 ? (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-secondary)]">
                    Checklists de apoio recomendados
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {sophieMandatoryChecklists.map((suggestion) => (
                      <div
                        key={suggestion.id}
                        className="rounded-[var(--ds-radius-lg)] border border-[var(--color-border-subtle)] bg-[color:var(--color-card)] p-3"
                      >
                        <p className="text-sm font-semibold text-[var(--color-text)]">
                          {suggestion.label}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                          {suggestion.reason}
                        </p>
                        <Link
                          href={buildChecklistSuggestionHref(suggestion)}
                          className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-primary)] hover:underline"
                        >
                          Abrir checklist recomendado
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
          <SectionGrid
            title="Participantes e Assinaturas"
            items={filteredUsers}
            selectedIds={selectedParticipantIds}
            onToggle={(id) => toggleSelection('participants', id)}
            signatures={signatures}
            color="violet"
          />
        </div>

        {/* Itens de Risco Detalhados - formato planilha */}
        <div className="sst-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-[var(--color-text)]">APR - Análise Preliminar de Riscos (Planilha)</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSuggestControls}
                disabled={suggestingControls}
                className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-primary-border)] bg-[color:var(--ds-color-primary-subtle)] px-4 py-2 text-sm font-semibold text-[var(--color-primary)] transition-colors hover:bg-[color:var(--ds-color-primary-subtle)]/78 disabled:opacity-60"
              >
                {suggestingControls ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Sugerir Controles
              </button>
              <button
                type="button"
                onClick={() => appendRisk({})}
                className="inline-flex items-center gap-2 rounded-[var(--ds-radius-md)] bg-[var(--component-button-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--color-text-inverse)] shadow-[var(--ds-shadow-sm)] transition-all hover:-translate-y-px hover:shadow-[var(--ds-shadow-md)]"
              >
                <Plus className="h-4 w-4" />
                Adicionar Linha
              </button>
            </div>
          </div>

          <div className="mb-4 rounded-[var(--ds-radius-xl)] border border-[var(--color-border)] bg-[color:var(--color-card-muted)]/24 p-4">
            <div className="flex flex-col gap-3 border-b border-[var(--color-border)] pb-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                  Caderno técnico da APR
                </p>
                <p className="mt-1 text-lg font-extrabold text-[var(--color-text)]">
                  APR - Análise Preliminar de Riscos
                </p>
              </div>
              <span className="rounded-full border border-[var(--color-border-subtle)] bg-[color:var(--color-card)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
                GST
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <SummaryMetaCard label="Descrição da atividade" value={tituloApr || '-'} />
              <SummaryMetaCard label="Empresa" value={selectedCompany?.razao_social || '-'} />
              <SummaryMetaCard label="Site / obra" value={selectedSite?.nome || '-'} />
              <SummaryMetaCard label="Data de elaboração" value={dataInicioApr || '-'} />
              <SummaryMetaCard label="Revisão / versão" value={`${new Date().toLocaleDateString('pt-BR')} / v${currentApr?.versao || 1}`} />
              <SummaryMetaCard label="Responsável" value={selectedElaborador?.nome || '-'} />
            </div>
          </div>

          {errors.itens_risco && (
            <div className="mb-4 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {errors.itens_risco.message}
            </div>
          )}

          <div className="space-y-4">
            {riskFields.length === 0 ? (
              <div className="rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--color-border-subtle)] bg-[color:var(--color-card-muted)]/18 px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                Nenhuma linha adicionada.
              </div>
            ) : null}

            {riskFields.map((field, index) => {
              const watchedItem = watchedRiskItems?.[index];
              const p = String(watchedItem?.probabilidade || '');
              const s = String(watchedItem?.severidade || '');
              const calc = calculateRiskCategory(p, s);

              return (
                <div
                  key={field.id}
                  className="rounded-[var(--ds-radius-xl)] border border-[var(--color-border-subtle)] bg-[color:var(--color-card)] p-4 shadow-[var(--ds-shadow-sm)]"
                >
                  <div className="mb-4 flex flex-col gap-3 border-b border-[var(--color-border-subtle)] pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
                        Linha da matriz
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">
                        Risco #{index + 1}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold', getCategoriaBadgeClass(calc.categoria))}>
                        {calc.categoria || 'Nao definida'}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRisk(index)}
                        className="rounded-[var(--ds-radius-md)] bg-[color:var(--ds-color-danger-subtle)] p-2 text-[var(--color-danger)] transition-colors hover:bg-[color:var(--ds-color-danger-subtle)]/78"
                        title="Remover linha"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="space-y-4">
                      <div>
                        <label className={aprLabelCompactClass}>Atividade / Processo</label>
                        <input
                          {...register(`itens_risco.${index}.atividade_processo`)}
                          className={aprFieldClass}
                          placeholder="Atividade/processo"
                        />
                      </div>
                      <div>
                        <label className={aprLabelCompactClass}>Agente ambiental</label>
                        <input
                          {...register(`itens_risco.${index}.agente_ambiental`)}
                          className={aprFieldClass}
                          placeholder="Agente ambiental"
                        />
                      </div>
                      <div>
                        <label className={aprLabelCompactClass}>Condição perigosa</label>
                        <input
                          {...register(`itens_risco.${index}.condicao_perigosa`)}
                          className={aprFieldClass}
                          placeholder="Condição perigosa"
                        />
                      </div>
                      <div>
                        <label className={aprLabelCompactClass}>Fontes / circunstâncias</label>
                        <input
                          {...register(`itens_risco.${index}.fontes_circunstancias`)}
                          className={aprFieldClass}
                          placeholder="Fontes ou circunstâncias"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className={aprLabelCompactClass}>Possíveis lesões</label>
                        <input
                          {...register(`itens_risco.${index}.possiveis_lesoes`)}
                          className={aprFieldClass}
                          placeholder="Possíveis lesões"
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className={aprLabelCompactClass}>Probabilidade</label>
                          <select
                            {...register(`itens_risco.${index}.probabilidade`)}
                            onChange={(event) => {
                              const value = event.target.value;
                              setValue(`itens_risco.${index}.probabilidade`, value, { shouldDirty: true, shouldValidate: true });
                              const severidade = String(watchedRiskItems?.[index]?.severidade || '');
                              const result = calculateRiskCategory(value, severidade);
                              setValue(`itens_risco.${index}.categoria_risco`, result.categoria, { shouldDirty: true, shouldValidate: true });
                            }}
                            className={aprFieldClass}
                          >
                            <option value="">Selecione</option>
                            <option value="1">1 - Baixa</option>
                            <option value="2">2 - Media</option>
                            <option value="3">3 - Alta</option>
                          </select>
                        </div>
                        <div>
                          <label className={aprLabelCompactClass}>Severidade</label>
                          <select
                            {...register(`itens_risco.${index}.severidade`)}
                            onChange={(event) => {
                              const value = event.target.value;
                              setValue(`itens_risco.${index}.severidade`, value, { shouldDirty: true, shouldValidate: true });
                              const probabilidade = String(watchedRiskItems?.[index]?.probabilidade || '');
                              const result = calculateRiskCategory(probabilidade, value);
                              setValue(`itens_risco.${index}.categoria_risco`, result.categoria, { shouldDirty: true, shouldValidate: true });
                            }}
                            className={aprFieldClass}
                          >
                            <option value="">Selecione</option>
                            <option value="1">1 - Baixa</option>
                            <option value="2">2 - Media</option>
                            <option value="3">3 - Alta</option>
                          </select>
                        </div>
                      </div>

                      <div className="rounded-[var(--ds-radius-lg)] border border-[var(--color-border-subtle)] bg-[color:var(--color-card-muted)]/24 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
                          Avaliação automática
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold', getCategoriaBadgeClass(calc.categoria))}>
                            {calc.categoria || 'Nao definida'}
                          </span>
                          <span className="text-sm text-[var(--color-text-secondary)]">
                            Prioridade: <strong>{calc.prioridade || '-'}</strong>
                          </span>
                          <span className="text-sm text-[var(--color-text-secondary)]">
                            Score: <strong>{calc.score || '-'}</strong>
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className={aprLabelCompactClass}>Medidas de prevenção</label>
                        <textarea
                          {...register(`itens_risco.${index}.medidas_prevencao`)}
                          rows={4}
                          className={aprFieldClass}
                          placeholder="Descreva as barreiras, controles e medidas preventivas."
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 space-y-3">
            <div className="overflow-x-auto rounded-[var(--ds-radius-lg)] border border-[var(--color-border-strong)] bg-[color:var(--color-card)]">
              <table className="apr-tech-table w-full min-w-[760px] table-auto text-sm">
                <thead>
                  <tr>
                    <th className="!bg-[color:var(--color-card-muted)]/42 !text-[var(--color-text)] w-[170px]">Severidade</th>
                    <th className="!bg-[color:var(--color-card-muted)]/42 !text-[var(--color-text)]">1 - Baixa</th>
                    <th className="!bg-[color:var(--color-card-muted)]/42 !text-[var(--color-text)]">2 - Média</th>
                    <th className="!bg-[color:var(--color-card-muted)]/42 !text-[var(--color-text)]">3 - Alta</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-bold">Descrição</td>
                    <td>Sem afastamento. Danos materiais inexistentes ou leves.</td>
                    <td>Danos materiais existentes sem perda de funcionalidade. Afastamento sem incapacidade permanente.</td>
                    <td>Afastamento com incapacidade parcial/total. Danos materiais com perda de funcionalidade.</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-[var(--ds-radius-lg)] border border-[var(--color-border-strong)] bg-[color:var(--color-card)]">
              <table className="apr-tech-table w-full min-w-[760px] table-auto text-sm">
                <thead>
                  <tr>
                    <th colSpan={2} className="!bg-[color:var(--color-card-muted)]/42 !text-[var(--color-text)]">
                      Probabilidade
                    </th>
                    <th className="!bg-[color:var(--color-card-muted)]/42 !text-[var(--color-text)]">1 - Baixa</th>
                    <th className="!bg-[color:var(--color-card-muted)]/42 !text-[var(--color-text)]">2 - Média</th>
                    <th className="!bg-[color:var(--color-card-muted)]/42 !text-[var(--color-text)]">3 - Alta</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-bold">1</td>
                    <td className="font-semibold">Baixa</td>
                    <td className="risk-badge-acceptable text-center font-bold">Aceitável</td>
                    <td className="risk-badge-acceptable text-center font-bold">Aceitável</td>
                    <td className="risk-badge-attention text-center font-bold">De Atenção</td>
                  </tr>
                  <tr>
                    <td className="font-bold">2</td>
                    <td className="font-semibold">Média</td>
                    <td className="risk-badge-acceptable text-center font-bold">Aceitável</td>
                    <td className="risk-badge-attention text-center font-bold">De Atenção</td>
                    <td className="risk-badge-substantial text-center font-bold">Substancial</td>
                  </tr>
                  <tr>
                    <td className="font-bold">3</td>
                    <td className="font-semibold">Alta</td>
                    <td className="risk-badge-attention text-center font-bold">De Atenção</td>
                    <td className="risk-badge-substantial text-center font-bold">Substancial</td>
                    <td className="risk-badge-critical text-center font-bold">Crítico</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto rounded-[var(--ds-radius-lg)] border border-[var(--color-border-strong)] bg-[color:var(--color-card)]">
              <table className="apr-tech-table w-full min-w-[860px] table-auto text-sm">
                <thead>
                  <tr>
                    <th className="!bg-[color:var(--color-card-muted)]/42 !text-[var(--color-text)] w-[170px]">Categoria</th>
                    <th className="!bg-[color:var(--color-card-muted)]/42 !text-[var(--color-text)] w-[220px]">Prioridade</th>
                    <th className="!bg-[color:var(--color-card-muted)]/42 !text-[var(--color-text)]">Critério de ação</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="risk-badge-acceptable text-center font-bold">Aceitável</td>
                    <td className="font-bold">Não prioritário</td>
                    <td>Não são requeridos controles adicionais. Condição dentro dos parâmetros.</td>
                  </tr>
                  <tr>
                    <td className="risk-badge-attention text-center font-bold">De Atenção</td>
                    <td className="font-bold">Prioridade básica</td>
                    <td>Reavaliar periodicamente e adotar medidas complementares quando necessário.</td>
                  </tr>
                  <tr>
                    <td className="risk-badge-substantial text-center font-bold">Substancial</td>
                    <td className="font-bold">Prioridade preferencial</td>
                    <td>Trabalho não deve ser iniciado/continuado sem redução de risco e controles eficazes.</td>
                  </tr>
                  <tr>
                    <td className="risk-badge-critical text-center font-bold">Crítico</td>
                    <td className="font-bold">Prioridade máxima</td>
                    <td>Interromper o processo e implementar ações imediatas antes da execução.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
            </>
          )}

          {currentStep === 3 && (
            <>
              <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-5 shadow-[var(--ds-shadow-sm)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-muted)]">
                  Revisão operacional
                </p>
                <h3 className="mt-2 text-lg font-bold text-[var(--ds-color-text-primary)]">
                  Validação final da APR
                </h3>
                <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
                  Revise a coerência da matriz de risco, os participantes assinantes e os anexos antes de persistir a análise.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/18 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                      Matriz de risco
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                      {totalRiskLines > 0 ? `${totalRiskLines} linha(s) preenchidas` : 'Nenhuma linha cadastrada'}
                    </p>
                  </div>
                  <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/18 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                      Participantes
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                      {selectedParticipantIds.length} selecionado(s) · {completedSignatures} assinatura(s)
                    </p>
                  </div>
                  <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/18 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">
                      Evidência documental
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                      {currentApr?.pdf_file_key
                        ? 'PDF final governado emitido'
                        : isApproved
                          ? 'Aguardando emissão final na listagem'
                          : 'Ainda não elegível para emissão final'}
                    </p>
                  </div>
                </div>
              </div>

              <details className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--ds-color-text-primary)]">
                  Auditoria avançada (opcional)
                </summary>
                <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
                  Utilize este bloco apenas quando o processo exigir registro formal de auditoria interna.
                </p>
                <div className="mt-4">
                  <AuditSection
                    register={register}
                    auditors={filteredUsers}
                  />
                </div>
              </details>
            </>
          )}

          <div className={cn(
            "flex flex-col gap-4 border-t border-[var(--ds-color-border-subtle)] pt-6 sm:flex-row sm:items-center sm:justify-between",
            isFieldMode && "sticky bottom-4 z-10 rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-strong)] bg-[var(--color-card)]/95 p-4 shadow-[var(--ds-shadow-lg)] backdrop-blur",
          )}>
            <div className="flex gap-2">
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={prevStep}
                  className={aprGhostActionClass}
                >
                  Voltar
                </button>
              ) : (
                <Link
                  href="/dashboard/aprs"
                  className={aprGhostActionClass}
                >
                  Cancelar
                </Link>
              )}
            </div>

            <div className={cn(
              "flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-0 sm:space-x-4",
              isFieldMode && "grid grid-cols-2 gap-3 sm:flex-none sm:space-x-0",
            )}>
              {currentStep >= 3 ? (
                hasFinalPdf ? (
                  <button
                    type="button"
                    disabled
                    className={cn(aprPrimarySubmitActionClass, isFieldMode && "min-h-12")}
                  >
                    <Save className="h-4 w-4" />
                    <span>APR bloqueada (PDF final emitido)</span>
                  </button>
                ) : isApproved ? (
                  <Link
                    href="/dashboard/aprs"
                    className={cn(aprPrimarySubmitActionClass, "inline-flex", isFieldMode && "min-h-12")}
                  >
                    <span>Ir para listagem e emitir PDF final</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        submitIntentRef.current = 'save_and_print';
                        void handleSubmit(onSubmit)();
                      }}
                      disabled={loading}
                      className={cn(aprGhostActionClass, 'inline-flex items-center justify-center gap-2', isFieldMode && "min-h-12")}
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Printer className="h-4 w-4" />
                      )}
                      <span>Salvar e imprimir</span>
                    </button>
                    <button
                      type="submit"
                      onClick={() => {
                        submitIntentRef.current = 'save';
                      }}
                      disabled={loading}
                      className={cn(aprPrimarySubmitActionClass, isFieldMode && "min-h-12")}
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      <span>{id ? 'Atualizar APR' : 'Salvar APR'}</span>
                    </button>
                  </>
                )
              ) : (
                <button
                  type="button"
                  onClick={nextStep}
                  className={cn(aprPrimaryActionClass, isFieldMode && "min-h-12")}
                >
                  <span>Próximo</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>

      <SignatureModal
        isOpen={isSignatureModalOpen}
        onClose={() => setIsSignatureModalOpen(false)}
        onSave={handleSaveSignature}
        userName={currentSigningUser?.nome || ''}
      />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[color:var(--color-card-muted)]/26 p-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="text-lg font-bold text-[var(--color-text)]">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold uppercase tracking-[0.11em] text-[var(--ds-color-text-muted)]">
        {label}
      </span>
      <span className="max-w-[15rem] truncate text-right text-sm font-semibold text-[var(--ds-color-text-primary)]">
        {value}
      </span>
    </div>
  );
}

function SummaryMetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={aprSubtleMetaCardClass}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="text-sm font-semibold text-[var(--color-text)]">{value}</p>
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
    default: 'bg-[color:var(--color-card-muted)]/18 text-[var(--color-text-secondary)]',
    info: 'bg-[color:var(--ds-color-info-subtle)] text-[var(--color-info)]',
    warning: 'bg-[color:var(--ds-color-warning-subtle)] text-[var(--color-warning)]',
    success: 'bg-[color:var(--ds-color-success-subtle)] text-[var(--color-success)]',
  };

  return (
    <div className={`rounded-[var(--ds-radius-lg)] px-3 py-3 ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-80">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

interface SectionItem {
  id: string;
  nome?: string;
  razao_social?: string;
  titulo?: string;
}

interface SectionGridProps {
  title: string;
  items: SectionItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  error?: string;
  signatures?: Record<string, { data: string; type: string }>;
  color?: 'blue' | 'red' | 'emerald' | 'slate' | 'indigo' | 'violet';
}

// Subcomponente para os grids de seleção
function SectionGrid({ title, items, selectedIds, onToggle, error, signatures, color = 'blue' }: SectionGridProps) {
  const accentDotClasses: Record<string, string> = {
    blue: 'bg-[var(--color-primary)]',
    red: 'bg-[var(--color-danger)]',
    emerald: 'bg-[var(--color-success)]',
    slate: 'bg-[var(--ds-color-action-secondary-active)]',
    indigo: 'bg-[var(--color-info)]',
    violet: 'bg-[var(--color-secondary)]',
  };

  const colorClasses: Record<string, string> = {
    blue: 'bg-[color:var(--ds-color-primary-subtle)] text-[var(--color-primary)] border-[var(--ds-color-primary-border)]',
    red: 'bg-[color:var(--ds-color-danger-subtle)] text-[var(--color-danger)] border-[var(--ds-color-danger-border)]',
    emerald: 'bg-[color:var(--ds-color-success-subtle)] text-[var(--color-success)] border-[var(--ds-color-success-border)]',
    slate: 'bg-[var(--ds-color-action-secondary)] text-[var(--color-text-secondary)] border-[var(--ds-color-action-secondary-border)]',
    indigo: 'bg-[color:var(--ds-color-info-subtle)] text-[var(--color-info)] border-[var(--ds-color-info-border)]',
    violet: 'bg-[color:var(--ds-color-accent-subtle)] text-[var(--color-secondary)] border-[var(--ds-color-accent-border)]',
  };

  const selectedColorClasses: Record<string, string> = {
    blue: 'bg-[var(--color-primary)] text-[var(--color-text-inverse)] border-transparent',
    red: 'bg-[var(--color-danger)] text-[var(--color-text-inverse)] border-transparent',
    emerald: 'bg-[var(--color-success)] text-[var(--color-text-inverse)] border-transparent',
    slate: 'bg-[var(--ds-color-action-secondary-active)] text-[var(--ds-color-action-secondary-foreground)] border-transparent',
    indigo: 'bg-[var(--color-info)] text-[var(--color-text-inverse)] border-transparent',
    violet: 'bg-[var(--color-secondary)] text-[var(--color-text-inverse)] border-transparent',
  };

  return (
    <div className="sst-card p-6 transition-shadow hover:shadow-md">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-[var(--color-text)]">
        {title}
        <span className={cn('h-2 w-2 rounded-full', accentDotClasses[color])}></span>
      </h2>
      {error && <p className="mb-4 flex items-center gap-1 text-xs text-[var(--color-danger)]"><AlertTriangle className="h-3 w-3" /> {error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => {
          const isSelected = selectedIds.includes(item.id);
          const hasSignature = signatures && signatures[item.id];
          
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              className={cn(
                'relative flex min-h-[64px] flex-col items-center justify-center rounded-xl border p-3.5 text-center text-sm font-semibold leading-snug transition-all hover:scale-[1.01] active:scale-[0.99]',
                isSelected ? selectedColorClasses[color] : colorClasses[color]
              )}
            >
              <span>{item.nome || item.razao_social || item.titulo}</span>
              {hasSignature && (
                <div className="mt-1 flex items-center space-x-1 text-[9px] uppercase tracking-tighter opacity-90">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  <span>Assinado</span>
                </div>
              )}
            </button>
          );
        })}
        {items.length === 0 && (
          <div className="col-span-full py-4 text-center text-sm italic text-[var(--color-text-muted)]">
            Nenhum item disponível para a empresa selecionada.
          </div>
        )}
      </div>
    </div>
  );
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function isUuidLike(value?: string | null) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim(),
  );
}

