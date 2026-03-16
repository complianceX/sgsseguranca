'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { checklistsService, Checklist } from '@/services/checklistsService';
import { sitesService, Site } from '@/services/sitesService';
import { usersService, User } from '@/services/usersService';
import { signaturesService } from '@/services/signaturesService';
import { SignatureModal } from './SignatureModal';
import { ExecutionItem } from './ExecutionItem';
import { TemplateItem } from './TemplateItem';
import { ChecklistFormData, ChecklistItemForm, checklistSchema } from '../types';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Image from 'next/image';
import { ArrowLeft, Bot, Save, Plus, PenTool, CheckCircle, Sparkles, Printer, Send } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { companiesService, Company } from '@/services/companiesService';
import { useAuth } from '@/context/AuthContext';
import { aiService } from '@/services/aiService';
import { isAiEnabled } from '@/lib/featureFlags';
import { useFormSubmit } from '@/hooks/useFormSubmit';
import { Button } from '@/components/ui/button';
import { openPdfForPrint, openUrlInNewTab } from '@/lib/print-utils';

interface ChecklistFormProps {
  id?: string;
  mode?: 'checklist' | 'template';
}

interface ChecklistSignatureState {
  signatureData: string;
  type: string;
  signedAt: string;
}

const panelClassName =
  'rounded-[var(--ds-radius-xl)] border border-[var(--component-card-border)] bg-[image:var(--component-card-bg)] shadow-[var(--component-card-shadow)]';
const fieldClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--component-field-border)] bg-[image:var(--component-field-bg)] px-4 py-2 text-sm text-[var(--component-field-text)] shadow-[var(--component-field-shadow)] transition-all focus:border-[var(--component-field-border-focus)] focus:outline-none focus:shadow-[var(--component-field-shadow-focus)]';
const labelClassName = 'mb-1 block text-sm font-medium text-[var(--color-text-secondary)]';
const conditionalToggleClassName =
  'flex items-center justify-center rounded-[var(--ds-radius-md)] border px-3 py-2 text-sm font-medium transition-all focus:outline-none focus:shadow-[var(--component-field-shadow-focus)]';

