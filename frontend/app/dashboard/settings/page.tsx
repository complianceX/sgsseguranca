'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from 'sonner';
import axios from 'axios';
import { Settings, ShieldCheck, Users, Building2, Map, HardHat, AlertTriangle, Wrench, Construction } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { companiesService, Company } from '@/services/companiesService';
import { ptsService, PtApprovalRules } from '@/services/ptsService';

export default function SettingsPage() {
  const { user, hasPermission } = useAuth();
  const isAdmin = user?.profile?.nome === 'Administrador Geral';
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
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
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
          <Settings className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
          <p className="text-sm text-gray-500">Gerencie sua conta e os recursos do sistema.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Trocar senha</h2>
          <p className="text-sm text-gray-500">Mantenha seu acesso seguro atualizando sua senha.</p>

          <form onSubmit={handleChangePassword} className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Senha atual</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Digite sua senha atual"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Nova senha</label>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Digite a nova senha"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Confirmar nova senha</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Confirme a nova senha"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {saving ? 'Salvando...' : 'Atualizar senha'}
            </button>
          </form>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Dados da conta</h2>
            <div className="mt-4 space-y-2 text-sm text-gray-600">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-700">Usuário</span>
                <span>{user?.nome}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-700">CPF</span>
                <span>{user?.cpf}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-700">Perfil</span>
                <span>{user?.profile?.nome}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Logo da empresa</h2>
            <p className="text-sm text-gray-500">Atualize a marca exibida nos relatórios e PDFs.</p>
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
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
                    <span className="text-xs text-gray-400">Sem logo</span>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium text-gray-700">{company?.razao_social || 'Empresa'}</p>
                  <input
                    aria-label="Upload de logo"
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
                    disabled={loadingLogo}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleSaveLogo}
                  disabled={savingLogo || loadingLogo}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {savingLogo ? 'Salvando...' : 'Salvar logo'}
                </button>
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  disabled={savingLogo || loadingLogo}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:border-gray-300 hover:text-gray-800 disabled:cursor-not-allowed"
                >
                  Remover
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Gestão do sistema</h2>
            <p className="text-sm text-gray-500">Acesso rápido aos cadastros e módulos administrativos.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {managementLinks
                .filter((link) => (link.adminOnly ? isAdmin : true))
                .map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition hover:border-blue-500 hover:text-blue-700"
                    >
                      <Icon className="h-5 w-5" />
                      {link.label}
                    </Link>
                  );
                })}
              {!isAdmin && (
                <div className="rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">
                  Solicite ao administrador para liberar acessos avançados.
                </div>
              )}
            </div>
          </div>

          {hasPermission('can_manage_pt') && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">
                Regras de bloqueio da PT
              </h2>
              <p className="text-sm text-gray-500">
                Configure quando o sistema deve bloquear a aprovação de permissões de trabalho.
              </p>
              <div className="mt-4 space-y-3">
                {loadingApprovalRules ? (
                  <p className="text-sm text-gray-500">Carregando regras...</p>
                ) : approvalRules ? (
                  <>
                    <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-3 py-2 text-sm">
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
                    <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                      <span>Bloquear trabalhador sem ASO válido</span>
                      <input
                        type="checkbox"
                        checked={approvalRules.blockWorkerWithoutValidMedicalExam}
                        onChange={(event) =>
                          handleApprovalRuleChange(
                            'blockWorkerWithoutValidMedicalExam',
                            event.target.checked,
                          )
                        }
                      />
                    </label>
                    <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-3 py-2 text-sm">
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
                    <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-3 py-2 text-sm">
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
                      className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {savingApprovalRules ? 'Salvando regras...' : 'Salvar regras de PT'}
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">
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
