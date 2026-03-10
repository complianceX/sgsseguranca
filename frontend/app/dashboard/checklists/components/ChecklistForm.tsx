'use client';

import { useState, useEffect } from 'react';
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
import { ArrowLeft, Save, Plus, PenTool, CheckCircle, Sparkles, Printer, Send } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { companiesService, Company } from '@/services/companiesService';
import { useAuth } from '@/context/AuthContext';
import { aiService } from '@/services/aiService';
import { useFormSubmit } from '@/hooks/useFormSubmit';
import { Button } from '@/components/ui/button';

interface ChecklistFormProps {
  id?: string;
  mode?: 'checklist' | 'template';
}

export function ChecklistForm({ id, mode = 'checklist' }: ChecklistFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isTemplateMode = mode === 'template';
  const isAdminGeneral = user?.profile?.nome === 'Administrador Geral';
  const [fetching, setFetching] = useState(true);
  const [currentChecklistId, setCurrentChecklistId] = useState<string | undefined>(id);
  
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [checklistMode, setChecklistMode] = useState<'tool' | 'machine'>('tool');
  const [aiGenerating, setAiGenerating] = useState(false);

  // Estados para email e modal
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

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
  const [signatures, setSignatures] = useState<Record<string, { data: string, type: string }>>({});

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ChecklistFormData>({
    resolver: zodResolver(checklistSchema),
    defaultValues: {
      titulo: isTemplateMode ? '' : 'Checklist de Inspeção',
      descricao: '',
      equipamento: '',
      maquina: '',
      foto_equipamento: '',
      data: new Date().toISOString().split('T')[0],
      status: 'Pendente',
      company_id: user?.company_id || '',
      site_id: user?.site_id || '',
      inspetor_id: user?.id || '',
      categoria: 'SST',
      periodicidade: 'Diário',
      nivel_risco_padrao: 'Médio',
      ativo: true,
      itens: [{ 
        item: '', 
        status: 'ok', 
        tipo_resposta: 'conforme',
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
  const filteredSites = sites.filter(site => !selectedCompanyId || site.company_id === selectedCompanyId);
  const filteredInspectors = users.filter(u => !selectedCompanyId || u.company_id === selectedCompanyId);
  const equipamentoValue = watch('equipamento');
  const maquinaValue = watch('maquina');
  const tituloValue = watch('titulo');

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
              setValue('titulo', template.titulo);
              setValue('descricao', template.descricao || '');
              setValue('equipamento', template.equipamento || '');
              setValue('maquina', template.maquina || '');
              setValue('categoria', template.categoria || 'SST');
              setValue('periodicidade', template.periodicidade || 'Diário');
              setValue('nivel_risco_padrao', template.nivel_risco_padrao || 'Médio');
              
              if (template.itens && template.itens.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                replace(template.itens.map((item: any) => ({
                  item: item.item || '',
                  status: item.tipo_resposta === 'sim_nao' ? 'nao' : 'ok',
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
          const sigsMap: Record<string, { data: string, type: string }> = {};
          sigs.forEach(sig => {
            if (!sig.user_id) return;
            sigsMap[sig.user_id] = { data: sig.signature_data, type: 'digital' };
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
  }, [id, reset, router, searchParams, setValue, replace]);

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

  const handleAiGenerate = async () => {
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
             status: 'ok',
             tipo_resposta: 'conforme',
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

      const payload = { ...data, is_modelo: isTemplateMode ? true : data.is_modelo };
      const activeId = currentChecklistId || id;
      
      let saved: Checklist;
      if (activeId) {
        saved = await checklistsService.update(activeId, payload, selectedCompanyId || undefined);
      } else {
        saved = await checklistsService.create(payload, selectedCompanyId || undefined);
      }
      
      if (saved?.id) {
        setCurrentChecklistId(saved.id);
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

  if (fetching) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  const handleOpenSignature = async () => {
    if (!selectedInspectorId) {
      toast.error('Selecione o inspetor.');
      return;
    }
    const activeId = currentChecklistId || id;
    if (!activeId) {
      // Tentar salvar antes de assinar
      handleSubmit(async (data) => {
        const saved = await onSubmit(data);
        if (saved) {
            const inspector = users.find(u => u.id === selectedInspectorId) || user || null;
            setCurrentSigningUser(inspector);
            setIsSignatureModalOpen(true);
        }
      })();
      return;
    }
    const inspector = users.find(u => u.id === selectedInspectorId) || user || null;
    setCurrentSigningUser(inspector);
    setIsSignatureModalOpen(true);
  };

  const handleOpenEmail = () => {
    const activeId = currentChecklistId || id;
    if (!activeId) {
      handleSubmit(async (data) => {
        const saved = await onSubmit(data);
        if (saved) {
            setEmailModalOpen(true);
        }
      })();
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
      const activeId = currentChecklistId || id;
      if (activeId) {
        await checklistsService.sendEmail(activeId, emailTo);
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

  return (
    <div className="ds-form-page mx-auto max-w-4xl print:max-w-none print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Link
            href={isTemplateMode ? "/dashboard/checklist-models" : "/dashboard/checklists"}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm transition hover:bg-gray-50"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isTemplateMode ? (id ? 'Editar Modelo' : 'Novo Modelo') : (id ? 'Editar Checklist' : 'Novo Checklist')}
            </h1>
            <p className="text-sm text-gray-500">
              {isTemplateMode ? 'Defina a estrutura padrão do checklist.' : 'Preencha os dados da inspeção.'}
            </p>
          </div>
        </div>
      </div>

      {/* Cabeçalho de Impressão */}
      <div className="hidden print:mb-8 print:block">
        <div className="border-b border-gray-300 pb-4 text-center">
          <h1 className="text-2xl font-bold text-gray-900">COMPLIANCE X</h1>
          <h2 className="text-xl text-gray-700">{tituloValue}</h2>
          <p className="text-sm text-gray-500">
            Data: {new Date().toLocaleDateString('pt-BR')} | ID: {(currentChecklistId || id) || 'Novo'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 print:space-y-4">
        {/* Dados Principais */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Informações</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Título */}
                <div className="md:col-span-2">
                    <label htmlFor="checklist-form-titulo" className="mb-1 block text-sm font-medium text-gray-700">Título do Checklist</label>
                    <input
                        id="checklist-form-titulo"
                        {...register('titulo')}
                        aria-invalid={errors.titulo ? 'true' : undefined}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none"
                        placeholder="Ex: Checklist de Furadeira"
                    />
                    {errors.titulo && <p className="mt-1 text-xs text-red-500">{errors.titulo.message}</p>}
                </div>

                {/* Empresa */}
                <div>
                    <label htmlFor="checklist-form-company-id" className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
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
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none"
                    >
                        <option value="">Selecione uma empresa</option>
                        {companies.map(company => (
                            <option key={company.id} value={company.id}>
                                {company.razao_social}
                            </option>
                        ))}
                    </select>
                    {errors.company_id && <p className="mt-1 text-xs text-red-500">{errors.company_id.message}</p>}
                </div>
                {/* Data */}
                <div>
                    <label htmlFor="checklist-form-data" className="mb-1 block text-sm font-medium text-gray-700">Data</label>
                    <input
                        id="checklist-form-data"
                        type="date"
                        {...register('data')}
                        aria-invalid={errors.data ? 'true' : undefined}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none"
                    />
                    {errors.data && <p className="mt-1 text-xs text-red-500">{errors.data.message}</p>}
                </div>
                {/* Obra/Setor */}
                <div>
                    <label htmlFor="checklist-form-site-id" className="mb-1 block text-sm font-medium text-gray-700">Obra/Setor</label>
                    <select
                        id="checklist-form-site-id"
                        {...register('site_id')}
                        disabled={!selectedCompanyId}
                        aria-label="Obra ou setor do checklist"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none disabled:bg-gray-50"
                    >
                        <option value="">{selectedCompanyId ? 'Selecione uma obra' : 'Selecione uma empresa primeiro'}</option>
                        {filteredSites.map(site => (
                            <option key={site.id} value={site.id}>
                                {site.nome}
                            </option>
                        ))}
                    </select>
                </div>
                {/* Inspetor */}
                <div>
                    <label htmlFor="checklist-form-inspetor-id" className="mb-1 block text-sm font-medium text-gray-700">Inspetor</label>
                    <select
                        id="checklist-form-inspetor-id"
                        {...register('inspetor_id')}
                        disabled={!selectedCompanyId}
                        aria-label="Inspetor do checklist"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none disabled:bg-gray-50"
                    >
                        <option value="">{selectedCompanyId ? 'Selecione um inspetor' : 'Selecione uma empresa primeiro'}</option>
                        {filteredInspectors.map(u => (
                            <option key={u.id} value={u.id}>
                                {u.nome}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="mt-6">
                <label htmlFor="checklist-form-foto-equipamento" className="mb-1 block text-sm font-medium text-gray-700">Foto do Equipamento</label>
                <input
                    id="checklist-form-foto-equipamento"
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
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
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                    Itens para Verificação
                </h2>
                {isTemplateMode && (
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
                    : <ExecutionItem key={field.id} item={field as ChecklistItemForm} index={index} register={register} watch={watch} />
                )}
            </div>

            <button
                type="button"
                onClick={() => append({ item: '', status: 'ok', tipo_resposta: 'conforme', obrigatorio: true, peso: 1, observacao: '' })}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-blue-600"
            >
                <Plus className="h-4 w-4" />
                Adicionar Item
            </button>
        </div>

        {/* Assinatura */}
        {!isTemplateMode && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Assinatura</h2>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            onClick={handleOpenSignature}
                            variant="outline"
                            className="gap-2"
                        >
                            <PenTool className="h-4 w-4" />
                            {signatures[selectedInspectorId || ''] ? 'Reassinar' : 'Assinar Agora'}
                        </Button>
                        <Button
                            type="button"
                            onClick={handleOpenEmail}
                            variant="outline"
                            className="gap-2"
                        >
                            <Send className="h-4 w-4" />
                            Enviar por Email
                        </Button>
                    </div>
                </div>
                <p className="mb-3 text-sm text-gray-600">
                    Inspetor selecionado: {users.find(u => u.id === selectedInspectorId)?.nome || '-'}
                </p>
                
                {Object.keys(signatures).length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {Object.entries(signatures).map(([userId, sig]) => (
                            <div key={userId} className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
                                <CheckCircle className="h-5 w-5 text-green-600" />
                                <div>
                                    <p className="text-sm font-medium text-green-900">Assinado Digitalmente</p>
                                    <p className="text-xs text-green-700">{new Date(sig.data).toLocaleString()}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-gray-500 italic">
                        Nenhuma assinatura ainda.
                    </p>
                )}
            </div>
        )}

        {/* Rodapé de Ações */}
        <div className="flex items-center justify-end gap-3 print:hidden">
            <Link
                href={isTemplateMode ? "/dashboard/checklist-models" : "/dashboard/checklists"}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
                Cancelar
            </Link>
            
            <Button
                type="submit"
                loading={loading}
                className="gap-2"
                size="lg"
            >
                <Save className="h-4 w-4" />
                {isTemplateMode ? 'Salvar Modelo' : 'Salvar Checklist'}
            </Button>
            
            {!isTemplateMode && (
                <>
                    <Button
                        type="button"
                        onClick={handleOpenEmail}
                        variant="outline"
                        className="gap-2"
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
      </form>

      {/* Modal de Assinatura */}
      <SignatureModal
        isOpen={isSignatureModalOpen}
        onClose={() => setIsSignatureModalOpen(false)}
        onSave={async (signatureData, type) => {
            const activeId = currentChecklistId || id;
            if (activeId && currentSigningUser) {
                try {
                    await signaturesService.create({
                        document_id: activeId,
                        document_type: 'CHECKLIST',
                        user_id: currentSigningUser.id,
                        signature_data: signatureData,
                        type,
                    });
                    setSignatures(prev => ({
                        ...prev,
                        [currentSigningUser.id]: { data: new Date().toISOString(), type }
                    }));
                    toast.success('Assinatura salva com sucesso!');
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
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-bold text-gray-900">Enviar Documento</h3>
            <p className="mb-4 text-sm text-gray-500">
              Digite o endereço de email para receber este checklist em PDF.
            </p>
            
            <div className="mb-6">
                <label htmlFor="checklist-form-email-destino" className="mb-1 block text-sm font-medium text-gray-700">Email de Destino</label>
                <input 
                  id="checklist-form-email-destino"
                  type="email" 
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="exemplo@empresa.com"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none"
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
