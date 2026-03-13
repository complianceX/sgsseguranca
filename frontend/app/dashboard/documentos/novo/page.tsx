'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileInput,
  FileSearch,
  FileText,
  FileUp,
  FolderOpen,
  MessageSquareText,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { selectedTenantStore } from '@/lib/selectedTenantStore';
import { sitesService, Site } from '@/services/sitesService';
import { usersService, User } from '@/services/usersService';

type DocumentType =
  | 'apr'
  | 'pt'
  | 'checklist'
  | 'dds'
  | 'inspection'
  | 'nc';

type CreationMode = 'guided' | 'assisted' | 'import' | 'library';

type DocumentTypeConfig = {
  id: DocumentType;
  label: string;
  description: string;
  icon: typeof FileText;
  guidedHref: string;
  libraryHref?: string;
  importLabel: string;
  assistedLabel: string;
  assistedSupported: boolean;
  librarySupported: boolean;
};

const DOCUMENT_TYPES: DocumentTypeConfig[] = [
  {
    id: 'apr',
    label: 'APR',
    description: 'Análise preliminar de risco com atividade, perigos, controles e aprovação.',
    icon: Shield,
    guidedHref: '/dashboard/aprs/new',
    libraryHref: '/dashboard/aprs',
    importLabel: 'Anexar APR já preenchida',
    assistedLabel: 'SOPHIE apoia a análise dentro do formulário',
    assistedSupported: true,
    librarySupported: true,
  },
  {
    id: 'pt',
    label: 'PT',
    description: 'Permissão de trabalho com bloqueios, requisitos mandatórios e liberação operacional.',
    icon: FileText,
    guidedHref: '/dashboard/pts/new',
    libraryHref: '/dashboard/pts',
    importLabel: 'Anexar PT já emitida',
    assistedLabel: 'SOPHIE ajuda na criticidade e controles',
    assistedSupported: true,
    librarySupported: true,
  },
  {
    id: 'checklist',
    label: 'Checklist',
    description: 'Checklist operacional ou de inspeção com execução rastreável e evidências.',
    icon: ClipboardCheck,
    guidedHref: '/dashboard/checklists/new',
    libraryHref: '/dashboard/checklist-models',
    importLabel: 'Importar checklist em PDF',
    assistedLabel: 'SOPHIE ajuda a estruturar o checklist',
    assistedSupported: true,
    librarySupported: true,
  },
  {
    id: 'dds',
    label: 'DDS',
    description: 'Diálogo Diário de Segurança com tema, facilitador, participantes e comprovação.',
    icon: MessageSquareText,
    guidedHref: '/dashboard/dds/new',
    libraryHref: '/dashboard/dds',
    importLabel: 'Importar DDS em PDF',
    assistedLabel: 'SOPHIE apoia a criação do DDS',
    assistedSupported: true,
    librarySupported: true,
  },
  {
    id: 'inspection',
    label: 'Relatório Fotográfico',
    description: 'Registro fotográfico com narrativa técnica, evidências e conclusão editorial.',
    icon: FileSearch,
    guidedHref: '/dashboard/inspections/new',
    importLabel: 'Importar relatório em PDF',
    assistedLabel: 'Fluxo assistido em breve',
    assistedSupported: false,
    librarySupported: false,
  },
  {
    id: 'nc',
    label: 'NC',
    description: 'Não conformidade com desvio, causa, ação corretiva, verificação e rastreabilidade.',
    icon: AlertTriangle,
    guidedHref: '/dashboard/nonconformities/new',
    importLabel: 'Importar NC em PDF',
    assistedLabel: 'SOPHIE cria a NC inicial para revisão humana',
    assistedSupported: true,
    librarySupported: false,
  },
];

