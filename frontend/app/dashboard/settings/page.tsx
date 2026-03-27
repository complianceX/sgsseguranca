'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from 'sonner';
import axios from 'axios';
import {
  BellRing,
  Clock3,
  FileCheck2,
  Settings,
  ShieldCheck,
  Users,
  Building2,
  Map,
  HardHat,
  AlertTriangle,
  Wrench,
  Construction,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { companiesService, Company } from '@/services/companiesService';
import { ptsService, PtApprovalRules } from '@/services/ptsService';
import { SophieStatusCard } from '@/components/SophieStatusCard';
import { isTemporarilyVisibleDashboardRoute } from '@/lib/temporarilyHiddenModules';
import { usersService } from '@/services/usersService';

export default function SettingsPage() {
  const { user, hasPermission, isAdminGeral } = useAuth();
  const isAdmin = isAdminGeral;
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiConsent, setAiConsent] = useState<boolean>(user?.ai_processing_consent ?? false);
  const [savingAiConsent, setSavingAiConsent] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoDraft, setLogoDraft] = useState<string | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const [loadingLogo, setLoadingLogo] = useState(true);
  const [approvalRules, setApprovalRules] = useState<PtApprovalRules | null>(
    null,
  );
  const [loadingApprovalRules, setLoadingApprovalRules] = useState(false);
  const [savingApprovalRules, setSavingApprovalRules] = useState(false);

  const managementLinks = [
    { label: 'Usuários e Acessos', href: '/dashboard/users', icon: Users, adminOnly: true },
    { label: 'Empresas', href: '/dashboard/companies', icon: Building2, adminOnly: true },
    { label: 'Obras/Setores', href: '/dashboard/sites', icon: Map, adminOnly: true },
    { label: 'Atividades', href: '/dashboard/activities', icon: HardHat, adminOnly: true },
    { label: 'Riscos', href: '/dashboard/risks', icon: AlertTriangle, adminOnly: true },
    { label: 'EPIs', href: '/dashboard/epis', icon: ShieldCheck, adminOnly: true },
    { label: 'Ferramentas', href: '/dashboard/tools', icon: Wrench, adminOnly: true },
    { label: 'Máquinas', href: '/dashboard/machines', icon: Construction, adminOnly: true },
  ];
  const governanceAreas = [
    {
      id: 'access',
      label: 'Usuários e acessos',
      description: 'Governança de perfis, escopos e trilha de responsabilidade.',
      href: '/dashboard/users',
      icon: Users,
      status: 'Ativo',
      visible:
        isAdmin &&
        isTemporarilyVisibleDashboardRoute('/dashboard/users'),
    },
    {
      id: 'sla',
      label: 'Prazos e SLAs',
      description: 'Acompanhamento de janelas, vencimentos e carga operacional.',
      href: '/dashboard/calendar',
      icon: Clock3,
      status: hasPermission('can_view_dashboard') ? 'Ativo' : 'Sem acesso',
      visible:
        isTemporarilyVisibleDashboardRoute('/dashboard/calendar'),
    },
    {
      id: 'dossiers',
      label: 'Dossiês e evidências',
      description: 'Pacote oficial de conformidade por colaborador e obra/setor.',
      href: '/dashboard/dossiers',
      icon: FileCheck2,
      status: 'Ativo',
      visible:
        isTemporarilyVisibleDashboardRoute('/dashboard/dossiers'),
    },
    {
      id: 'document-pendencies',
      label: 'Pendências documentais',
      description: 'Monitoramento centralizado de pendências críticas e riscos de prazo.',
      href: '/dashboard/document-pendencies',
      icon: ShieldCheck,
      status: hasPermission('can_view_dashboard') ? 'Ativo' : 'Sem acesso',
      visible:
        isTemporarilyVisibleDashboardRoute('/dashboard/document-pendencies'),
    },
    {
      id: 'notifications',
      label: 'Notificações corporativas',
      description: 'Destino de alertas por e-mail, periodicidade e escalonamento.',
      icon: BellRing,
      status: 'Em breve',
      visible: true,
    },
  ].filter((area) => area.visible);

  useEffect(() => {
    let active = true;
    const loadCompany = async () => {
      if (!user?.company_id) {
        setLoadingLogo(false);
        return;
      }
      try {
        const data = await companiesService.findOne(user.company_id);
        if (!active) return;
        setCompany(data);
        setLogoPreview(data.logo_url || null);
      } catch (error) {
        console.error('Erro ao carregar dados da empresa:', error);
        toast.error('Não foi possível carregar a logo da empresa.');
      } finally {
        if (active) setLoadingLogo(false);
      }
    };

    loadCompany();
    return () => {
      active = false;
    };
  }, [user?.company_id]);

  useEffect(() => {
    if (!hasPermission('can_manage_pt')) return;
    let active = true;
    const loadApprovalRules = async () => {
      try {
        setLoadingApprovalRules(true);
        const rules = await ptsService.getApprovalRules();
        if (!active) return;
        setApprovalRules(rules);
      } catch (error) {
        console.error('Erro ao carregar regras de aprovação de PT:', error);
        toast.error('Não foi possível carregar regras de aprovação da PT.');
      } finally {
        if (active) setLoadingApprovalRules(false);
      }
    };

    void loadApprovalRules();
    return () => {
      active = false;
    };
  }, [hasPermission]);

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!currentPassword || !newPassword) {
      toast.error('Preencha a senha atual e a nova senha.');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('A confirmação da senha não confere.');
      return;
    }

    try {
      setSaving(true);
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      toast.success('Senha alterada com sucesso.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Erro ao trocar senha:', error);
      toast.error('Não foi possível alterar a senha.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione um arquivo de imagem válido.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result?.toString() || '';
      setLogoPreview(result || null);
      setLogoDraft(result || null);
      setLogoRemoved(false);
    };
    reader.onerror = () => {
      toast.error('Não foi possível ler a imagem.');
    };
    reader.readAsDataURL(file);
  };

  const shouldRetryLogoUpdate = (error: unknown) => {
    if (!axios.isAxiosError(error)) return false;
    const status = error.response?.status;
    return (
      error.code === 'ECONNABORTED' ||
      !status ||
      (status >= 500 && status <= 599)
    );
  };

  const updateLogoWithRetry = async (
    companyId: string,
    logoUrl: string | null,
  ) => {
    const maxAttempts = 3;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await companiesService.update(companyId, {
          logo_url: logoUrl,
        });
      } catch (error) {
        lastError = error;
        if (!shouldRetryLogoUpdate(error) || attempt === maxAttempts) {
          throw error;
        }
        const backoffMs =
          400 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 150);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
    throw lastError;
  };

  const handleSaveLogo = async () => {
    if (!user?.company_id) {
      toast.error('Empresa não encontrada.');
      return;
    }
    const nextLogo = logoRemoved ? null : logoDraft ?? logoPreview ?? null;
    try {
      setSavingLogo(true);
      const updated = await updateLogoWithRetry(user.company_id, nextLogo);
      setCompany(updated);
      setLogoPreview(updated.logo_url || null);
      setLogoDraft(null);
      setLogoRemoved(false);
      toast.success('Logo atualizada com sucesso.');
    } catch (error) {
      console.error('Erro ao salvar logo:', error);
      toast.error('Não foi possível salvar a logo.');
    } finally {
      setSavingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setLogoDraft(null);
    setLogoRemoved(true);
  };

  const handleApprovalRuleChange = (
    key: keyof PtApprovalRules,
    checked: boolean,
  ) => {
    setApprovalRules((current) => {
      if (!current) return current;
      return { ...current, [key]: checked };
    });
  };

  const handleSaveApprovalRules = async () => {
    if (!approvalRules) return;
    try {
      setSavingApprovalRules(true);
      const updated = await ptsService.updateApprovalRules(approvalRules);
      setApprovalRules(updated);
      toast.success('Regras de aprovação de PT atualizadas.');
    } catch (error) {
      console.error('Erro ao salvar regras de aprovação de PT:', error);
      toast.error('Não foi possível salvar as regras de aprovação de PT.');
    } finally {
      setSavingApprovalRules(false);
    }
  };

  return (
    <div className="ds-system-scope space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--ds-color-action-primary)] text-white">
          <Settings className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">Configurações</h1>
          <p className="text-sm text-[var(--ds-color-text-secondary)]">Gerencie sua conta e os recursos do sistema.</p>
        </div>
      </div>

      {hasPermission('can_use_ai') ? <SophieStatusCard /> : null}

      {hasPermission('can_use_ai') && (
        <div className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--ds-color-text-primary)]">Privacidade — Processamento por IA</h2>
          <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
            O agente SOPHIE envia dados estatísticos do sistema para a OpenAI (EUA) para gerar respostas.
            Nenhum nome, CPF ou dado individual de trabalhadores é transmitido.
          </p>
          <label className="mt-4 flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
              Permitir processamento por IA (LGPD)
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={aiConsent ? 'true' : 'false'}
              disabled={savingAiConsent}
              onClick={async () => {
                const next = !aiConsent;
                setSavingAiConsent(true);
                try {
                  await usersService.updateAiConsent(next);
                  setAiConsent(next);
                  toast.success(next ? 'IA habilitada.' : 'IA desabilitada. Consentimento revogado.');
                } catch {
                  toast.error('Não foi possível salvar. Tente novamente.');
                } finally {
                  setSavingAiConsent(false);
                }
              }}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                aiConsent ? 'bg-[var(--ds-color-action-primary)]' : 'bg-[var(--ds-color-surface-muted)]'
              } ${savingAiConsent ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  aiConsent ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </label>
        </div>
      )}

      <div className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ds-color-text-primary)]">
              Centro de governança operacional
            </h2>
            <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
              Controle central de acessos, SLAs, conformidade documental e fluxos críticos.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ds-color-text-secondary)]">
            Base enterprise
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {governanceAreas.map((area) => {
            const Icon = area.icon;
            const isClickable = Boolean(area.href && area.status !== 'Em breve');
            const statusTone =
              area.status === 'Ativo'
                ? 'border-[var(--ds-color-success-border)] bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)]'
                : area.status === 'Sem acesso'
                  ? 'border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] text-[var(--ds-color-warning)]'
                  : 'border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)]';

            if (!isClickable) {
              return (
                <div
                  key={area.id}
                  className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)]/24 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-primary)]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusTone}`}>
                      {area.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[var(--ds-color-text-primary)]">{area.label}</p>
                  <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">{area.description}</p>
                </div>
              );
            }

            return (
              <Link
                key={area.id}
                href={area.href!}
                className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-4 py-3 transition-colors hover:border-[var(--ds-color-action-primary)]/35 hover:bg-[var(--ds-color-primary-subtle)]/35"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-primary)]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusTone}`}>
                    {area.status}
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold text-[var(--ds-color-text-primary)]">{area.label}</p>
                <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">{area.description}</p>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--ds-color-text-primary)]">Trocar senha</h2>
          <p className="text-sm text-[var(--ds-color-text-secondary)]">Mantenha seu acesso seguro atualizando sua senha.</p>

          <form onSubmit={handleChangePassword} className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-[var(--ds-color-text-secondary)]">Senha atual</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Digite sua senha atual"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--ds-color-text-secondary)]">Nova senha</label>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Digite a nova senha"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--ds-color-text-secondary)]">Confirmar nova senha</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Confirme a nova senha"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-[var(--ds-radius-md)] bg-[var(--ds-color-action-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--ds-color-action-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Atualizar senha'}
            </button>
          </form>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[var(--ds-color-text-primary)]">Dados da conta</h2>
            <div className="mt-4 space-y-2 text-sm text-[var(--ds-color-text-secondary)]">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--ds-color-text-secondary)]">Usuário</span>
                <span>{user?.nome}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--ds-color-text-secondary)]">CPF</span>
                <span>{user?.cpf}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-[var(--ds-color-text-secondary)]">Perfil</span>
                <span>{user?.profile?.nome}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[var(--ds-color-text-primary)]">Logo da empresa</h2>
            <p className="text-sm text-[var(--ds-color-text-secondary)]">Atualize a marca exibida nos relatórios e PDFs.</p>
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)]">
                  {logoPreview ? (
                    <Image
                      src={logoPreview}
                      alt="Logo da empresa"
                      width={80}
                      height={80}
                      className="h-full w-full object-contain"
                      unoptimized
                    />
                  ) : (
                    <span className="text-xs text-[var(--ds-color-text-secondary)]">Sem logo</span>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium text-[var(--ds-color-text-secondary)]">{company?.razao_social || 'Empresa'}</p>
                  <input
                    aria-label="Upload de logo"
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="block w-full text-sm text-[var(--ds-color-text-secondary)] file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--ds-color-surface-muted)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--ds-color-text-secondary)] hover:file:bg-[var(--ds-color-primary-subtle)]"
                    disabled={loadingLogo}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleSaveLogo}
                  disabled={savingLogo || loadingLogo}
                  className="rounded-[var(--ds-radius-md)] bg-[var(--ds-color-action-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--ds-color-action-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingLogo ? 'Salvando...' : 'Salvar logo'}
                </button>
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  disabled={savingLogo || loadingLogo}
                  className="rounded-lg border border-[var(--ds-color-border-default)] px-4 py-2 text-sm font-semibold text-[var(--ds-color-text-secondary)] transition hover:border-[var(--ds-color-border-strong)] hover:text-[var(--ds-color-text-primary)] disabled:cursor-not-allowed"
                >
                  Remover
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-[var(--ds-color-text-primary)]">Gestão do sistema</h2>
            <p className="text-sm text-[var(--ds-color-text-secondary)]">Acesso rápido aos cadastros e módulos administrativos.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {managementLinks
                .filter(
                  (link) =>
                    isTemporarilyVisibleDashboardRoute(link.href) &&
                    (link.adminOnly ? isAdmin : true),
                )
                .map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="flex items-center gap-3 rounded-lg border border-[var(--ds-color-border-default)] px-4 py-3 text-sm font-medium text-[var(--ds-color-text-secondary)] transition hover:border-[var(--ds-color-action-primary)] hover:text-[var(--ds-color-action-primary)]"
                    >
                      <Icon className="h-5 w-5" />
                      {link.label}
                    </Link>
                  );
                })}
              {!isAdmin && (
                <div className="rounded-lg border border-dashed border-[var(--ds-color-border-subtle)] px-4 py-3 text-sm text-[var(--ds-color-text-secondary)]">
                  Solicite ao administrador para liberar acessos avançados.
                </div>
              )}
            </div>
          </div>

          {hasPermission('can_manage_pt') && (
            <div
              id="regras-pt"
              className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-6 shadow-sm"
            >
              <h2 className="text-lg font-semibold text-[var(--ds-color-text-primary)]">
                Regras de bloqueio da PT
              </h2>
              <p className="text-sm text-[var(--ds-color-text-secondary)]">
                Configure quando o sistema deve bloquear a aprovação de permissões de trabalho.
              </p>
              <div className="mt-4 space-y-3">
                {loadingApprovalRules ? (
                  <p className="text-sm text-[var(--ds-color-text-secondary)]">Carregando regras...</p>
                ) : approvalRules ? (
                  <>
                    <label className="flex items-center justify-between gap-4 rounded-lg border border-[var(--ds-color-border-default)] px-3 py-2 text-sm">
                      <span>Bloquear risco crítico sem evidência de controle</span>
                      <input
                        type="checkbox"
                        checked={approvalRules.blockCriticalRiskWithoutEvidence}
                        onChange={(event) =>
                          handleApprovalRuleChange(
                            'blockCriticalRiskWithoutEvidence',
                            event.target.checked,
                          )
                        }
                      />
                    </label>
                    <label className="flex items-center justify-between gap-4 rounded-lg border border-[var(--ds-color-border-default)] px-3 py-2 text-sm">
                      <span>Bloquear trabalhador com treinamento bloqueante vencido</span>
                      <input
                        type="checkbox"
                        checked={approvalRules.blockWorkerWithExpiredBlockingTraining}
                        onChange={(event) =>
                          handleApprovalRuleChange(
                            'blockWorkerWithExpiredBlockingTraining',
                            event.target.checked,
                          )
                        }
                      />
                    </label>
                    <label className="flex items-center justify-between gap-4 rounded-lg border border-[var(--ds-color-border-default)] px-3 py-2 text-sm">
                      <span>Exigir ao menos um executante na PT</span>
                      <input
                        type="checkbox"
                        checked={approvalRules.requireAtLeastOneExecutante}
                        onChange={(event) =>
                          handleApprovalRuleChange(
                            'requireAtLeastOneExecutante',
                            event.target.checked,
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleSaveApprovalRules}
                      disabled={savingApprovalRules}
                      className="w-full rounded-[var(--ds-radius-md)] bg-[var(--ds-color-action-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--ds-color-action-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingApprovalRules ? 'Salvando regras...' : 'Salvar regras de PT'}
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-[var(--ds-color-text-secondary)]">
                    Não foi possível carregar as regras da empresa atual.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