export function ChecklistForm({ id, mode = 'checklist' }: ChecklistFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateIdParam = searchParams.get('templateId') || 'none';
  const prefillCompanyId = searchParams.get('company_id') || '';
  const prefillSiteId = searchParams.get('site_id') || '';
  const prefillInspectorId =
    searchParams.get('inspetor_id') ||
    searchParams.get('user_id') ||
    '';
  const prefillTitle = searchParams.get('title') || '';
  const prefillDescription = searchParams.get('description') || '';
  const prefillEquipment = searchParams.get('equipamento') || '';
  const prefillMachine = searchParams.get('maquina') || '';
  const isFieldMode = searchParams.get('field') === '1';
  const { user } = useAuth();
  const isTemplateMode = mode === 'template';
  const isAdminGeneral = user?.profile?.nome === 'Administrador Geral';
  const [fetching, setFetching] = useState(true);
  const [currentChecklistId, setCurrentChecklistId] = useState<string | undefined>(id);
  const [currentChecklist, setCurrentChecklist] = useState<Checklist | null>(null);
  const [isOfflineQueued, setIsOfflineQueued] = useState(false);
  const [finalizingPdf, setFinalizingPdf] = useState(false);
  
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [checklistMode, setChecklistMode] = useState<'tool' | 'machine'>('tool');
  const [aiGenerating, setAiGenerating] = useState(false);

  // Estados para email e modal
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const activeChecklistId = currentChecklist?.id || currentChecklistId || id;

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setValue('foto_equipamento', reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Estados para assinaturas
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [currentSigningUser, setCurrentSigningUser] = useState<User | null>(null);
  const [signatures, setSignatures] = useState<Record<string, ChecklistSignatureState>>({});
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [templateLocalVersion, setTemplateLocalVersion] = useState(1);
  const draftBootstrappedRef = useRef(false);
  const draftSaveTimerRef = useRef<number | null>(null);

  const draftStorageKey = useMemo(() => {
    if (id) return null;
    return `checklist.form.draft.${mode}.${user?.id || 'anon'}.${templateIdParam}`;
  }, [id, mode, user?.id, templateIdParam]);

  const templateVersionStorageKey = useMemo(() => {
    if (!isTemplateMode) return null;
    return `checklist.template.local-version.${currentChecklistId || id || templateIdParam}`;
  }, [isTemplateMode, currentChecklistId, id, templateIdParam]);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm<ChecklistFormData>({
    resolver: zodResolver(checklistSchema),
    defaultValues: {
      titulo: prefillTitle || (isTemplateMode ? '' : 'Checklist de Inspeção'),
      descricao: prefillDescription,
      equipamento: prefillEquipment,
      maquina: prefillMachine,
      foto_equipamento: '',
      data: new Date().toISOString().split('T')[0],
      status: 'Pendente',
      company_id: prefillCompanyId || user?.company_id || '',
      site_id: prefillSiteId || user?.site_id || '',
      inspetor_id: prefillInspectorId || user?.id || '',
      categoria: 'SST',
      periodicidade: 'Diário',
      nivel_risco_padrao: 'Médio',
      ativo: true,
      itens: [{
        item: '',
        status: 'sim',
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
        peso: 1,
        observacao: ''
      }],
      is_modelo: isTemplateMode,
      auditado_por_id: '',
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'itens',
  });

  const selectedCompanyId = watch('company_id');
  const selectedSiteId = watch('site_id');
  const selectedInspectorId = watch('inspetor_id');
  const isFinalized = !isTemplateMode && Boolean(currentChecklist?.pdf_file_key);
  const hasAnySignature = Object.keys(signatures).length > 0;
  const filteredSites = sites.filter(site => !selectedCompanyId || site.company_id === selectedCompanyId);
  const filteredInspectors = users.filter(u => !selectedCompanyId || u.company_id === selectedCompanyId);
  const equipamentoValue = watch('equipamento');
  const maquinaValue = watch('maquina');
  const tituloValue = watch('titulo');
  const descricaoValue = watch('descricao');
  const openNcWithSophieHref = useMemo(() => {
    if (!activeChecklistId) return null;
    const params = new URLSearchParams();
    params.set('documentType', 'nc');
    params.set('source_type', 'checklist');
    params.set('source_reference', activeChecklistId);
    params.set('title', tituloValue || 'Não conformidade oriunda de checklist');
    params.set('description', descricaoValue || '');
    if (selectedSiteId) {
      params.set('site_id', selectedSiteId);
    }
    params.set(
      'source_context',
      `Checklist ${tituloValue || activeChecklistId} em revisão operacional.`,
    );
    return `/dashboard/sst-agent?${params.toString()}`;
  }, [activeChecklistId, descricaoValue, selectedSiteId, tituloValue]);

  // Load Data
  useEffect(() => {
    async function loadData() {
      try {
        const templateId = searchParams.get('templateId');
        const [checklistData, sigs] = await Promise.all([
          id ? checklistsService.findOne(id) : Promise.resolve(null),
          id ? signaturesService.findByChecklist(id) : Promise.resolve([]),
        ]);

        const selectedCompany =
          checklistData?.company_id || user?.company_id || '';

        let companiesData: Company[] = [];
        if (isAdminGeneral) {
          const companiesPage = await companiesService.findPaginated({
            page: 1,
            limit: 100,
          });
          companiesData = companiesPage.data;
          if (
            selectedCompany &&
            !companiesData.some((company) => company.id === selectedCompany)
          ) {
            try {
              const currentCompany = await companiesService.findOne(selectedCompany);
              companiesData = dedupeById([currentCompany, ...companiesData]);
            } catch {
              companiesData = dedupeById(companiesData);
            }
          }
        } else if (selectedCompany) {
          try {
            const currentCompany = await companiesService.findOne(selectedCompany);
            companiesData = [currentCompany];
          } catch {
            companiesData = [];
          }
        }

        setCompanies(dedupeById(companiesData));

        if (templateId && !id) {
          try {
            const template = await checklistsService.findOne(templateId);
            if (template) {
              setCurrentChecklist(null);
              setIsOfflineQueued(false);
              setValue('titulo', template.titulo);
              setValue('descricao', template.descricao || '');
              setValue('equipamento', template.equipamento || '');
              setValue('maquina', template.maquina || '');
              setValue('company_id', template.company_id || user?.company_id || '');
              setValue('site_id', '');
              setValue('inspetor_id', prefillInspectorId || user?.id || '');
              setValue('categoria', template.categoria || 'SST');
              setValue('periodicidade', template.periodicidade || 'Diário');
              setValue('nivel_risco_padrao', template.nivel_risco_padrao || 'Médio');
              
              if (template.itens && template.itens.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                replace(template.itens.map((item: any) => ({
                  item: item.item || '',
                  status: item.tipo_resposta === 'conforme' ? 'ok' : 'sim',
                  tipo_resposta: item.tipo_resposta || 'conforme',
                  obrigatorio: item.obrigatorio ?? true,
                  peso: item.peso ?? 1,
                  resposta: '',
                  observacao: '',
                  fotos: [],
                  id: item.id
                })));
              }
              
              if (template.equipamento) {
                setChecklistMode('tool');
              } else if (template.maquina) {
                setChecklistMode('machine');
              }
              toast.success('Modelo carregado! Preencha os dados da inspeção.');
            }
          } catch (error) {
            console.error('Erro ao carregar modelo:', error);
            toast.error('Erro ao carregar modelo.');
          }
        }

        if (checklistData) {
          const checklist = checklistData;
          setCurrentChecklist(checklist);
          setCurrentChecklistId(checklist.id);
          setIsOfflineQueued(false);
          reset({
            titulo: checklist.titulo,
            descricao: checklist.descricao || '',
            equipamento: checklist.equipamento || '',
            maquina: checklist.maquina || '',
            data: checklist.data ? new Date(checklist.data).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            status: checklist.status,
            company_id: checklist.company_id,
            site_id: checklist.site_id,
            inspetor_id: checklist.inspetor_id,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            itens: (checklist.itens || []).map((item: any) => ({
              item: item.item || '',
              status: typeof item.status === 'boolean' ? (item.status ? 'ok' : 'nok') : (item.status || 'ok'),
              tipo_resposta: item.tipo_resposta || 'conforme',
              obrigatorio: item.obrigatorio ?? true,
              peso: item.peso ?? 1,
              resposta: item.resposta,
              observacao: item.observacao || '',
              fotos: item.fotos || [],
              id: item.id
            })),
            is_modelo: checklist.is_modelo,
            categoria: checklist.categoria,
            periodicidade: checklist.periodicidade,
            nivel_risco_padrao: checklist.nivel_risco_padrao,
            ativo: checklist.ativo,
            auditado_por_id: checklist.auditado_por_id || '',
            data_auditoria: checklist.data_auditoria,
            resultado_auditoria: checklist.resultado_auditoria,
            notas_auditoria: checklist.notas_auditoria,
          });

          // Carregar assinaturas
          const sigsMap: Record<string, ChecklistSignatureState> = {};
          sigs.forEach(sig => {
            if (!sig.user_id) return;
            sigsMap[sig.user_id] = {
              signatureData: sig.signature_data,
              type: sig.type || 'digital',
              signedAt: sig.signed_at || sig.created_at || new Date().toISOString(),
            };
          });
          setSignatures(sigsMap);

          if (checklist.equipamento) {
            setChecklistMode('tool');
          } else if (checklist.maquina) {
            setChecklistMode('machine');
          }
        }
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        toast.error('Erro ao carregar dados do formulário.');
      } finally {
        setFetching(false);
      }
    }

    loadData();
  }, [id, isAdminGeneral, prefillInspectorId, replace, reset, router, searchParams, setValue, user?.company_id, user?.id]);

  useEffect(() => {
    async function loadTenantOptions() {
      if (!selectedCompanyId) {
        setSites([]);
        setUsers([]);
        return;
      }

      try {
        const [sitesPage, usersPage] = await Promise.all([
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

        let nextSites = sitesPage.data;
        if (selectedSiteId && !nextSites.some((site) => site.id === selectedSiteId)) {
          try {
            const currentSite = await sitesService.findOne(selectedSiteId);
            nextSites = dedupeById([currentSite, ...nextSites]);
          } catch {
            nextSites = dedupeById(nextSites);
          }
        } else {
          nextSites = dedupeById(nextSites);
        }

        let nextUsers = usersPage.data;
        if (
          selectedInspectorId &&
          !nextUsers.some((entry) => entry.id === selectedInspectorId)
        ) {
          try {
            const currentInspector = await usersService.findOne(selectedInspectorId);
            nextUsers = dedupeById([currentInspector, ...nextUsers]);
          } catch {
            nextUsers = dedupeById(nextUsers);
          }
        } else {
          nextUsers = dedupeById(nextUsers);
        }

        setSites(nextSites);
        setUsers(nextUsers);
      } catch (error) {
        console.error('Erro ao carregar opções do checklist:', error);
        setSites([]);
        setUsers([]);
      }
    }

    void loadTenantOptions();
  }, [selectedCompanyId, selectedInspectorId, selectedSiteId]);

  // Set default company
  useEffect(() => {
    if (id || selectedCompanyId || isAdminGeneral) return;
    const companyId = user?.company_id || null;
    if (!companyId) return;
    setValue('company_id', companyId);
  }, [id, selectedCompanyId, setValue, user?.company_id, isAdminGeneral]);

  // Sync Equipment/Machine with Title (only in regular mode creation)
  useEffect(() => {
    if (isTemplateMode || id) return;
    const base = checklistMode === 'machine' ? maquinaValue : equipamentoValue;
    if (!base) return;
    if (!tituloValue || tituloValue.startsWith('Checklist -')) {
      setValue('titulo', `Checklist - ${base}`);
    }
  }, [equipamentoValue, maquinaValue, checklistMode, isTemplateMode, setValue, tituloValue, id]);

  useEffect(() => {
    if (!templateVersionStorageKey || typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(templateVersionStorageKey);
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      setTemplateLocalVersion(parsed);
    } else {
      setTemplateLocalVersion(1);
    }
  }, [templateVersionStorageKey]);

  useEffect(() => {
    if (!draftStorageKey || fetching || draftBootstrappedRef.current) return;
    draftBootstrappedRef.current = true;
    if (typeof window === 'undefined') return;

    const rawDraft = window.localStorage.getItem(draftStorageKey);
    if (!rawDraft) return;

    try {
      const parsed = JSON.parse(rawDraft) as {
        savedAt?: number;
        checklistMode?: 'tool' | 'machine';
        values?: ChecklistFormData;
      };
      if (!parsed.values) return;

      reset(parsed.values);
      if (parsed.checklistMode) {
        setChecklistMode(parsed.checklistMode);
      }
      if (parsed.savedAt) {
        setDraftSavedAt(parsed.savedAt);
      }
      toast.info('Rascunho restaurado automaticamente.');
    } catch (error) {
      console.error('Erro ao restaurar rascunho de checklist:', error);
    }
  }, [draftStorageKey, fetching, reset]);

  useEffect(() => {
    if (!draftStorageKey || fetching) return;
    if (typeof window === 'undefined') return;

    const subscription = watch(() => {
      if (!draftBootstrappedRef.current) return;

      if (draftSaveTimerRef.current) {
        window.clearTimeout(draftSaveTimerRef.current);
      }

      draftSaveTimerRef.current = window.setTimeout(() => {
        const formValues = getValues();
        const snapshot: ChecklistFormData = {
          ...formValues,
          foto_equipamento: '',
          itens: formValues.itens.map((item) => ({
            ...item,
            fotos: [],
          })),
        };
        const now = Date.now();
        window.localStorage.setItem(
          draftStorageKey,
          JSON.stringify({
            savedAt: now,
            checklistMode,
            values: snapshot,
          }),
        );
        setDraftSavedAt(now);
      }, 800);
    });

    return () => {
      subscription.unsubscribe();
      if (draftSaveTimerRef.current) {
        window.clearTimeout(draftSaveTimerRef.current);
      }
    };
  }, [draftStorageKey, fetching, watch, getValues, checklistMode]);

  const handleAiGenerate = async () => {
    if (!isAiEnabled()) {
      toast.error('IA desativada neste ambiente.');
      return;
    }
    const base = checklistMode === 'machine' ? maquinaValue : equipamentoValue;
    if (!base) {
      toast.error('Selecione um equipamento ou máquina primeiro.');
      return;
    }

    if (!user?.site_id && !watch('site_id')) {
        toast.error('Selecione uma obra/setor para gerar o checklist.');
        return;
    }

    try {
      setAiGenerating(true);
      toast.info('A IA está gerando o checklist...');
      
      const generated = await aiService.generateChecklist({
        site_id: watch('site_id') || user?.site_id || '',
        inspetor_id: user?.id || '',
        equipamento: checklistMode === 'tool' ? base : undefined,
        maquina: checklistMode === 'machine' ? base : undefined,
        titulo: `Checklist - ${base}`,
        is_modelo: isTemplateMode
      });

      if (generated && generated.itens) {
        replace(generated.itens.map((item: { item: string }) => ({
             item: item.item,
             status: 'sim',
             tipo_resposta: 'sim_nao_na',
             obrigatorio: true,
             peso: 1,
             observacao: ''
        })));
        toast.success('Checklist gerado com sucesso!');
      }
    } catch (error) {
      console.error('Erro IA:', error);
      toast.error('Erro ao gerar checklist com IA.');
    } finally {
      setAiGenerating(false);
    }
  };

  const { handleSubmit: onSubmit, loading } = useFormSubmit(
    async (data: ChecklistFormData) => {
      // Validação manual de "Não Conforme" exigir observação
      const hasInvalidNC = data.itens.some(item => 
        (item.status === 'nok' || item.status === 'nao') && !item.observacao?.trim()
      );

      if (hasInvalidNC) {
        throw new Error('Itens marcados como "Não Conforme" ou "Não" exigem uma observação.');
      }

      if (checklistMode === 'tool' && !data.equipamento?.trim()) {
        throw new Error('Informe o equipamento para continuar.');
      }
      if (checklistMode === 'machine' && !data.maquina?.trim()) {
        throw new Error('Informe a máquina para continuar.');
      }

      const payload = {
        ...data,
        equipamento: checklistMode === 'tool' ? data.equipamento : '',
        maquina: checklistMode === 'machine' ? data.maquina : '',
        is_modelo: isTemplateMode ? true : data.is_modelo,
      };
      const activeId = currentChecklistId || id;
      
      let saved: Checklist;
      if (activeId) {
        saved = await checklistsService.update(activeId, payload, selectedCompanyId || undefined);
      } else {
        saved = await checklistsService.create(payload, selectedCompanyId || undefined);
      }

      if ((saved as Checklist & { offlineQueued?: boolean }).offlineQueued) {
        toast.info('Checklist salvo na fila offline. A sincronização será retomada quando a conexão voltar.');
      }
      
      if (saved?.id) {
        setCurrentChecklistId(saved.id);
      }
      setCurrentChecklist(saved);
      setIsOfflineQueued(Boolean((saved as Checklist & { offlineQueued?: boolean }).offlineQueued));

      if (draftStorageKey && typeof window !== 'undefined') {
        window.localStorage.removeItem(draftStorageKey);
        setDraftSavedAt(null);
      }

      if (isTemplateMode && templateVersionStorageKey && typeof window !== 'undefined') {
        const nextVersion = templateLocalVersion + 1;
        window.localStorage.setItem(templateVersionStorageKey, String(nextVersion));
        setTemplateLocalVersion(nextVersion);
      }
      return saved;
    },
    {
      successMessage: isTemplateMode 
        ? (id ? 'Modelo atualizado!' : 'Modelo criado!') 
        : (id ? 'Checklist salvo!' : 'Checklist criado!'),
      context: isTemplateMode ? 'Modelo' : 'Checklist'
    }
  );

  const handleClearDraft = () => {
    if (!draftStorageKey || typeof window === 'undefined') return;
    window.localStorage.removeItem(draftStorageKey);
    setDraftSavedAt(null);
    toast.success('Rascunho local removido.');
  };

  const ensureChecklistPersisted = async () => {
    if (isOfflineQueued) {
      toast.error(
        'Sincronize o checklist salvo offline antes de assinar, emitir ou enviar.',
      );
      return null;
    }

    if (activeChecklistId) {
      return currentChecklist;
    }

    let savedChecklist: Checklist | null = null;
    await handleSubmit(async (data) => {
      const saved = await onSubmit(data);
      if (saved) {
        savedChecklist = saved as Checklist;
      }
    })();

    if (
      (savedChecklist as (Checklist & { offlineQueued?: boolean }) | null)
        ?.offlineQueued
    ) {
      toast.error(
        'O checklist entrou na fila offline. Aguarde a sincronização antes de continuar.',
      );
      return null;
    }

    return savedChecklist;
  };

  if (fetching) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--ds-color-action-primary)] border-t-transparent" />
      </div>
    );
  }

  const openStoredPdf = async (mode: 'open' | 'print' = 'open') => {
    if (!activeChecklistId) {
      return false;
    }

    try {
      const access = await checklistsService.getPdfAccess(activeChecklistId);
      if (!access.url) {
        throw new Error('PDF final ainda não está disponível para download.');
      }

      if (mode === 'print') {
        openPdfForPrint(access.url, () => {
          toast.info(
            'Pop-up bloqueado. Abrimos o PDF final na mesma aba para impressão.',
          );
        });
      } else {
        openUrlInNewTab(access.url);
      }
      return true;
    } catch (error) {
      console.error('Erro ao abrir PDF final do checklist:', error);
      toast.error('Não foi possível abrir o PDF final deste checklist.');
      return false;
    }
  };

  const handlePrint = async () => {
    if (isFinalized) {
      await openStoredPdf('print');
      return;
    }

    window.print();
  };

  const handleOpenSignature = async () => {
    if (!selectedInspectorId) {
      toast.error('Selecione o inspetor.');
      return;
    }

    if (isFinalized) {
      toast.info('Checklist já finalizado. O PDF emitido está bloqueado para edição.');
      return;
    }

    const persistedChecklist = await ensureChecklistPersisted();
    const resolvedChecklistId = persistedChecklist?.id || activeChecklistId;
    if (!resolvedChecklistId) {
      return;
    }

    const inspector = users.find(u => u.id === selectedInspectorId) || user || null;
    setCurrentSigningUser(inspector);
    setIsSignatureModalOpen(true);
  };

  const handleOpenEmail = async () => {
    const persistedChecklist = await ensureChecklistPersisted();
    const resolvedChecklistId = persistedChecklist?.id || activeChecklistId;
    if (!resolvedChecklistId) {
      return;
    }
    setEmailModalOpen(true);
  };

  const handleSendEmail = async () => {
    if (!emailTo) {
      toast.error('Digite um email.');
      return;
    }
    try {
      setSendingEmail(true);
      const resolvedChecklistId = activeChecklistId;
      if (resolvedChecklistId) {
        await checklistsService.sendEmail(resolvedChecklistId, emailTo);
        toast.success('Checklist enviado por email com sucesso!');
        setEmailModalOpen(false);
      }
    } catch (error) {
      console.error('Erro ao enviar email:', error);
      toast.error('Erro ao enviar email.');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleFinalizeChecklist = async () => {
    if (isTemplateMode) {
      return;
    }

    if (isFinalized) {
      await openStoredPdf();
      return;
    }

    if (!hasAnySignature) {
      toast.error(
        'Adicione ao menos uma assinatura antes de emitir o PDF final.',
      );
      return;
    }

    const persistedChecklist = await ensureChecklistPersisted();
    const resolvedChecklistId = persistedChecklist?.id || activeChecklistId;
    if (!resolvedChecklistId) {
      return;
    }

    try {
      setFinalizingPdf(true);
      const result = await checklistsService.savePdf(resolvedChecklistId);
      const refreshedChecklist = await checklistsService.findOne(
        resolvedChecklistId,
      );
      setCurrentChecklist(refreshedChecklist);
      setCurrentChecklistId(refreshedChecklist.id);
      setIsOfflineQueued(false);
      toast.success(
        'PDF final emitido e salvo no armazenamento semanal do checklist.',
      );

      if (result.fileUrl) {
        openUrlInNewTab(result.fileUrl);
      }
    } catch (error) {
      console.error('Erro ao emitir PDF final do checklist:', error);
      toast.error('Não foi possível emitir o PDF final deste checklist.');
    } finally {
      setFinalizingPdf(false);
    }
  };

  return (
    <div className={`ds-form-page mx-auto max-w-4xl print:max-w-none print:p-0 ${isFieldMode ? 'pb-28' : ''}`}>
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Link
            href={isTemplateMode ? "/dashboard/checklist-models" : "/dashboard/checklists"}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-sm)] transition-colors hover:bg-[var(--ds-color-surface-muted)]/24"
          >
            <ArrowLeft className="h-5 w-5 text-[var(--ds-color-text-secondary)]" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">
              {isTemplateMode ? (id ? 'Editar Modelo' : 'Novo Modelo') : (id ? 'Editar Checklist' : 'Novo Checklist')}
            </h1>
            <p className="text-sm text-[var(--ds-color-text-muted)]">
              {isTemplateMode ? 'Defina a estrutura padrão do checklist.' : 'Preencha os dados da inspeção.'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--ds-color-text-muted)]" aria-live="polite">
              <span>
                {draftSavedAt
                  ? `Rascunho salvo às ${new Date(draftSavedAt).toLocaleTimeString('pt-BR')}`
                  : 'Rascunho salvo automaticamente'}
              </span>
              {openNcWithSophieHref ? (
                <Link
                  href={openNcWithSophieHref}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] px-2.5 py-1 font-semibold text-[var(--ds-color-warning)] transition-colors hover:border-[var(--ds-color-warning)]/50"
                >
                  <Bot className="h-3.5 w-3.5" />
                  Abrir NC com SOPHIE
                </Link>
              ) : null}
              {isTemplateMode ? (
                <span className="rounded-full bg-[var(--ds-color-primary-subtle)] px-2 py-0.5 text-[var(--ds-color-action-primary)]">
                  Versão local v{templateLocalVersion}
                </span>
              ) : null}
              {!id ? (
                <button
                  type="button"
                  onClick={handleClearDraft}
                  className="underline decoration-dotted underline-offset-2 hover:text-[var(--ds-color-text-primary)]"
                >
                  Limpar rascunho
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {isFieldMode ? (
        <div className={`${panelClassName} mb-6 border-emerald-400/25 bg-emerald-500/8 p-5 print:hidden`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                Modo campo
              </p>
              <h2 className="mt-2 text-lg font-semibold text-[var(--ds-color-text-primary)]">
                Checklist rápido para celular
              </h2>
              <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
                Fluxo com botões maiores, câmera pronta e fila offline para uso em obra, rua e áreas industriais.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center md:w-[260px]">
              <div className="rounded-[var(--ds-radius-md)] border border-white/10 bg-white/5 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">Câmera</p>
                <p className="mt-1 text-sm font-semibold text-white">Pronta</p>
              </div>
              <div className="rounded-[var(--ds-radius-md)] border border-white/10 bg-white/5 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-color-text-muted)]">Fila</p>
                <p className="mt-1 text-sm font-semibold text-white">Automática</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isFinalized ? (
        <div className={`${panelClassName} mb-6 border-[var(--ds-color-success-border)] bg-[var(--ds-color-success-subtle)] p-5 print:hidden`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle className="mt-0.5 h-5 w-5 text-[var(--ds-color-success)]" />
              <div>
                <p className="text-sm font-semibold text-[var(--ds-color-success-fg)]">
                  PDF final emitido e salvo no armazenamento
                </p>
                <p className="mt-1 text-sm text-[var(--ds-color-success)]">
                  Este checklist já entrou no storage semanal e agora está bloqueado para edição.
                </p>
                {currentChecklist?.pdf_folder_path ? (
                  <p className="mt-2 text-xs text-[var(--ds-color-text-secondary)]">
                    Pasta: {currentChecklist.pdf_folder_path}
                  </p>
                ) : null}
              </div>
            </div>
            <Button
              type="button"
              onClick={() => void openStoredPdf()}
              variant="outline"
              className="gap-2"
            >
              <Printer className="h-4 w-4" />
              Abrir PDF final
            </Button>
          </div>
        </div>
      ) : null}

      {/* Cabeçalho de Impressão */}
      <div className="hidden print:mb-8 print:block">
        <div className="border-b border-[var(--ds-color-border-subtle)] pb-4 text-center">
          <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">GST</h1>
          <h2 className="text-xl text-[var(--ds-color-text-secondary)]">{tituloValue}</h2>
          <p className="text-sm text-[var(--ds-color-text-muted)]">
            Data: {new Date().toLocaleDateString('pt-BR')} | ID: {(currentChecklistId || id) || 'Novo'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 print:space-y-4">
        <fieldset
          disabled={isFinalized}
          className={`space-y-6 ${isFinalized ? 'opacity-75' : ''}`}
        >
        {/* Dados Principais */}
        <div className={`${panelClassName} p-6`}>
            <h2 className="mb-4 text-lg font-semibold text-[var(--ds-color-text-primary)]">Informações</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Título */}
                <div className="md:col-span-2">
                    <label htmlFor="checklist-form-titulo" className={labelClassName}>Título do Checklist</label>
                    <input
                        id="checklist-form-titulo"
                        {...register('titulo')}
                        aria-invalid={errors.titulo ? 'true' : undefined}
                        className={fieldClassName}
                        placeholder="Ex: Checklist de Furadeira"
                    />
                    {errors.titulo && <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.titulo.message}</p>}
                </div>

                {/* Empresa */}
                <div>
                    <label htmlFor="checklist-form-company-id" className={labelClassName}>Empresa</label>
                    <select
                        id="checklist-form-company-id"
                        {...register('company_id', {
                            onChange: (e) => {
                                const value = e.target.value;
                                setValue('company_id', value);
                                setValue('site_id', '');
                                setValue('inspetor_id', '');
                            },
                        })}
                        aria-invalid={errors.company_id ? 'true' : undefined}
                        className={fieldClassName}
                    >
                        <option value="">Selecione uma empresa</option>
                        {companies.map(company => (
                            <option key={company.id} value={company.id}>
                                {company.razao_social}
                            </option>
                        ))}
                    </select>
                    {errors.company_id && <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.company_id.message}</p>}
                </div>
                {/* Data */}
                <div>
                    <label htmlFor="checklist-form-data" className={labelClassName}>Data</label>
                    <input
                        id="checklist-form-data"
                        type="date"
                        {...register('data')}
                        aria-invalid={errors.data ? 'true' : undefined}
                        className={fieldClassName}
                    />
                    {errors.data && <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.data.message}</p>}
                </div>
                {/* Obra/Setor */}
                <div>
                    <label htmlFor="checklist-form-site-id" className={labelClassName}>Obra/Setor</label>
                    <select
                        id="checklist-form-site-id"
                        {...register('site_id')}
                        disabled={!selectedCompanyId}
                        aria-label="Obra ou setor do checklist"
                        className={`${fieldClassName} disabled:bg-[var(--ds-color-surface-muted)]/32`}
                    >
                        <option value="">{selectedCompanyId ? 'Selecione uma obra' : 'Selecione uma empresa primeiro'}</option>
                        {filteredSites.map(site => (
                            <option key={site.id} value={site.id}>
                                {site.nome}
                            </option>
                        ))}
                    </select>
                    {errors.site_id && <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.site_id.message}</p>}
                </div>
                {/* Inspetor */}
                <div>
                    <label htmlFor="checklist-form-inspetor-id" className={labelClassName}>Inspetor</label>
                    <select
                        id="checklist-form-inspetor-id"
                        {...register('inspetor_id')}
                        disabled={!selectedCompanyId}
                        aria-label="Inspetor do checklist"
                        className={`${fieldClassName} disabled:bg-[var(--ds-color-surface-muted)]/32`}
                    >
                        <option value="">{selectedCompanyId ? 'Selecione um inspetor' : 'Selecione uma empresa primeiro'}</option>
                        {filteredInspectors.map(u => (
                            <option key={u.id} value={u.id}>
                                {u.nome}
                            </option>
                        ))}
                    </select>
                    {errors.inspetor_id && <p className="mt-1 text-xs text-[var(--ds-color-danger)]">{errors.inspetor_id.message}</p>}
                </div>

                <div className="md:col-span-2">
                    <p className={labelClassName}>Tipo de Checklist</p>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setChecklistMode('tool');
                                setValue('maquina', '');
                            }}
                            aria-pressed={checklistMode === 'tool'}
                            className={`${conditionalToggleClassName} ${
                                checklistMode === 'tool'
                                    ? 'border-[var(--ds-color-primary-border)] bg-[var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]'
                                    : 'border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-secondary)] hover:text-[var(--ds-color-text-primary)]'
                            }`}
                        >
                            Ferramenta
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setChecklistMode('machine');
                                setValue('equipamento', '');
                            }}
                            aria-pressed={checklistMode === 'machine'}
                            className={`${conditionalToggleClassName} ${
                                checklistMode === 'machine'
                                    ? 'border-[var(--ds-color-primary-border)] bg-[var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]'
                                    : 'border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-secondary)] hover:text-[var(--ds-color-text-primary)]'
                            }`}
                        >
                            Máquina
                        </button>
                    </div>
                </div>

                {checklistMode === 'tool' ? (
                    <div className="md:col-span-2">
                        <label htmlFor="checklist-form-equipamento" className={labelClassName}>Equipamento *</label>
                        <input
                            id="checklist-form-equipamento"
                            {...register('equipamento')}
                            className={fieldClassName}
                            placeholder="Ex: Furadeira, escada, detector de gás..."
                        />
                    </div>
                ) : (
                    <div className="md:col-span-2">
                        <label htmlFor="checklist-form-maquina" className={labelClassName}>Máquina *</label>
                        <input
                            id="checklist-form-maquina"
                            {...register('maquina')}
                            className={fieldClassName}
                            placeholder="Ex: Retroescavadeira, prensa, guindaste..."
                        />
                    </div>
                )}
            </div>
            <div className="mt-6">
                <label htmlFor="checklist-form-foto-equipamento" className={labelClassName}>Foto do Equipamento</label>
                <input
                    id="checklist-form-foto-equipamento"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoChange}
                    className="w-full text-sm text-[var(--ds-color-text-muted)] file:mr-4 file:rounded-[var(--ds-radius-md)] file:border-0 file:bg-[var(--ds-color-surface-muted)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--ds-color-text-secondary)] hover:file:bg-[var(--ds-color-primary-subtle)]/45"
                    title="Foto do equipamento"
                    aria-label="Foto do equipamento"
                />
                {watch('foto_equipamento') && (
                    <div className="mt-4">
                        <Image 
                            src={watch('foto_equipamento') || '/placeholder-image.png'}
                            alt="Foto do Equipamento" 
                            width={400}
                            height={160}
                            className="h-40 w-auto rounded-lg border p-2"
                            unoptimized
                        />
                    </div>
                )}
            </div>
        </div>

        {/* Itens do Checklist */}
        <div className={`${panelClassName} p-6`}>
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--ds-color-text-primary)]">
                    Itens para Verificação
                </h2>
                {isTemplateMode && isAiEnabled() && (
                    <Button
                        type="button"
                        onClick={handleAiGenerate}
                        variant="secondary"
                        loading={aiGenerating}
                        className="gap-2"
                    >
                        <Sparkles className="h-4 w-4" />
                        Gerar com IA
                    </Button>
                )}
            </div>

            <div className="space-y-4">
                {fields.map((field, index) => 
                    isTemplateMode 
                    ? <TemplateItem key={field.id} item={field as ChecklistItemForm} index={index} register={register} remove={remove} />
                    : <ExecutionItem key={field.id} item={field as ChecklistItemForm} index={index} register={register} watch={watch} setValue={setValue} />
                )}
            </div>

            <button
                type="button"
                onClick={() => append({ item: '', status: 'sim', tipo_resposta: 'sim_nao_na', obrigatorio: true, peso: 1, observacao: '' })}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--ds-radius-md)] border border-dashed border-[var(--ds-color-border-default)] py-3 text-sm font-medium text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)]/26 hover:text-[var(--ds-color-text-primary)]"
            >
                <Plus className="h-4 w-4" />
                Adicionar Item
            </button>
        </div>

        {/* Assinatura */}
        {!isTemplateMode && (
            <div className={`${panelClassName} p-6`}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-[var(--ds-color-text-primary)]">Assinatura</h2>
                    <Button
                        type="button"
                        onClick={handleOpenSignature}
                        variant="outline"
                        className="gap-2"
                    >
                        <PenTool className="h-4 w-4" />
                        {signatures[selectedInspectorId || ''] ? 'Reassinar' : 'Assinar Agora'}
                    </Button>
                </div>
                <p className="mb-3 text-sm text-[var(--ds-color-text-secondary)]">
                    Inspetor selecionado: {users.find(u => u.id === selectedInspectorId)?.nome || '-'}
                </p>
                
                {Object.keys(signatures).length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {Object.entries(signatures).map(([userId, sig]) => (
                            <div
                              key={userId}
                              className="flex items-center gap-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-success-border)] bg-[var(--ds-color-success-subtle)] p-3"
                            >
                                <CheckCircle className="h-5 w-5 text-[var(--ds-color-success)]" />
                                <div>
                                    <p className="text-sm font-medium text-[var(--ds-color-success-fg)]">Assinado Digitalmente</p>
                                    <p className="text-xs text-[var(--ds-color-success)]">{new Date(sig.signedAt).toLocaleString()}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm italic text-[var(--ds-color-text-muted)]">
                        Nenhuma assinatura ainda.
                    </p>
                )}
                <p className="mt-4 text-xs text-[var(--ds-color-text-muted)]">
                  Depois da assinatura, use <strong>Emitir PDF final</strong> para salvar este checklist na pasta semanal da empresa e bloquear novas edições.
                </p>
            </div>
        )}
        </fieldset>

        {/* Rodapé de Ações */}
        <div className={`print:hidden ${isFieldMode ? 'sticky bottom-4 z-10 rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-strong)] bg-[var(--ds-color-surface-elevated)]/95 p-4 shadow-[var(--ds-shadow-lg)] backdrop-blur' : 'flex items-center justify-end gap-3'}`}>
          {isFieldMode ? (
            <div className="mb-3">
              <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">Pronto para salvar em campo</p>
              <p className="text-xs text-[var(--ds-color-text-muted)]">
                Se a internet cair, o checklist fica na fila local e sincroniza automaticamente depois.
              </p>
            </div>
          ) : null}
          <div className={isFieldMode ? 'grid grid-cols-2 gap-3' : 'flex items-center justify-end gap-3'}>
            <Link
                href={isTemplateMode ? "/dashboard/checklist-models" : "/dashboard/checklists"}
                className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] px-4 py-2 text-sm font-medium text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)]/24"
            >
                Cancelar
            </Link>
            
            <Button
                type="submit"
                loading={loading}
                className="gap-2"
                size="lg"
                disabled={isFinalized}
            >
                <Save className="h-4 w-4" />
                {isTemplateMode ? 'Salvar Modelo' : isFieldMode ? 'Salvar em campo' : isFinalized ? 'Checklist finalizado' : 'Salvar Checklist'}
            </Button>
            
            {!isTemplateMode && !isFieldMode && (
                <>
                    <Button
                        type="button"
                        onClick={handleFinalizeChecklist}
                        variant={isFinalized ? 'outline' : 'secondary'}
                        className="gap-2"
                        loading={finalizingPdf}
                        disabled={loading || isOfflineQueued}
                    >
                        <CheckCircle className="h-4 w-4" />
                        {isFinalized ? 'Abrir PDF final' : 'Emitir PDF final'}
                    </Button>
                    <Button
                        type="button"
                        onClick={handleOpenEmail}
                        variant="outline"
                        className="gap-2"
                        disabled={isOfflineQueued}
                    >
                        <Send className="h-4 w-4" />
                        Enviar por Email
                    </Button>
                    <Button
                        type="button"
                        onClick={handlePrint}
                        variant="outline"
                        className="gap-2"
                    >
                        <Printer className="h-4 w-4" />
                        Imprimir
                    </Button>
                </>
            )}
          </div>
        </div>
      </form>

      {/* Modal de Assinatura */}
      <SignatureModal
        isOpen={isSignatureModalOpen}
        onClose={() => setIsSignatureModalOpen(false)}
        onSave={async (signatureData, type) => {
            const activeId = activeChecklistId;
            if (activeId && currentSigningUser) {
                try {
                    const createdSignature = await signaturesService.create({
                        document_id: activeId,
                        document_type: 'CHECKLIST',
                        user_id: currentSigningUser.id,
                        signature_data: signatureData,
                        type,
                    });
                    setSignatures(prev => ({
                        ...prev,
                        [currentSigningUser.id]: {
                          signatureData:
                            createdSignature.signature_data || signatureData,
                          type: createdSignature.type || type,
                          signedAt:
                            createdSignature.signed_at ||
                            createdSignature.created_at ||
                            new Date().toISOString(),
                        }
                    }));
                    toast.success('Assinatura salva com sucesso!');
                    toast.info(
                      'Assinatura registrada. Agora emita o PDF final para salvar o checklist no armazenamento semanal.',
                    );
                    setIsSignatureModalOpen(false);
                } catch (error) {
                    console.error('Erro ao salvar assinatura:', error);
                    toast.error('Erro ao salvar assinatura.');
                }
            } else {
                toast.error('Salve o checklist antes de assinar.');
                setIsSignatureModalOpen(false);
            }
        }}
        userName={currentSigningUser?.nome || 'Inspetor'}
      />

      {/* Modal de Email */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`${panelClassName} w-full max-w-md p-6 shadow-[var(--ds-shadow-lg)]`}>
            <h3 className="mb-2 text-lg font-bold text-[var(--ds-color-text-primary)]">Enviar Documento</h3>
            <p className="mb-4 text-sm text-[var(--ds-color-text-muted)]">
              Digite o endereço de email para receber este checklist em PDF.
            </p>
            
            <div className="mb-6">
                <label htmlFor="checklist-form-email-destino" className={labelClassName}>Email de Destino</label>
                <input 
                  id="checklist-form-email-destino"
                  type="email" 
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="exemplo@empresa.com"
                  className={fieldClassName}
                  autoFocus
                />
            </div>
            
            <div className="flex justify-end gap-3">
              <Button 
                variant="secondary"
                onClick={() => setEmailModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleSendEmail}
                loading={sendingEmail}
                disabled={!emailTo}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                Enviar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}
