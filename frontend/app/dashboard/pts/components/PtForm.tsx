'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ptsService } from '@/services/ptsService';
import { aprsService, Apr } from '@/services/aprsService';
import { sitesService, Site } from '@/services/sitesService';
import { companiesService, Company } from '@/services/companiesService';
import { usersService, User } from '@/services/usersService';
import { useForm, FormProvider } from 'react-hook-form';
import {
  ArrowLeft,
  Save,
  Sparkles,
  Loader2,
  CheckCircle2,
  Mail,
  ArrowRight,
  ClipboardCheck,
  FileText,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { aiService } from '@/services/aiService';
import { useAuth } from '@/context/AuthContext';
import { mailService } from '@/services/mailService';
import { SignatureModal } from '../../checklists/components/SignatureModal';
import { signaturesService } from '@/services/signaturesService';
import { AuditSection } from '@/components/AuditSection';
import { useFormSubmit } from '@/hooks/useFormSubmit';
import { toast } from 'sonner';
import { zodResolver } from '@hookform/resolvers/zod';
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

export function PtForm({ id }: PtFormProps) {
  const { user } = useAuth();
  const [fetching, setFetching] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [pdfKey, setPdfKey] = useState<string>('');
  
  const [aprs, setAprs] = useState<Apr[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Signature States
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [currentSigningUser, setCurrentSigningUser] = useState<User | null>(null);
  const [signatures, setSignatures] = useState<Record<string, { data: string; type: string }>>({});
  const [currentStep, setCurrentStep] = useState(1);
  const [draftRestored, setDraftRestored] = useState(false);

  const methods = useForm<PtFormData>({
    resolver: zodResolver(ptSchema),
    defaultValues: {
      numero: '',
      titulo: '',
      descricao: '',
      status: 'Pendente',
      data_hora_inicio: new Date().toISOString().slice(0, 16),
      data_hora_fim: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
      company_id: '',
      site_id: '',
      apr_id: '',
      responsavel_id: '',
      trabalho_altura: false,
      espaco_confinado: false,
      trabalho_quente: false,
      eletricidade: false,
      escavacao: false,
      ...initialChecklists,
      executantes: [],
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
    formState: { errors },
  } = methods;

  const draftStorageKey = useMemo(
    () => (id ? null : `compliancex.pt.wizard.draft.${user?.company_id || 'default'}`),
    [id, user?.company_id],
  );

  const selectedCompanyId = watch('company_id');
  const selectedSiteId = watch('site_id');
  const selectedResponsavelId = watch('responsavel_id');
  const selectedAprId = watch('apr_id');
  const selectedTitle = watch('titulo');
  const workAtHeight = watch('trabalho_altura');
  const workElectric = watch('eletricidade');
  const workHot = watch('trabalho_quente');
  const workConfined = watch('espaco_confinado');
  const workExcavation = watch('escavacao');
  const filteredSites = sites.filter(site => site.company_id === selectedCompanyId);
  const filteredAprs = aprs.filter(apr => apr.company_id === selectedCompanyId);
  const filteredUsers = users.filter(user => user.company_id === selectedCompanyId);
  const selectedExecutanteIds = useMemo(() => watch('executantes') || [], [watch]);
  const selectedCompany = companies.find((company) => company.id === selectedCompanyId);
  const selectedSite = filteredSites.find((site) => site.id === selectedSiteId);
  const selectedResponsavel = filteredUsers.find((responsavel) => responsavel.id === selectedResponsavelId);
  const selectedApr = filteredAprs.find((apr) => apr.id === selectedAprId);
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

  const { handleSubmit: onSubmit, loading } = useFormSubmit(
    async (data: PtFormData) => {
      let ptId = id;

      if (id) {
        await ptsService.update(id, data);
      } else {
        const newPt = await ptsService.create(data);
        ptId = newPt.id;
      }

      // Save signatures if we have a ptId
      if (ptId) {
        // Se houver um arquivo carregado no S3, atualizamos a PT com a chave
        if (pdfKey) {
          await ptsService.update(ptId, { pdf_file_key: pdfKey } as any);
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
    },
    {
      successMessage: id ? 'Permissão de Trabalho atualizada com sucesso!' : 'Permissão de Trabalho cadastrada com sucesso!',
      redirectTo: '/dashboard/pts',
      context: 'PT',
      onSuccess: () => {
        if (draftStorageKey && typeof window !== 'undefined') {
          window.localStorage.removeItem(draftStorageKey);
        }
      },
    }
  );

  useEffect(() => {
    async function loadData() {
      try {
        const [aprData, siteData, userData, companyData] = await Promise.all([
          aprsService.findAll(),
          sitesService.findAll(),
          usersService.findAll(),
          companiesService.findAll(),
        ]);
        setAprs(aprData);
        setSites(siteData);
        setUsers(userData);
        setCompanies(companyData);

        if (id) {
          const [pt, sigs] = await Promise.all([
            ptsService.findOne(id),
            signaturesService.findByDocument(id, 'PT')
          ]);

          // Pre-populate signatures state from backend
          const sigMap: Record<string, { data: string; type: string }> = {};
          sigs.forEach(s => {
            if (!s.user_id) return;
            sigMap[s.user_id] = { data: s.signature_data, type: s.type };
          });
          setSignatures(sigMap);

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
        } else if (draftStorageKey && typeof window !== 'undefined') {
          const rawDraft = window.localStorage.getItem(draftStorageKey);
          if (rawDraft) {
            const parsedDraft = JSON.parse(rawDraft) as {
              values?: Partial<PtFormData>;
              step?: number;
              signatures?: Record<string, { data: string; type: string }>;
            };

            if (parsedDraft.values) {
              reset({
                ...methods.getValues(),
                ...parsedDraft.values,
              });
            }

            if (parsedDraft.step && parsedDraft.step >= 1 && parsedDraft.step <= 3) {
              setCurrentStep(parsedDraft.step);
            }

            if (parsedDraft.signatures) {
              setSignatures(parsedDraft.signatures);
            }
            setDraftRestored(true);
          }
        }
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        toast.error('Erro ao carregar dados para o formulário.');
      } finally {
        setFetching(false);
      }
    }
    loadData();
  }, [draftStorageKey, id, methods, reset]);

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
        }),
      );
    });

    return () => subscription.unsubscribe();
  }, [currentStep, draftStorageKey, id, methods, signatures]);

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
      }),
    );
  }, [currentStep, draftStorageKey, id, methods, signatures]);

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
    const data = watch();
    if (!data.titulo) {
      toast.error('Preencha pelo menos o título para a análise do COMPLIANCE X.');
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

      toast.success('COMPLIANCE X analisou os riscos da PT!', {
        description: (
          <div className="mt-2 space-y-2">
            <p className="font-bold text-blue-700">{result.summary}</p>
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
      console.error('Erro na análise do COMPLIANCE X:', error);
      toast.error('Não foi possível realizar a análise no momento.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSendEmail = async () => {
    if (!id) return;
    const email = window.prompt('Digite o e-mail do destinatário:');
    if (!email) return;

    try {
      toast.info('Enviando documento...');
      await mailService.sendStoredDocument(id, 'PT', email);
      toast.success('Documento enviado com sucesso!');
    } catch (error) {
      console.error('Erro ao enviar email:', error);
      toast.error('Erro ao enviar o documento. Verifique se o PDF foi gerado.');
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
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            href="/dashboard/pts"
            className="group rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 group-hover:-translate-x-0.5 transition-transform" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {id ? 'Editar PT' : 'Nova PT'}
            </h1>
            <p className="text-sm text-gray-500">Preencha os campos abaixo para {id ? 'atualizar' : 'criar'} a Permissão de Trabalho.</p>
          </div>
        </div>
      </div>

      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-4 xl:sticky xl:top-28 xl:self-start">
            <div className="ds-dashboard-panel overflow-hidden">
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
                            ? 'border-emerald-400/25 bg-emerald-500/8 hover:border-emerald-300/40'
                            : 'border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]/75'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                            isActive
                              ? 'bg-[var(--ds-color-action-primary)] text-white'
                              : isCompleted
                                ? 'bg-emerald-500/18 text-emerald-200'
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

            <div className="ds-dashboard-panel px-5 py-4">
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
                  <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-200">
                    Rascunho restaurado
                  </span>
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
                    <span
                      key={risk}
                      className="rounded-full border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/20 px-2.5 py-1 text-[11px] font-semibold text-[var(--ds-color-text-secondary)]"
                    >
                      {risk}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-[var(--ds-radius-lg)] border border-amber-400/20 bg-amber-500/8 px-3 py-2 text-xs text-amber-100">
                  Marque os tipos de trabalho para habilitar os checklists específicos.
                </div>
              )}
            </div>

            <div className="rounded-[var(--ds-radius-xl)] border border-red-400/18 bg-red-500/8 px-4 py-3 text-sm text-red-100">
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Não avance sem validar bloqueios críticos, vigência documental e assinaturas mínimas dos executantes.
                </p>
              </div>
            </div>
          </aside>

          <div className="space-y-8">
            {currentStep === 1 && (
              <>
                <BasicInfoSection
                  companies={companies}
                  filteredSites={filteredSites}
                  filteredAprs={filteredAprs}
                  filteredUsers={filteredUsers}
                  analyzing={analyzing}
                  onAiAnalysis={handleAiAnalysis}
                  onPdfUploaded={(key) => setPdfKey(key)}
                />
                <RiskTypesSection />
                <RapidRiskAnalysisSection />
              </>
            )}

            {currentStep === 2 && (
              <>
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
              </>
            )}

            {currentStep === 3 && (
              <>
                <ResponsibleExecutorsSection
                  filteredUsers={filteredUsers}
                  selectedCompanyId={selectedCompanyId}
                  signatures={signatures}
                  onToggleExecutante={toggleExecutante}
                />
                {id && (
                  <div className="sst-card p-6 transition-shadow hover:shadow-md">
                    <h2 className="mb-6 text-lg font-bold text-gray-900 flex items-center gap-2">
                      Auditoria do Trabalho
                      <span className="h-2 w-2 rounded-full bg-purple-500"></span>
                    </h2>
                    <AuditSection 
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      register={register as any}
                      auditors={filteredUsers}
                    />
                  </div>
                )}
              </>
            )}

            <div className="flex flex-col gap-4 border-t border-[var(--ds-color-border-subtle)] pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2">
                {currentStep > 1 ? (
                  <button
                    type="button"
                    onClick={prevStep}
                    className="rounded-lg px-4 py-2.5 text-sm font-medium text-[#374151] transition-colors hover:bg-[#E5E7EB] border border-gray-300"
                  >
                    Voltar
                  </button>
                ) : (
                  <Link
                    href="/dashboard/pts"
                    className="rounded-lg px-4 py-2.5 text-sm font-medium text-[#374151] transition-colors hover:bg-[#E5E7EB] border border-gray-300"
                  >
                    Cancelar
                  </Link>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:space-x-4 sm:gap-0">
                {id && (
                  <button
                    type="button"
                    onClick={handleSendEmail}
                    className="flex items-center justify-center space-x-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50"
                  >
                    <Mail className="h-4 w-4" />
                    <span>Enviar por E-mail</span>
                  </button>
                )}
                
                {currentStep < 3 ? (
                  <button
                    type="button"
                    onClick={nextStep}
                    className="flex items-center justify-center space-x-2 rounded-lg bg-[#2563EB] px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-[#1E40AF]"
                  >
                    <span>Próximo</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center justify-center space-x-2 rounded-lg bg-[#2563EB] px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-[#1E40AF] disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span>{id ? 'Salvar Alterações' : 'Criar Permissão de Trabalho'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </FormProvider>

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
    info: 'bg-sky-500/10 text-sky-100',
    warning: 'bg-amber-500/10 text-amber-100',
    success: 'bg-emerald-500/10 text-emerald-100',
  };

  return (
    <div className={`rounded-[var(--ds-radius-lg)] px-3 py-3 ${tones[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}