const CREATION_MODES: Array<{
  id: CreationMode;
  label: string;
  description: string;
  icon: typeof FileInput;
}> = [
  {
    id: 'guided',
    label: 'Guiado',
    description: 'Abre o formulário completo já com o contexto da operação aplicado.',
    icon: FileInput,
  },
  {
    id: 'assisted',
    label: 'Assistido pela SOPHIE',
    description: 'Leva o contexto do documento para um fluxo com apoio inteligente.',
    icon: Bot,
  },
  {
    id: 'import',
    label: 'Anexar PDF pronto',
    description: 'Quando o documento já está emitido e você quer subir o arquivo sem refazer o fluxo.',
    icon: FileUp,
  },
  {
    id: 'library',
    label: 'Usar biblioteca/modelo',
    description: 'Abre a lista de modelos, versões ou documentos base para reaproveitamento.',
    icon: FolderOpen,
  },
];

function getDocumentConfig(documentType: DocumentType) {
  return DOCUMENT_TYPES.find((item) => item.id === documentType) || DOCUMENT_TYPES[0];
}

function opensSophieAutomation(documentType: DocumentType) {
  return documentType === 'checklist' || documentType === 'dds' || documentType === 'nc';
}

export default function NewDocumentHubPage() {
  const router = useRouter();
  const { user, isAdminGeral, hasPermission } = useAuth();
  const [tenant, setTenant] = useState(() => selectedTenantStore.get());
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingContext, setLoadingContext] = useState(false);
  const [documentType, setDocumentType] = useState<DocumentType>('apr');
  const [creationMode, setCreationMode] = useState<CreationMode>('guided');
  const [siteId, setSiteId] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentDescription, setDocumentDescription] = useState('');

  const canUseAi = hasPermission('can_use_ai');
  const activeCompanyId = isAdminGeral
    ? tenant?.companyId || user?.company_id || ''
    : user?.company_id || '';
  const activeCompanyName = isAdminGeral
    ? tenant?.companyName || user?.company?.razao_social || 'Empresa ativa'
    : user?.company?.razao_social || 'Empresa ativa';
  const currentConfig = getDocumentConfig(documentType);
  const selectedResponsible = users.find((item) => item.id === responsibleId);
  const selectedSite = sites.find((item) => item.id === siteId);

  useEffect(() => {
    const unsubscribe = selectedTenantStore.subscribe((nextTenant) => {
      setTenant(nextTenant);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadContext() {
      if (!activeCompanyId) {
        if (active) {
          setSites([]);
          setUsers([]);
        }
        return;
      }

      try {
        setLoadingContext(true);
        const [siteRows, userRows] = await Promise.all([
          sitesService.findAll(activeCompanyId),
          usersService.findPaginated({
            page: 1,
            limit: 100,
            companyId: activeCompanyId,
          }),
        ]);

        if (!active) {
          return;
        }

        setSites(siteRows);
        setUsers(userRows.data);

        setSiteId((current) => {
          if (current && siteRows.some((item) => item.id === current)) {
            return current;
          }

          if (user?.site_id && siteRows.some((item) => item.id === user.site_id)) {
            return user.site_id;
          }

          return siteRows[0]?.id || '';
        });

        setResponsibleId((current) => {
          if (current && userRows.data.some((item) => item.id === current)) {
            return current;
          }

          if (user?.id && userRows.data.some((item) => item.id === user.id)) {
            return user.id;
          }

          return userRows.data[0]?.id || '';
        });
      } catch (error) {
        console.error('Erro ao carregar contexto para novo documento:', error);
        if (active) {
          setSites([]);
          setUsers([]);
        }
      } finally {
        if (active) {
          setLoadingContext(false);
        }
      }
    }

    void loadContext();

    return () => {
      active = false;
    };
  }, [activeCompanyId, user?.id, user?.site_id]);

  useEffect(() => {
    if (creationMode === 'assisted' && (!currentConfig.assistedSupported || !canUseAi)) {
      setCreationMode('guided');
      return;
    }

    if (creationMode === 'library' && !currentConfig.librarySupported) {
      setCreationMode('guided');
    }
  }, [canUseAi, creationMode, currentConfig.assistedSupported, currentConfig.librarySupported]);

  const destinationPreview = useMemo(() => {
    if (creationMode === 'guided') {
      return 'Fluxo guiado com contexto aplicado';
    }

    if (creationMode === 'assisted') {
      return canUseAi
        ? currentConfig.assistedLabel
        : 'SOPHIE indisponível para o seu perfil ou ambiente';
    }

    if (creationMode === 'import') {
      return currentConfig.importLabel;
    }

    return 'Abrir biblioteca/modelos do módulo selecionado';
  }, [canUseAi, creationMode, currentConfig]);

  function buildTargetHref() {
    const params = new URLSearchParams();

    if (activeCompanyId) {
      params.set('company_id', activeCompanyId);
    }

    if (siteId) {
      params.set('site_id', siteId);
    }

    if (documentTitle.trim()) {
      params.set('title', documentTitle.trim());
    }

    if (documentDescription.trim()) {
      params.set('description', documentDescription.trim());
    }

    if (responsibleId) {
      switch (documentType) {
        case 'apr':
          params.set('elaborador_id', responsibleId);
          break;
        case 'pt':
          params.set('responsavel_id', responsibleId);
          break;
        case 'checklist':
          params.set('inspetor_id', responsibleId);
          break;
        case 'dds':
          params.set('facilitador_id', responsibleId);
          break;
        default:
          params.set('user_id', responsibleId);
          break;
      }
    }

    if (creationMode === 'guided') {
      return `${currentConfig.guidedHref}${params.toString() ? `?${params.toString()}` : ''}`;
    }

    if (creationMode === 'assisted') {
      params.set('documentType', documentType);
      if (opensSophieAutomation(documentType)) {
        return `/dashboard/sst-agent?${params.toString()}`;
      }
      params.set('assistant', 'sophie');
      return `${currentConfig.guidedHref}${params.toString() ? `?${params.toString()}` : ''}`;
    }

    if (creationMode === 'import') {
      params.set('documentType', documentType);
      return `/dashboard/documentos/importar?${params.toString()}`;
    }

    if (!currentConfig.libraryHref) {
      return currentConfig.guidedHref;
    }

    return currentConfig.libraryHref;
  }

  function handleContinue() {
    if (!activeCompanyId) {
      toast.error(
        isAdminGeral
          ? 'Selecione uma empresa ativa antes de abrir o fluxo documental.'
          : 'Empresa do usuário não identificada para iniciar o fluxo.',
      );
      return;
    }

    if (!siteId && ['apr', 'pt', 'checklist', 'dds', 'inspection', 'nc'].includes(documentType)) {
      toast.error('Selecione um site/obra para continuar com o contexto operacional.');
      return;
    }

    if (creationMode === 'assisted' && !canUseAi) {
      toast.error('SOPHIE não está habilitada para o seu perfil ou ambiente.');
      return;
    }

    if (creationMode === 'assisted' && !currentConfig.assistedSupported) {
      toast.error('O modo assistido ainda não está disponível para este tipo documental.');
      return;
    }

    if (creationMode === 'library' && !currentConfig.librarySupported) {
      toast.error('Este tipo documental ainda não possui biblioteca/modelo dedicado.');
      return;
    }

    router.push(buildTargetHref());
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-gradient-surface)] p-6 shadow-[var(--ds-shadow-sm)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center rounded-full border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/35 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[var(--ds-color-text-secondary)]">
              fluxo unificado de criação documental
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-[var(--ds-color-text-primary)]">
              Novo documento com contexto, modo de criação e rota certa desde a entrada.
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--ds-color-text-secondary)]">
              Escolha o tipo documental, confirme o contexto operacional e defina como quer iniciar:
              guiado, assistido pela SOPHIE, anexando PDF pronto ou usando biblioteca/modelo.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/22 p-4 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ds-color-text-muted)]">
              Empresa ativa
            </p>
            <p className="mt-1 font-semibold text-[var(--ds-color-text-primary)]">
              {activeCompanyName}
            </p>
            <p className="mt-1 text-[var(--ds-color-text-muted)]">
              {isAdminGeral
                ? 'Se precisar trocar a empresa, use o seletor no topo da aplicação.'
                : 'O fluxo respeita a empresa já vinculada ao seu acesso.'}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[image:var(--ds-gradient-surface)] p-5 shadow-[var(--ds-shadow-sm)]">
            <h2 className="text-base font-bold text-[var(--ds-color-text-primary)]">1. Escolha o tipo documental</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {DOCUMENT_TYPES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDocumentType(item.id)}
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    documentType === item.id
                      ? 'border-[var(--ds-color-action-primary)] bg-[color:var(--ds-color-primary-subtle)] shadow-[var(--ds-shadow-sm)]'
                      : 'border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/20 hover:border-[var(--ds-color-action-primary)]/28'
                  }`}
                >
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--ds-color-surface-muted)]/45 text-[var(--ds-color-action-primary)]">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[var(--ds-color-text-primary)]">{item.label}</p>
                  <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">{item.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[image:var(--ds-gradient-surface)] p-5 shadow-[var(--ds-shadow-sm)]">
            <h2 className="text-base font-bold text-[var(--ds-color-text-primary)]">2. Defina o modo de criação</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {CREATION_MODES.map((mode) => {
                const disabled =
                  (mode.id === 'assisted' && (!currentConfig.assistedSupported || !canUseAi)) ||
                  (mode.id === 'library' && !currentConfig.librarySupported);

                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      if (!disabled) {
                        setCreationMode(mode.id);
                      }
                    }}
                    disabled={disabled}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      creationMode === mode.id
                        ? 'border-[var(--ds-color-action-primary)] bg-[color:var(--ds-color-primary-subtle)] shadow-[var(--ds-shadow-sm)]'
                        : 'border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/20'
                    } ${disabled ? 'cursor-not-allowed opacity-55' : 'hover:border-[var(--ds-color-action-primary)]/28'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--ds-color-surface-muted)]/45 text-[var(--ds-color-action-primary)]">
                        <mode.icon className="h-5 w-5" />
                      </div>
                      {creationMode === mode.id && !disabled ? (
                        <CheckCircle2 className="h-5 w-5 text-[var(--ds-color-success)]" />
                      ) : null}
                    </div>
                    <p className="mt-3 text-sm font-semibold text-[var(--ds-color-text-primary)]">{mode.label}</p>
                    <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">{mode.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[image:var(--ds-gradient-surface)] p-5 shadow-[var(--ds-shadow-sm)]">
            <h2 className="text-base font-bold text-[var(--ds-color-text-primary)]">3. Contexto operacional</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--ds-color-text-secondary)]">
                  Site / Obra
                </label>
                <select
                  value={siteId}
                  onChange={(event) => setSiteId(event.target.value)}
                  className="h-11 w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 text-sm text-[var(--ds-color-text-primary)] outline-none transition-all focus:border-[var(--ds-color-focus)] focus:shadow-[0_0_0_4px_var(--ds-color-focus-ring)]"
                  disabled={loadingContext || sites.length === 0}
                >
                  <option value="">
                    {loadingContext ? 'Carregando sites...' : sites.length ? 'Selecione um site' : 'Nenhum site disponível'}
                  </option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--ds-color-text-secondary)]">
                  Responsável principal
                </label>
                <select
                  value={responsibleId}
                  onChange={(event) => setResponsibleId(event.target.value)}
                  className="h-11 w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 text-sm text-[var(--ds-color-text-primary)] outline-none transition-all focus:border-[var(--ds-color-focus)] focus:shadow-[0_0_0_4px_var(--ds-color-focus-ring)]"
                  disabled={loadingContext || users.length === 0}
                >
                  <option value="">
                    {loadingContext ? 'Carregando usuários...' : users.length ? 'Selecione um responsável' : 'Nenhum usuário disponível'}
                  </option>
                  {users.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--ds-color-text-secondary)]">
                  Título / tema inicial
                </label>
                <input
                  value={documentTitle}
                  onChange={(event) => setDocumentTitle(event.target.value)}
                  placeholder={`Ex: ${currentConfig.label === 'DDS' ? 'Risco de queda em escada portátil' : 'Frente de serviço - turno da manhã'}`}
                  className="h-11 w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 text-sm text-[var(--ds-color-text-primary)] outline-none transition-all focus:border-[var(--ds-color-focus)] focus:shadow-[0_0_0_4px_var(--ds-color-focus-ring)]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[var(--ds-color-text-secondary)]">
                  Contexto adicional
                </label>
                <textarea
                  value={documentDescription}
                  onChange={(event) => setDocumentDescription(event.target.value)}
                  rows={4}
                  placeholder="Descreva atividade, local, condição operacional ou objetivo do documento."
                  className="w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2.5 text-sm text-[var(--ds-color-text-primary)] outline-none transition-all focus:border-[var(--ds-color-focus)] focus:shadow-[0_0_0_4px_var(--ds-color-focus-ring)]"
                />
              </div>
            </div>
          </div>

          <div className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[image:var(--ds-gradient-surface)] p-5 shadow-[var(--ds-shadow-sm)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ds-color-text-muted)]">
              Prévia da abertura
            </p>
            <h2 className="mt-2 text-lg font-bold text-[var(--ds-color-text-primary)]">
              {currentConfig.label} • {CREATION_MODES.find((item) => item.id === creationMode)?.label}
            </h2>
            <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
              {destinationPreview}
            </p>
            <div className="mt-4 space-y-2 rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/24 p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--ds-color-text-muted)]">Empresa</span>
                <span className="font-semibold text-[var(--ds-color-text-primary)]">{activeCompanyName}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--ds-color-text-muted)]">Site</span>
                <span className="font-semibold text-[var(--ds-color-text-primary)]">{selectedSite?.nome || 'A definir'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--ds-color-text-muted)]">Responsável</span>
                <span className="font-semibold text-[var(--ds-color-text-primary)]">{selectedResponsible?.nome || 'A definir'}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleContinue}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[image:var(--ds-gradient-brand)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--ds-shadow-md)] transition-all hover:-translate-y-0.5 hover:brightness-105"
            >
              Abrir fluxo documental
              <ArrowRight className="h-4 w-4" />
            </button>

            <div className="mt-3 rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/18 p-4 text-xs text-[var(--ds-color-text-secondary)]">
              <p className="font-semibold text-[var(--ds-color-text-primary)]">Como esse hub se comporta agora</p>
              <ul className="mt-2 space-y-1.5">
                <li>O contexto escolhido acompanha o fluxo quando o formulário já suporta pré-preenchimento.</li>
                <li>O modo assistido leva o documento para um fluxo com apoio da SOPHIE quando disponível.</li>
                <li>O modo de importação abre a rota de anexação de PDF pronto, sem obrigar o usuário a refazer o documento.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-gradient-surface)] p-5 shadow-[var(--ds-shadow-sm)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-bold text-[var(--ds-color-text-primary)]">Atalhos complementares</h2>
            <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
              Se preferir, você ainda pode entrar direto pelos módulos tradicionais.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/documentos/importar"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--ds-color-border-subtle)] px-3.5 py-2 text-sm font-semibold text-[var(--ds-color-text-primary)] transition-colors hover:bg-[color:var(--ds-color-surface-muted)]/35"
            >
              <FileUp className="h-4 w-4" />
              Importar PDF
            </Link>
            <Link
              href="/dashboard/sst-agent"
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--ds-color-border-subtle)] px-3.5 py-2 text-sm font-semibold text-[var(--ds-color-text-primary)] transition-colors hover:bg-[color:var(--ds-color-surface-muted)]/35"
            >
              <Bot className="h-4 w-4" />
              Abrir SOPHIE
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
