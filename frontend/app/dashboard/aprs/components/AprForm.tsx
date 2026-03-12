'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Apr, aprsService } from '@/services/aprsService';
import { activitiesService, Activity } from '@/services/activitiesService';
import { risksService, Risk } from '@/services/risksService';
import { episService, Epi } from '@/services/episService';
import { toolsService, Tool } from '@/services/toolsService';
import { machinesService, Machine } from '@/services/machinesService';
import { sitesService, Site } from '@/services/sitesService';
import { companiesService, Company } from '@/services/companiesService';
import { usersService, User } from '@/services/usersService';
import { useForm, useFieldArray } from 'react-hook-form';
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
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { aiService } from '@/services/aiService';
import { isAiEnabled } from '@/lib/featureFlags';
import { SignatureModal } from '../../checklists/components/SignatureModal';
import { signaturesService } from '@/services/signaturesService';
import { useFormSubmit } from '@/hooks/useFormSubmit';
import { AuditSection } from '@/components/AuditSection';
import { cn } from '@/lib/utils';
import { attachPdfIfProvided } from '@/lib/document-upload';
import { AprLogEntry, AprTimeline } from './AprTimeline';
import { useAuth } from '@/context/AuthContext';

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
}).superRefine((data, ctx) => {
  // Se anexou a APR já preenchida e assinada (PDF), não exigimos preencher o wizard inteiro.
  if (data.pdf_signed) return;

  if (!data.activities || data.activities.length < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['activities'],
      message: 'Selecione pelo menos uma atividade',
    });
  }
  if (!data.risks || data.risks.length < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['risks'],
      message: 'Selecione pelo menos um risco',
    });
  }
  if (!data.epis || data.epis.length < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['epis'],
      message: 'Selecione pelo menos um EPI',
    });
  }
  if (!data.itens_risco || data.itens_risco.length < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['itens_risco'],
      message: 'Adicione pelo menos um risco',
    });
  }
});

type AprFormData = z.infer<typeof aprSchema>;

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
    description: 'Atividades, riscos, EPIs, participantes e planilha técnica da APR.',
    icon: ClipboardList,
  },
  {
    id: 3,
    title: 'Governança',
    description: 'Auditoria, revisão final e persistência da análise.',
    icon: ShieldCheck,
  },
] as const;

const aprBackButtonClass =
  'group rounded-full p-2 text-[var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-card-muted)] hover:text-[var(--color-text)]';
const aprHeadingClass = 'text-2xl font-bold text-[var(--color-text)]';
const aprSubheadingClass = 'text-sm text-[var(--color-text-muted)]';
const aprSectionTitleClass = 'mb-3 text-sm font-bold text-[var(--color-text)]';
const aprLabelClass = 'mb-1 block text-sm font-semibold text-[var(--color-text-secondary)]';
const aprLabelCompactClass = 'mb-1 block text-xs font-semibold text-[var(--color-text-secondary)]';
const aprFieldClass =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--component-field-border)] bg-[image:var(--component-field-bg)] px-3 py-2 text-sm text-[var(--component-field-text)] shadow-[var(--component-field-shadow)] transition-all focus:border-[var(--component-field-border-focus)] focus:outline-none focus:shadow-[var(--component-field-shadow-focus)]';
const aprFieldCompactClass =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--component-field-border)] bg-[image:var(--component-field-bg)] px-2 py-2 text-sm text-[var(--component-field-text)] shadow-[var(--component-field-shadow)] transition-all focus:border-[var(--component-field-border-focus)] focus:outline-none focus:shadow-[var(--component-field-shadow-focus)]';
const aprFileFieldClass =
  'block w-full rounded-[var(--ds-radius-md)] border border-[var(--component-field-border)] bg-[image:var(--component-field-bg)] px-3 py-2 text-sm text-[var(--component-field-text)] shadow-[var(--component-field-shadow)] transition-all focus:border-[var(--component-field-border-focus)] focus:outline-none focus:shadow-[var(--component-field-shadow-focus)] file:mr-4 file:rounded-[var(--ds-radius-sm)] file:border-0 file:bg-[color:var(--color-card-muted)] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[var(--color-text-secondary)] hover:file:bg-[color:var(--ds-color-primary-subtle)]';
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
const aprSoftSuccessButtonClass =
  'rounded-[var(--ds-radius-md)] border border-[var(--ds-color-success-border)] bg-[color:var(--ds-color-success-subtle)] px-3 py-2 text-xs font-semibold text-[var(--color-success)] transition-colors hover:bg-[color:var(--ds-color-success-subtle)]/78 disabled:opacity-60';
