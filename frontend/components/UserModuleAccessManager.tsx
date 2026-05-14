"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCcw, Save, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { authService } from "@/services/authService";
import { companiesService, type Company } from "@/services/companiesService";
import {
  type User,
  type UserModuleAccessOption,
  usersService,
} from "@/services/usersService";

type UserModuleAccessManagerProps = {
  enabled: boolean;
};

export function UserModuleAccessManager({
  enabled,
}: UserModuleAccessManagerProps) {
  const { user, isAdminGeral } = useAuth();
  const [moduleOptions, setModuleOptions] = useState<UserModuleAccessOption[]>(
    [],
  );
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [companyOptions, setCompanyOptions] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedModuleKeys, setSelectedModuleKeys] = useState<string[]>([]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedKeysSet = useMemo(
    () => new Set(selectedModuleKeys),
    [selectedModuleKeys],
  );
  const activeCompanyId = isAdminGeral
    ? selectedCompanyId
    : user?.company_id || "";

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let active = true;
    const loadOptions = async () => {
      try {
        setLoadingOptions(true);
        const response = await usersService.getModuleAccessOptions();
        if (!active) {
          return;
        }
        setModuleOptions(response.modules);
      } catch {
        if (active) {
          toast.error("Não foi possível carregar os módulos liberáveis.");
        }
      } finally {
        if (active) {
          setLoadingOptions(false);
        }
      }
    };

    void loadOptions();

    return () => {
      active = false;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !isAdminGeral) {
      return;
    }

    let active = true;
    const loadCompanies = async () => {
      try {
        setLoadingCompanies(true);
        const list = await companiesService.findAll();
        if (!active) {
          return;
        }
        setCompanyOptions(list);
      } catch {
        if (active) {
          toast.error("Não foi possível carregar as empresas.");
        }
      } finally {
        if (active) {
          setLoadingCompanies(false);
        }
      }
    };

    void loadCompanies();

    return () => {
      active = false;
    };
  }, [enabled, isAdminGeral]);

  useEffect(() => {
    setSelectedUserId("");
    setSelectedUser(null);
    setSelectedModuleKeys([]);
    setCurrentPassword("");
    setUserSearch("");
  }, [activeCompanyId]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!activeCompanyId) {
      setSearchResults([]);
      setLoadingUsers(false);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        setLoadingUsers(true);
        const response = await usersService.findPaginated({
          page: 1,
          limit: 25,
          search: userSearch.trim() || undefined,
          companyId: activeCompanyId || undefined,
        });
        if (!active) {
          return;
        }
        setSearchResults(response.data);
      } catch {
        if (active) {
          toast.error("Não foi possível carregar os usuários da empresa.");
        }
      } finally {
        if (active) {
          setLoadingUsers(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [enabled, activeCompanyId, userSearch]);

  useEffect(() => {
    if (!enabled || !selectedUserId) {
      setSelectedUser(null);
      setSelectedModuleKeys([]);
      setCurrentPassword("");
      return;
    }

    setCurrentPassword("");
    let active = true;
    const loadSelectedUser = async () => {
      try {
        const loaded = await usersService.findOne(
          selectedUserId,
          activeCompanyId || undefined,
        );
        if (!active) {
          return;
        }
        setSelectedUser(loaded);
        setSelectedModuleKeys(loaded.module_access_keys ?? []);
      } catch {
        if (active) {
          toast.error("Não foi possível carregar os módulos deste usuário.");
        }
      }
    };

    void loadSelectedUser();

    return () => {
      active = false;
    };
  }, [enabled, selectedUserId, activeCompanyId]);

  const handleToggleModule = (key: string) => {
    setSelectedModuleKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  };

  const handleReset = () => {
    if (!selectedUser) {
      return;
    }

    setSelectedModuleKeys(selectedUser.module_access_keys ?? []);
    setCurrentPassword("");
  };

  const handleSave = async () => {
    if (!selectedUser) {
      toast.error("Selecione um usuário antes de salvar.");
      return;
    }

    if (!currentPassword.trim()) {
      toast.error("Confirme sua senha para alterar os módulos.");
      return;
    }

    try {
      setSaving(true);
      const stepUp = await authService.verifyStepUp({
        reason: "user_module_access_change",
        password: currentPassword,
      });
      const updated = await usersService.updateModuleAccess(
        selectedUser.id,
        selectedModuleKeys,
        stepUp.stepUpToken,
        activeCompanyId || undefined,
      );
      setSelectedUser(updated);
      setSelectedModuleKeys(updated.module_access_keys ?? []);
      setCurrentPassword("");
      toast.success("Módulos do usuário atualizados com sucesso.");
    } catch {
      toast.error("Não foi possível atualizar os módulos do usuário.");
    } finally {
      setSaving(false);
    }
  };

  const selectedSummary = selectedUser
    ? `${selectedModuleKeys.length} módulo(s) liberado(s)`
    : "Selecione um usuário para editar";
  const selectedCompany = companyOptions.find(
    (companyOption) => companyOption.id === activeCompanyId,
  );

  if (!enabled) {
    return null;
  }

  return (
    <div className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ds-color-text-primary)]">
            Módulos por usuário
          </h2>
          <p className="text-sm text-[var(--ds-color-text-secondary)]">
            Libere módulos por usuário sem editar código. Alteração protegida
            por step-up.
          </p>
        </div>
        <div className="rounded-lg border border-[var(--ds-color-border-default)] px-3 py-2 text-sm font-medium text-[var(--ds-color-text-secondary)]">
          {selectedSummary}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          {isAdminGeral && (
            <div>
              <label className="block text-sm font-medium text-[var(--ds-color-text-secondary)]">
                Empresa
              </label>
              <select
                value={selectedCompanyId}
                onChange={(event) => setSelectedCompanyId(event.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)]"
                disabled={loadingCompanies}
              >
                <option value="">Selecione...</option>
                {companyOptions.map((companyOption) => (
                  <option key={companyOption.id} value={companyOption.id}>
                    {companyOption.razao_social}
                    {companyOption.cnpj ? ` - ${companyOption.cnpj}` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[var(--ds-color-text-secondary)]">
                {loadingCompanies
                  ? "Carregando empresas..."
                  : "Selecione a empresa para carregar usuários e módulos."}
              </p>
            </div>
          )}

          {!isAdminGeral && user?.company_id && (
            <div className="rounded-lg border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)]/20 px-3 py-3 text-sm">
              <p className="font-semibold text-[var(--ds-color-text-primary)]">
                {selectedCompany?.razao_social || "Empresa atual"}
              </p>
              <p className="mt-1 text-[var(--ds-color-text-secondary)]">
                Contexto fixo do administrador da empresa.
              </p>
            </div>
          )}

          {isAdminGeral && !activeCompanyId && (
            <div className="rounded-lg border border-dashed border-[var(--ds-color-border-subtle)] px-3 py-3 text-sm text-[var(--ds-color-text-secondary)]">
              Escolha uma empresa para carregar os usuários.
            </div>
          )}

          <label className="block text-sm font-medium text-[var(--ds-color-text-secondary)]">
            Buscar usuário
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-color-text-secondary)]" />
            <input
              type="search"
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder="Nome, CPF ou e-mail"
              className="w-full rounded-md border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] py-2 pl-9 pr-3 text-sm text-[var(--ds-color-text-primary)]"
              disabled={!activeCompanyId}
            />
          </div>

          <label className="block text-sm font-medium text-[var(--ds-color-text-secondary)]">
            Usuário
          </label>
          <select
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            className="w-full rounded-md border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)]"
            disabled={loadingUsers}
          >
            <option value="">Selecione...</option>
            {searchResults.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.nome} {candidate.cpf ? `- ${candidate.cpf}` : ""}
              </option>
            ))}
            {selectedUser &&
              !searchResults.some(
                (candidate) => candidate.id === selectedUser.id,
              ) && (
                <option value={selectedUser.id}>
                  {selectedUser.nome}{" "}
                  {selectedUser.cpf ? `- ${selectedUser.cpf}` : ""}
                </option>
              )}
          </select>
          <p className="text-xs text-[var(--ds-color-text-secondary)]">
            {loadingUsers
              ? "Carregando usuários..."
              : isAdminGeral
                ? "A busca respeita a empresa selecionada."
                : "A busca é limitada à empresa atual."}
          </p>

          {selectedUser && (
            <div className="rounded-lg border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)]/20 px-3 py-3 text-sm">
              <p className="font-semibold text-[var(--ds-color-text-primary)]">
                {selectedUser.nome}
              </p>
              <p className="mt-1 text-[var(--ds-color-text-secondary)]">
                {selectedUser.email || "Sem e-mail"} ·{" "}
                {selectedUser.funcao || "Sem função"}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-[var(--ds-color-text-secondary)]">
              Catálogo de módulos
            </p>
            <p className="text-xs text-[var(--ds-color-text-secondary)]">
              Cada módulo libera o conjunto de permissões associado.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {moduleOptions.map((option) => {
              const checked = selectedKeysSet.has(option.key);
              return (
                <label
                  key={option.key}
                  className={`flex h-full cursor-pointer flex-col gap-2 rounded-lg border px-4 py-3 text-left transition ${
                    checked
                      ? "border-[var(--ds-color-action-primary)] bg-[var(--ds-color-action-primary-subtle)]"
                      : "border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)]"
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--ds-color-text-primary)]">
                      <ShieldCheck className="h-4 w-4" />
                      {option.label}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggleModule(option.key)}
                      className="h-4 w-4"
                      disabled={!selectedUser}
                    />
                  </span>
                  <span className="text-xs text-[var(--ds-color-text-secondary)]">
                    {option.description}
                  </span>
                  <span className="text-[11px] text-[var(--ds-color-text-secondary)]">
                    Permissões: {option.permissions.join(", ")}
                  </span>
                </label>
              );
            })}
            {loadingOptions && (
              <div className="rounded-lg border border-dashed border-[var(--ds-color-border-subtle)] px-4 py-3 text-sm text-[var(--ds-color-text-secondary)]">
                Carregando catálogo de módulos...
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
            <div>
              <label className="block text-sm font-medium text-[var(--ds-color-text-secondary)]">
                Senha para confirmar
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Senha atual"
                className="mt-1 w-full rounded-md border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)]"
                disabled={!selectedUser}
              />
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center justify-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] px-4 py-2 text-sm font-semibold text-[var(--ds-color-text-secondary)] transition hover:border-[var(--ds-color-border-strong)] hover:text-[var(--ds-color-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedUser}
            >
              <RefreshCcw className="h-4 w-4" />
              Reverter
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center justify-center gap-2 rounded-[var(--ds-radius-md)] bg-[var(--ds-color-action-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--ds-color-action-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedUser || saving}
            >
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : "Salvar módulos"}
            </button>
          </div>
        </div>
      </div>

      {!moduleOptions.length && !loadingOptions && (
        <div className="mt-4 rounded-lg border border-dashed border-[var(--ds-color-border-subtle)] px-4 py-3 text-sm text-[var(--ds-color-text-secondary)]">
          Nenhum módulo configurável disponível.
        </div>
      )}
    </div>
  );
}