const aprInteractivePanelClass =
  'rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[image:var(--component-card-bg)] p-6 shadow-[var(--component-card-shadow)] transition-shadow hover:shadow-[var(--component-card-shadow-elevated)]';
const aprSubtleMetaCardClass =
  'flex flex-col gap-1 rounded-[var(--ds-radius-lg)] border border-[var(--color-border-subtle)] bg-[color:var(--color-card)] p-3 text-xs text-[var(--color-text-secondary)]';
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
  const { user } = useAuth();
  const [fetching, setFetching] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
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
  const [generatingReport, setGeneratingReport] = useState(false);
  const [custodyReportDigest, setCustodyReportDigest] = useState<string>('');
  const [downloadingCustodyPdf, setDownloadingCustodyPdf] = useState(false);
  
  const [activities, setActivities] = useState<Activity[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [epis, setEpis] = useState<Epi[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);

  // Signature States
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [currentSigningUser, setCurrentSigningUser] = useState<User | null>(null);
  const [signatures, setSignatures] = useState<Record<string, { data: string; type: string }>>({});
  const [currentStep, setCurrentStep] = useState(1);
  const [draftRestored, setDraftRestored] = useState(false);

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
      titulo: '',
      descricao: '',
      status: 'Pendente',
      is_modelo: false,
      is_modelo_padrao: false,
      data_inicio: new Date().toISOString().split('T')[0],
      data_fim: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      company_id: '',
      site_id: '',
      elaborador_id: '',
      activities: [],
      risks: [],
      epis: [],
      tools: [],
      machines: [],
      participants: [],
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
  const filteredActivities = activities.filter(activity => activity.company_id === selectedCompanyId);
  const filteredRisks = risks.filter(risk => risk.company_id === selectedCompanyId);
  const filteredEpis = epis.filter(epi => epi.company_id === selectedCompanyId);
  const filteredTools = tools.filter(tool => tool.company_id === selectedCompanyId);
  const filteredMachines = machines.filter(machine => machine.company_id === selectedCompanyId);
  const draftStorageKey = useMemo(
    () => (id ? null : `gst.apr.wizard.draft.${user?.company_id || 'default'}`),
    [id, user?.company_id],
  );
  const legacyDraftStorageKey = useMemo(
    () => (id ? null : `compliancex.apr.wizard.draft.${user?.company_id || 'default'}`),
    [id, user?.company_id],
  );
  
  const selectedActivityIds = watch('activities') || [];
  const selectedRiskIds = watch('risks') || [];
  const selectedEpiIds = watch('epis') || [];
  const selectedToolIds = watch('tools') || [];
  const selectedMachineIds = watch('machines') || [];
  const selectedParticipantIds = watch('participants') || [];
  const isModelo = watch('is_modelo');
  const isApproved = currentApr?.status === 'Aprovada';
  const signedPdfMode = Boolean(watch('pdf_signed')) || Boolean(currentApr?.pdf_file_key);
  const aiEnabled = isAiEnabled();
  const selectedCompany = companies.find((company) => company.id === selectedCompanyId);
  const selectedSite = sites.find((site) => site.id === selectedSiteId);
  const selectedElaborador = users.find((user) => user.id === selectedElaboradorId);

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

  const { handleSubmit: onSubmit, loading } = useFormSubmit(
    async (data: AprFormData) => {
      if (id && isApproved) {
        throw new Error('APR aprovada está bloqueada para edição. Crie uma nova versão.');
      }

      let aprId = id;
      // Remove campo interno (não existe no DTO do backend) e força status Aprovada quando há PDF assinado.
      const { pdf_signed, ...payload } = data as any;
      const finalPayload = {
        ...payload,
        status: signedPdfMode ? 'Aprovada' : payload.status,
      } as AprFormData;
      
      if (id) {
        await aprsService.update(id, finalPayload);
      } else {
        const newApr = await aprsService.create(finalPayload);
        aprId = newApr.id;
      }

      // Save signatures if we have an aprId
      if (aprId) {
        await attachPdfIfProvided(aprId, pdfFile, aprsService.attachFile);

        const signaturePromises = Object.entries(signatures).map(([userId, sig]) => 
          signaturesService.create({
            user_id: userId,
            document_id: aprId as string,
            document_type: 'APR',
            signature_data: sig.data,
            type: sig.type
          })
        );
        
        if (signaturePromises.length > 0) {
          await Promise.all(signaturePromises);
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
    },
    {
      successMessage: id ? 'APR atualizada com sucesso!' : 'APR cadastrada com sucesso!',
      redirectTo: '/dashboard/aprs',
      context: 'APR',
      onSuccess: () => {
        if (draftStorageKey && typeof window !== 'undefined') {
          window.localStorage.removeItem(draftStorageKey);
        }
        if (legacyDraftStorageKey && typeof window !== 'undefined') {
          window.localStorage.removeItem(legacyDraftStorageKey);
        }
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
    if (!confirm('Deseja finalizar e aprovar esta APR?')) return;

    try {
      setFinalizing(true);
      const updated = await aprsService.finalize(id);
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
      console.error('Erro ao finalizar APR:', error);
      toast.error('Não foi possível finalizar a APR.');
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

  const handleGenerateCustodyReport = useCallback(async () => {
    if (!id) return;
    try {
      setGeneratingReport(true);
      const report = await aprsService.getEvidenceCustodyReport(id);
      setCustodyReportDigest(report.chain_digest_sha256);
      toast.success('Relatório de cadeia de custódia gerado.');
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      toast.error('Não foi possível gerar o relatório.');
    } finally {
      setGeneratingReport(false);
    }
  }, [id]);

  const handleDownloadCustodyPdf = useCallback(async () => {
    if (!id) return;
    try {
      setDownloadingCustodyPdf(true);
      const response = await aprsService.downloadEvidenceCustodyPdf(id);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const disposition = response.headers['content-disposition'] as string | undefined;
      const fallbackName = `apr-custody-${id}.pdf`;
      const fileName =
        disposition?.match(/filename="([^"]+)"/)?.[1] ||
        disposition?.match(/filename=([^;]+)/)?.[1] ||
        fallbackName;
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      const signature = response.headers['x-document-signature'] as string | undefined;
      if (signature) {
        toast.success(`PDF gerado e assinado (${signature.slice(0, 12)}...)`);
      } else {
        toast.success('PDF de custódia baixado.');
      }
    } catch (error) {
      console.error('Erro ao baixar PDF de custódia:', error);
      toast.error('Falha ao baixar PDF de custódia.');
    } finally {
      setDownloadingCustodyPdf(false);
    }
  }, [id]);

  useEffect(() => {
    async function loadData() {
      try {
        let companySeedId = user?.company_id || '';

        const loadCompanies = async (selectedCompanyId?: string) => {
          let nextCompanies: Company[] = [];

          if (user?.profile?.nome === 'Administrador Geral') {
            const companiesPage = await companiesService.findPaginated({
              page: 1,
              limit: 100,
            });
            nextCompanies = companiesPage.data;
            if (
              selectedCompanyId &&
              !nextCompanies.some((company) => company.id === selectedCompanyId)
            ) {
              try {
                const selectedCompany = await companiesService.findOne(
                  selectedCompanyId,
                );
                nextCompanies = dedupeById([selectedCompany, ...nextCompanies]);
              } catch {
                nextCompanies = dedupeById(nextCompanies);
              }
            }
          } else if (selectedCompanyId) {
            try {
              const selectedCompany =
                await companiesService.findOne(selectedCompanyId);
              nextCompanies = [selectedCompany];
            } catch {
              nextCompanies = [];
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
          sigs.forEach(s => {
            if (!s.user_id) return;
            sigMap[s.user_id] = { data: s.signature_data, type: s.type };
          });
          setSignatures(sigMap);
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
            const parsedDraft = JSON.parse(rawDraft) as {
              values?: Partial<AprFormData>;
              step?: number;
              signatures?: Record<string, { data: string; type: string }>;
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

            setDraftRestored(true);
          } else {
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

      try {
        const [
          actPage,
          riskPage,
          epiPage,
          sitePage,
          userPage,
          toolPage,
          machinePage,
        ] = await Promise.all([
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

        setActivities((prev) =>
          dedupeById([
            ...prev.filter((item) => item.company_id === selectedCompanyId),
            ...actPage.data,
          ]),
        );
        setRisks((prev) =>
          dedupeById([
            ...prev.filter((item) => item.company_id === selectedCompanyId),
            ...riskPage.data,
          ]),
        );
        setEpis((prev) =>
          dedupeById([
            ...prev.filter((item) => item.company_id === selectedCompanyId),
            ...epiPage.data,
          ]),
        );
        setSites((prev) =>
          dedupeById([
            ...prev.filter((item) => item.company_id === selectedCompanyId),
            ...sitePage.data,
          ]),
        );
        setUsers((prev) =>
          dedupeById([
            ...prev.filter((item) => item.company_id === selectedCompanyId),
            ...userPage.data,
          ]),
        );
        setTools((prev) =>
          dedupeById([
            ...prev.filter((item) => item.company_id === selectedCompanyId),
            ...toolPage.data,
          ]),
        );
        setMachines((prev) =>
          dedupeById([
            ...prev.filter((item) => item.company_id === selectedCompanyId),
            ...machinePage.data,
          ]),
        );
      } catch (error) {
        console.error('Erro ao carregar catálogos da APR:', error);
        toast.error('Erro ao carregar catálogos da APR.');
      }
    }

    void loadCompanyScopedCatalogs();
  }, [selectedCompanyId]);

  useEffect(() => {
    if (id || selectedCompanyId) return;
    const companyId = user?.company_id;
    if (!companyId) return;
    setValue('company_id', companyId);
    if (user?.site_id) {
      setValue('site_id', user.site_id);
    }
    if (user?.id) {
      setValue('elaborador_id', user.id);
      setValue('participants', [user.id]);
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
      const updated = [...current, currentSigningUser.id];
      setValue('participants', updated, { shouldValidate: true });
      toast.success(`Assinatura de ${currentSigningUser.nome} capturada!`);
    }
  }, [currentSigningUser, setValue, watch]);

  const nextStep = useCallback(async () => {
    let fields: (keyof AprFormData)[] = [];

    if (currentStep === 1) {
      fields = ['numero', 'titulo', 'company_id', 'site_id', 'elaborador_id', 'data_inicio', 'data_fim'];
    } else if (currentStep === 2) {
      fields = ['activities', 'risks', 'epis', 'participants', 'itens_risco'];
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
    <div className="ds-form-page mx-auto max-w-4xl space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
            <h1 className={aprHeadingClass}>
              {id ? 'Editar APR' : 'Nova APR'}
            </h1>
            <p className={aprSubheadingClass}>Preencha os campos abaixo para {id ? 'atualizar' : 'criar'} a Análise Preliminar de Risco.</p>
          </div>
        </div>
      </div>

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
                  {finalizing ? 'Finalizando...' : 'Finalizar APR'}
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
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={handleGenerateCustodyReport}
                disabled={generatingReport}
                className={aprSoftPrimaryButtonClass}
              >
                {generatingReport ? 'Gerando relatório...' : 'Gerar cadeia de custódia'}
              </button>
              <button
                type="button"
                onClick={handleDownloadCustodyPdf}
                disabled={downloadingCustodyPdf}
                className={aprSoftSuccessButtonClass}
              >
                {downloadingCustodyPdf ? 'Baixando PDF...' : 'Baixar PDF assinado'}
              </button>
              {custodyReportDigest && (
                <span className="text-[11px] text-[var(--color-text-secondary)]">
                  Digest da cadeia: {custodyReportDigest}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="ds-dashboard-panel overflow-hidden">
            <div className="border-b border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/16 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-muted)]">
                Wizard operacional
              </p>
              <h2 className="mt-2 text-lg font-bold text-[var(--ds-color-text-primary)]">
                Emissão guiada de APR
              </h2>
              <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
                Conduza a análise por etapas para garantir consistência técnica, revisão e rastreabilidade.
              </p>
            </div>
            <div className="space-y-3 px-4 py-4">
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
                    className={`w-full rounded-[var(--ds-radius-lg)] border px-4 py-3 text-left transition-all ${
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
                        <p className="mt-1 text-xs text-[var(--ds-color-text-muted)]">{step.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

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
              <WizardMetric label="Atividades" value={String(selectedActivityIds.length)} tone="info" />
              <WizardMetric label="Riscos" value={String(selectedRiskIds.length)} tone="warning" />
              <WizardMetric label="Linhas APR" value={String(totalRiskLines)} tone="default" />
              <WizardMetric label="Assinaturas" value={String(completedSignatures)} tone="success" />
            </div>

            {selectedParticipantIds.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedParticipantIds.slice(0, 5).map((participantId) => {
                  const participant = filteredUsers.find((item) => item.id === participantId);
                  return (
                    <span
                      key={participantId}
                      className="rounded-full border border-[var(--color-border-subtle)] bg-[color:var(--color-card-muted)]/20 px-2.5 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)]"
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
        </aside>

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
              <label className={aprLabelClass}>Anexar PDF da APR (opcional)</label>
              <input
                type="file"
                accept="application/pdf"
                aria-label="Selecionar PDF da APR"
                disabled={Boolean(currentApr?.pdf_file_key)}
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  setPdfFile(file);
                  const hasSignedPdf = Boolean(file) || Boolean(currentApr?.pdf_file_key);
                  setValue('pdf_signed', hasSignedPdf, { shouldDirty: true, shouldValidate: true });
                  if (hasSignedPdf) {
                    setValue('status', 'Aprovada', { shouldDirty: true, shouldValidate: true });
                  }
                }}
                className={aprFileFieldClass}
              />
              {(pdfFile || currentApr?.pdf_file_key) && (
                <div className="mt-2">
                  <p className={aprWarningInlineClass}>
                    PDF assinado anexado: ao salvar, a APR será marcada como <strong>Aprovada</strong> e ficará bloqueada para edição.
                  </p>
                </div>
              )}
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
                disabled={signedPdfMode}
                className={cn(aprFieldClass, signedPdfMode && aprFieldDisabledClass)}
              >
                <option value="Pendente">Pendente</option>
                <option value="Aprovada">Aprovada</option>
                <option value="Cancelada">Cancelada</option>
                <option value="Encerrada">Encerrada</option>
              </select>
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
          <SectionGrid
            title="Atividades"
            items={filteredActivities}
            selectedIds={selectedActivityIds}
            onToggle={(id) => toggleSelection('activities', id)}
            error={errors.activities?.message}
            color="blue"
          />
          <SectionGrid
            title="Riscos"
            items={filteredRisks}
            selectedIds={selectedRiskIds}
            onToggle={(id) => toggleSelection('risks', id)}
            error={errors.risks?.message}
            color="red"
          />
          <SectionGrid
            title="EPIs"
            items={filteredEpis}
            selectedIds={selectedEpiIds}
            onToggle={(id) => toggleSelection('epis', id)}
            error={errors.epis?.message}
            color="emerald"
          />
          <SectionGrid
            title="Ferramentas"
            items={filteredTools}
            selectedIds={selectedToolIds}
            onToggle={(id) => toggleSelection('tools', id)}
            color="slate"
          />
          <SectionGrid
            title="Máquinas"
            items={filteredMachines}
            selectedIds={selectedMachineIds}
            onToggle={(id) => toggleSelection('machines', id)}
            color="indigo"
          />
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

          <div className="mb-4 overflow-x-auto rounded-[var(--ds-radius-lg)] border border-[var(--color-border)] bg-[color:var(--color-card-muted)]/24">
            <div className="grid min-w-[980px] grid-cols-12 border-b border-[var(--color-border)]">
              <div className="col-span-2 border-r border-[var(--color-border)] bg-[color:var(--color-card-muted)]/42 px-3 py-2 text-xs font-bold text-[var(--color-text)]">
                CÓDIGO
              </div>
              <div className="col-span-7 border-r border-[var(--color-border)] px-3 py-2 text-center text-sm font-extrabold text-[var(--color-text)]">
                APR - ANÁLISE PRELIMINAR DE RISCOS
              </div>
              <div className="col-span-3 px-3 py-2 text-right text-xs font-semibold text-[var(--color-text-secondary)]">
                GST
              </div>
            </div>
            <div className="grid min-w-[980px] grid-cols-12 border-b border-[var(--color-border)] text-xs">
              <div className="col-span-2 border-r border-[var(--color-border)] bg-[var(--ds-color-accent)] px-3 py-2 font-bold text-[var(--color-text-inverse)]">
                Descrição da atividade
              </div>
              <div className="col-span-7 border-r border-[var(--color-border)] px-3 py-2 text-[var(--color-text)]">
                {tituloApr || '-'}
              </div>
              <div className="col-span-1 border-r border-[var(--color-border)] bg-[var(--ds-color-accent)] px-3 py-2 font-bold text-[var(--color-text-inverse)]">
                Empresa
              </div>
              <div className="col-span-2 px-3 py-2 text-[var(--color-text)]">
                {selectedCompany?.razao_social || '-'}
              </div>
            </div>
            <div className="grid min-w-[980px] grid-cols-12 border-b border-[var(--color-border)] text-xs">
              <div className="col-span-2 border-r border-[var(--color-border)] bg-[var(--ds-color-accent)] px-3 py-2 font-bold text-[var(--color-text-inverse)]">
                Data de elaboração
              </div>
              <div className="col-span-7 border-r border-[var(--color-border)] px-3 py-2 text-[var(--color-text)]">
                {dataInicioApr || '-'}
              </div>
              <div className="col-span-1 border-r border-[var(--color-border)] bg-[var(--ds-color-accent)] px-3 py-2 font-bold text-[var(--color-text-inverse)]">
                Site
              </div>
              <div className="col-span-2 px-3 py-2 text-[var(--color-text)]">
                {selectedSite?.nome || '-'}
              </div>
            </div>
            <div className="grid min-w-[980px] grid-cols-12 text-xs">
              <div className="col-span-2 border-r border-[var(--color-border)] bg-[var(--ds-color-accent)] px-3 py-2 font-bold text-[var(--color-text-inverse)]">
                Data revisão / versão
              </div>
              <div className="col-span-7 border-r border-[var(--color-border)] px-3 py-2 text-[var(--color-text)]">
                {`${new Date().toLocaleDateString('pt-BR')} / v${currentApr?.versao || 1}`}
              </div>
              <div className="col-span-1 border-r border-[var(--color-border)] bg-[var(--ds-color-accent)] px-3 py-2 font-bold text-[var(--color-text-inverse)]">
                Responsável
              </div>
              <div className="col-span-2 px-3 py-2 text-[var(--color-text)]">
                {selectedElaborador?.nome || '-'}
              </div>
            </div>
          </div>

          {errors.itens_risco && (
            <div className="mb-4 rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {errors.itens_risco.message}
            </div>
          )}

          <div className="overflow-x-auto rounded-[var(--ds-radius-lg)] border border-[var(--color-border-subtle)]">
            <table className="apr-sheet min-w-[1450px] w-full text-xs">
              <thead>
                <tr>
                  <th rowSpan={2} className="px-2 py-2">Atividades / Processos</th>
                  <th colSpan={4} className="px-2 py-2 !bg-[var(--ds-color-accent)]">Reconhecimento de Riscos</th>
                  <th colSpan={3} className="px-2 py-2 !bg-[var(--ds-color-warning)]">Avaliação de Riscos</th>
                  <th rowSpan={2} className="px-2 py-2 !bg-[var(--ds-color-accent)]">Medidas de Prevenção</th>
                  <th rowSpan={2} className="px-2 py-2 !bg-[var(--ds-color-text-primary)]">Ação</th>
                </tr>
                <tr>
                  <th className="px-2 py-2">Agente Ambiental</th>
                  <th className="px-2 py-2">Condição Perigosa</th>
                  <th className="px-2 py-2">Fontes / Circunstâncias</th>
                  <th className="px-2 py-2">Possíveis Lesões</th>
                  <th className="px-2 py-2">Probabilidade</th>
                  <th className="px-2 py-2">Severidade</th>
                  <th className="px-2 py-2">Categoria de Risco</th>
                </tr>
              </thead>
              <tbody>
                {riskFields.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">
                      Nenhuma linha adicionada.
                    </td>
                  </tr>
                )}
                {riskFields.map((field, index) => {
                  const p = watch(`itens_risco.${index}.probabilidade`);
                  const s = watch(`itens_risco.${index}.severidade`);
                  const calc = calculateRiskCategory(p, s);

                  return (
                    <tr key={field.id}>
                      <td className="p-2 align-top">
                        <input
                          {...register(`itens_risco.${index}.atividade_processo`)}
                          className={aprFieldCompactClass}
                          placeholder="Atividade/processo"
                        />
                      </td>
                      <td className="p-2 align-top">
                        <input
                          {...register(`itens_risco.${index}.agente_ambiental`)}
                          className={aprFieldCompactClass}
                        />
                      </td>
                      <td className="p-2 align-top">
                        <input
                          {...register(`itens_risco.${index}.condicao_perigosa`)}
                          className={aprFieldCompactClass}
                        />
                      </td>
                      <td className="p-2 align-top">
                        <input
                          {...register(`itens_risco.${index}.fontes_circunstancias`)}
                          className={aprFieldCompactClass}
                        />
                      </td>
                      <td className="p-2 align-top">
                        <input
                          {...register(`itens_risco.${index}.possiveis_lesoes`)}
                          className={aprFieldCompactClass}
                        />
                      </td>
                      <td className="p-2 align-top">
                        <select
                          {...register(`itens_risco.${index}.probabilidade`)}
                          onChange={(event) => {
                            const value = event.target.value;
                            setValue(`itens_risco.${index}.probabilidade`, value, { shouldDirty: true, shouldValidate: true });
                            const severidade = watch(`itens_risco.${index}.severidade`);
                            const result = calculateRiskCategory(value, severidade);
                            setValue(`itens_risco.${index}.categoria_risco`, result.categoria, { shouldDirty: true, shouldValidate: true });
                          }}
                          className={aprFieldCompactClass}
                        >
                          <option value="">-</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                        </select>
                      </td>
                      <td className="p-2 align-top">
                        <select
                          {...register(`itens_risco.${index}.severidade`)}
                          onChange={(event) => {
                            const value = event.target.value;
                            setValue(`itens_risco.${index}.severidade`, value, { shouldDirty: true, shouldValidate: true });
                            const probabilidade = watch(`itens_risco.${index}.probabilidade`);
                            const result = calculateRiskCategory(probabilidade, value);
                            setValue(`itens_risco.${index}.categoria_risco`, result.categoria, { shouldDirty: true, shouldValidate: true });
                          }}
                          className={aprFieldCompactClass}
                        >
                          <option value="">-</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                        </select>
                      </td>
                      <td className="p-2 align-top">
                        <div className="space-y-1">
                          <span className={cn('inline-block rounded px-2 py-1 text-[11px] font-semibold', getCategoriaBadgeClass(calc.categoria))}>
                            {calc.categoria || 'Não definida'}
                          </span>
                          <div className="text-[11px] text-[var(--color-text-secondary)]">Prioridade: {calc.prioridade || '-'}</div>
                          <div className="text-[11px] text-[var(--color-text-muted)]">Score: {calc.score || '-'}</div>
                        </div>
                      </td>
                      <td className="p-2 align-top">
                        <textarea
                          {...register(`itens_risco.${index}.medidas_prevencao`)}
                          rows={2}
                          className={aprFieldCompactClass}
                        />
                      </td>
                      <td className="p-2 align-top">
                        <button
                          type="button"
                          onClick={() => removeRisk(index)}
                          className="rounded-[var(--ds-radius-sm)] bg-[color:var(--ds-color-danger-subtle)] p-2 text-[var(--color-danger)] transition-colors hover:bg-[color:var(--ds-color-danger-subtle)]/78"
                          title="Remover linha"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-3">
            <div className="overflow-x-auto rounded-[var(--ds-radius-lg)] border border-[var(--color-border-strong)] bg-[color:var(--color-card)]">
              <table className="apr-tech-table w-full min-w-[860px] text-[11px]">
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
              <table className="apr-tech-table w-full min-w-[860px] text-[11px]">
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
              <table className="apr-tech-table w-full min-w-[860px] text-[11px]">
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
                      {pdfFile ? pdfFile.name : currentApr?.pdf_file_key ? 'PDF já anexado' : 'Sem PDF anexado'}
                    </p>
                  </div>
                </div>
              </div>

              <AuditSection
                register={register}
                auditors={filteredUsers}
              />
            </>
          )}

          <div className="flex flex-col gap-4 border-t border-[var(--ds-color-border-subtle)] pt-6 sm:flex-row sm:items-center sm:justify-between">
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

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-0 sm:space-x-4">
              {signedPdfMode || currentStep >= 3 ? (
                <button
                  type="submit"
                  disabled={loading || isApproved}
                  className={aprPrimarySubmitActionClass}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span>
                    {isApproved
                      ? 'APR bloqueada (aprovada)'
                      : signedPdfMode
                        ? 'Salvar APR (PDF assinado)'
                        : id
                          ? 'Atualizar APR'
                          : 'Salvar APR'}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={nextStep}
                  className={aprPrimaryActionClass}
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
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[color:var(--color-card-muted)]/26 p-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="text-lg font-bold text-[var(--color-text)]">{value}</p>
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
    default: 'bg-[color:var(--color-card-muted)]/18 text-[var(--color-text-secondary)]',
    info: 'bg-[color:var(--ds-color-info-subtle)] text-[var(--color-info)]',
    warning: 'bg-[color:var(--ds-color-warning-subtle)] text-[var(--color-warning)]',
    success: 'bg-[color:var(--ds-color-success-subtle)] text-[var(--color-success)]',
  };

  return (
    <div className={`rounded-[var(--ds-radius-lg)] px-3 py-3 ${tones[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">{label}</p>
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {items.map((item) => {
          const isSelected = selectedIds.includes(item.id);
          const hasSignature = signatures && signatures[item.id];
          
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              className={cn(
                'relative flex flex-col items-center justify-center rounded-xl border p-3 text-center text-xs font-bold transition-all hover:scale-[1.02] active:scale-[0.98]',
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

