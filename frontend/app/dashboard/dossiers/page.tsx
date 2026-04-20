'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  dossiersService,
  type EmployeeDossierContext,
  type SiteDossierContext,
} from '@/services/dossiersService';
import { sitesService, Site } from '@/services/sitesService';
import { usersService, User } from '@/services/usersService';
import { useAuth } from '@/context/AuthContext';
import { extractApiErrorMessage } from '@/lib/error-handler';
import { Archive, FileDown, ShieldCheck, TriangleAlert } from 'lucide-react';

type PreviewTarget = 'employee' | 'site' | null;

export default function DossiersPage() {
  const { loading: authLoading, hasPermission } = useAuth();
  const canViewDossiers = hasPermission('can_view_dossiers');
  const [userOptions, setUserOptions] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<null | 'employee' | 'site' | 'employee-bundle' | 'site-bundle'>(
    null,
  );
  const [userSearch, setUserSearch] = useState('');
  const deferredUserSearch = useDeferredValue(userSearch);
  const [siteSearch, setSiteSearch] = useState('');
  const deferredSiteSearch = useDeferredValue(siteSearch);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [employeeContext, setEmployeeContext] =
    useState<EmployeeDossierContext | null>(null);
  const [siteContext, setSiteContext] = useState<SiteDossierContext | null>(
    null,
  );
  const [activePreviewTarget, setActivePreviewTarget] =
    useState<PreviewTarget>(null);
  const [employeePreviewLoading, setEmployeePreviewLoading] = useState(false);
  const [sitePreviewLoading, setSitePreviewLoading] = useState(false);
  const [employeePreviewError, setEmployeePreviewError] =
    useState<string | null>(null);
  const [sitePreviewError, setSitePreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!canViewDossiers) {
      setSites([]);
      setLoading(false);
      return;
    }

    const loadSites = async () => {
      try {
        setLoading(true);
        const sitesPage = await sitesService.findPaginated({
          page: 1,
          limit: 25,
          search: deferredSiteSearch || undefined,
        });
        let nextSites = sitesPage.data;
        if (selectedSiteId && !nextSites.some((item) => item.id === selectedSiteId)) {
          try {
            const currentSite = await sitesService.findOne(selectedSiteId);
            nextSites = dedupeById([currentSite, ...nextSites]);
          } catch {
            nextSites = dedupeById(nextSites);
          }
        } else {
          nextSites = dedupeById(nextSites);
        }
        setSites(nextSites);
      } catch (error) {
        console.error('Erro ao carregar dossies:', error);
        toast.error(
          await extractApiErrorMessage(
            error,
            'Erro ao carregar dados para emissão de dossiê.',
          ),
        );
      } finally {
        setLoading(false);
      }
    };

    void loadSites();
  }, [canViewDossiers, deferredSiteSearch, selectedSiteId]);

  useEffect(() => {
    if (!canViewDossiers) {
      setUserOptions([]);
      return;
    }

    const loadUsers = async () => {
      try {
        const usersPage = await usersService.findPaginated({
          page: 1,
          limit: 20,
          search: deferredUserSearch || undefined,
          siteId: selectedSiteId || undefined,
        });
        setUserOptions(usersPage.data);
      } catch (error) {
        console.error('Erro ao carregar colaboradores para dossie:', error);
        toast.error(
          await extractApiErrorMessage(
            error,
            'Erro ao carregar colaboradores para dossiê.',
          ),
        );
      }
    };

    void loadUsers();
  }, [canViewDossiers, deferredUserSearch, selectedSiteId]);

  useEffect(() => {
    let active = true;

    async function loadPreview() {
      if (!selectedUserId) {
        setEmployeeContext(null);
        setEmployeePreviewError(null);
        setEmployeePreviewLoading(false);
        return;
      }

      try {
        setEmployeePreviewLoading(true);
        setEmployeePreviewError(null);
        const context = await dossiersService.getEmployeeContext(selectedUserId);
        if (active) {
          setEmployeeContext(context);
        }
      } catch (error) {
        console.error('Erro ao carregar contexto de dossiê do colaborador:', error);
        if (active) {
          const message = await extractApiErrorMessage(
            error,
            'Não foi possível carregar a prévia do dossiê do colaborador.',
          );
          setEmployeeContext(null);
          setEmployeePreviewError(message);
        }
      } finally {
        if (active) {
          setEmployeePreviewLoading(false);
        }
      }
    }

    void loadPreview();
    return () => {
      active = false;
    };
  }, [selectedUserId]);

  useEffect(() => {
    let active = true;

    async function loadPreview() {
      if (!selectedSiteId) {
        setSiteContext(null);
        setSitePreviewError(null);
        setSitePreviewLoading(false);
        return;
      }

      try {
        setSitePreviewLoading(true);
        setSitePreviewError(null);
        const context = await dossiersService.getSiteContext(selectedSiteId);
        if (active) {
          setSiteContext(context);
        }
      } catch (error) {
        console.error('Erro ao carregar contexto de dossiê da obra/setor:', error);
        if (active) {
          const message = await extractApiErrorMessage(
            error,
            'Não foi possível carregar a prévia do dossiê da obra/setor.',
          );
          setSiteContext(null);
          setSitePreviewError(message);
        }
      } finally {
        if (active) {
          setSitePreviewLoading(false);
        }
      }
    }

    void loadPreview();
    return () => {
      active = false;
    };
  }, [selectedSiteId]);

  useEffect(() => {
    if (activePreviewTarget) {
      return;
    }

    if (selectedUserId) {
      setActivePreviewTarget('employee');
      return;
    }

    if (selectedSiteId) {
      setActivePreviewTarget('site');
    }
  }, [activePreviewTarget, selectedSiteId, selectedUserId]);

  const availableUsers = useMemo(() => {
    if (!selectedUser) {
      return userOptions;
    }

    return [selectedUser, ...userOptions.filter((item) => item.id !== selectedUser.id)];
  }, [selectedUser, userOptions]);
  const availableSites = useMemo(() => {
    if (!selectedSite) {
      return sites;
    }

    return [selectedSite, ...sites.filter((item) => item.id !== selectedSite.id)];
  }, [selectedSite, sites]);
  const activeContext =
    activePreviewTarget === 'employee'
      ? employeeContext
      : activePreviewTarget === 'site'
        ? siteContext
        : null;
  const activePreviewLoading =
    activePreviewTarget === 'employee'
      ? employeePreviewLoading
      : activePreviewTarget === 'site'
        ? sitePreviewLoading
        : false;
  const activePreviewError =
    activePreviewTarget === 'employee'
      ? employeePreviewError
      : activePreviewTarget === 'site'
        ? sitePreviewError
        : null;

  const downloadEmployee = async () => {
    if (!canViewDossiers) {
      toast.error('Voce nao tem permissao para gerar dossie.');
      return;
    }

    if (!selectedUserId) {
      toast.error('Selecione um colaborador.');
      return;
    }
    try {
      setDownloading('employee');
      await dossiersService.downloadEmployeePdf(selectedUserId);
      toast.success('Dossie do colaborador gerado.');
    } catch (error) {
      console.error('Erro ao gerar dossie colaborador:', error);
      const message = await extractApiErrorMessage(
        error,
        'Falha ao gerar dossiê do colaborador.',
      );
      toast.error(message);
    } finally {
      setDownloading(null);
    }
  };

  const downloadSite = async () => {
    if (!canViewDossiers) {
      toast.error('Voce nao tem permissao para gerar dossie.');
      return;
    }

    if (!selectedSiteId) {
      toast.error('Selecione uma obra/setor.');
      return;
    }
    try {
      setDownloading('site');
      await dossiersService.downloadSitePdf(selectedSiteId);
      toast.success('Dossie da obra/setor gerado.');
    } catch (error) {
      console.error('Erro ao gerar dossie obra:', error);
      const message = await extractApiErrorMessage(
        error,
        'Falha ao gerar dossiê da obra/setor.',
      );
      toast.error(message);
    } finally {
      setDownloading(null);
    }
  };

  const downloadEmployeeBundle = async () => {
    if (!canViewDossiers) {
      toast.error('Voce nao tem permissao para gerar dossie.');
      return;
    }

    if (!selectedUserId) {
      toast.error('Selecione um colaborador.');
      return;
    }

    try {
      setDownloading('employee-bundle');
      await dossiersService.downloadEmployeeBundle(selectedUserId);
      toast.success('Pacote ZIP do dossie do colaborador gerado.');
    } catch (error) {
      console.error('Erro ao gerar bundle do dossie colaborador:', error);
      toast.error(
        await extractApiErrorMessage(
          error,
          'Falha ao gerar o pacote ZIP do dossiê do colaborador.',
        ),
      );
    } finally {
      setDownloading(null);
    }
  };

  const downloadSiteBundle = async () => {
    if (!canViewDossiers) {
      toast.error('Voce nao tem permissao para gerar dossie.');
      return;
    }

    if (!selectedSiteId) {
      toast.error('Selecione uma obra/setor.');
      return;
    }

    try {
      setDownloading('site-bundle');
      await dossiersService.downloadSiteBundle(selectedSiteId);
      toast.success('Pacote ZIP do dossie da obra/setor gerado.');
    } catch (error) {
      console.error('Erro ao gerar bundle do dossie da obra/setor:', error);
      toast.error(
        await extractApiErrorMessage(
          error,
          'Falha ao gerar o pacote ZIP do dossiê da obra/setor.',
        ),
      );
    } finally {
      setDownloading(null);
    }
  };

  if (authLoading) {
    return (
      <div className="ds-system-scope">
        <div className="ds-surface-card p-4">
          <p className="text-sm text-[var(--ds-color-text-primary)]">Carregando permissoes...</p>
        </div>
      </div>
    );
  }

  if (!canViewDossiers) {
    return (
      <div className="ds-system-scope">
        <div className="ds-surface-card p-4">
          <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">Dossies de SST</h1>
          <p className="mt-2 text-sm text-[var(--ds-color-text-primary)]">
            Voce nao tem permissao para visualizar o fluxo de dossie.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-system-scope space-y-6">
      <div className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-4 shadow-[var(--ds-shadow-sm)]">
        <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">Dossies de SST</h1>
        <p className="text-[var(--ds-color-text-primary)]">
          Geração automatica de PDF oficial e pacote ZIP auditável por colaborador e obra/setor.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-4 shadow-[var(--ds-shadow-sm)]">
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-text-primary)]">
            Dossie por colaborador
          </p>
          <input
            type="text"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            disabled={loading}
            className="mt-3 w-full rounded-md border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] outline-none motion-safe:transition focus:border-[var(--ds-color-action-primary)]"
            placeholder="Buscar colaborador por nome ou CPF"
          />
          <select
            value={selectedUserId}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedUser(
                availableUsers.find((item) => item.id === value) || null,
              );
              setSelectedUserId(value);
              setActivePreviewTarget(
                value ? 'employee' : selectedSiteId ? 'site' : null,
              );
            }}
            disabled={loading}
            className="mt-3 w-full rounded-md border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] outline-none motion-safe:transition focus:border-[var(--ds-color-action-primary)]"
          >
            <option value="">Selecione um colaborador</option>
            {availableUsers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void downloadEmployee()}
            disabled={loading || downloading !== null}
            className="mt-3 flex w-full items-center justify-center rounded-md bg-[var(--ds-color-action-primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--ds-color-action-primary-hover)] disabled:opacity-60"
          >
            <FileDown className="mr-2 h-4 w-4" />
            {downloading === 'employee' ? 'Gerando...' : 'Baixar PDF'}
          </button>
          <button
            type="button"
            onClick={() => void downloadEmployeeBundle()}
            disabled={loading || downloading !== null}
            className="mt-3 flex w-full items-center justify-center rounded-md border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm font-medium text-[var(--ds-color-text-primary)] hover:bg-[var(--ds-color-surface-muted)] disabled:opacity-60"
          >
            <Archive className="mr-2 h-4 w-4" />
            {downloading === 'employee-bundle'
              ? 'Empacotando...'
              : 'Baixar ZIP + manifesto'}
          </button>
        </div>

        <div className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-4 shadow-[var(--ds-shadow-sm)]">
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-text-primary)]">
            Dossie por obra/setor
          </p>
          <input
            type="text"
            value={siteSearch}
            onChange={(e) => setSiteSearch(e.target.value)}
            disabled={loading}
            className="mt-3 w-full rounded-md border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] outline-none motion-safe:transition focus:border-[var(--ds-color-action-primary)]"
            placeholder="Filtrar obra/setor"
          />
          <select
            value={selectedSiteId}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedSite(
                availableSites.find((item) => item.id === value) || null,
              );
              setSelectedSiteId(value);
              setActivePreviewTarget(
                value ? 'site' : selectedUserId ? 'employee' : null,
              );
            }}
            disabled={loading}
            className="mt-3 w-full rounded-md border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] outline-none motion-safe:transition focus:border-[var(--ds-color-action-primary)]"
          >
            <option value="">Selecione uma obra/setor</option>
            {availableSites.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void downloadSite()}
            disabled={loading || downloading !== null}
            className="mt-3 flex w-full items-center justify-center rounded-md bg-[var(--ds-color-action-primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--ds-color-action-primary-hover)] disabled:opacity-60"
          >
            <FileDown className="mr-2 h-4 w-4" />
            {downloading === 'site' ? 'Gerando...' : 'Baixar PDF'}
          </button>
          <button
            type="button"
            onClick={() => void downloadSiteBundle()}
            disabled={loading || downloading !== null}
            className="mt-3 flex w-full items-center justify-center rounded-md border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm font-medium text-[var(--ds-color-text-primary)] hover:bg-[var(--ds-color-surface-muted)] disabled:opacity-60"
          >
            <Archive className="mr-2 h-4 w-4" />
            {downloading === 'site-bundle'
              ? 'Empacotando...'
              : 'Baixar ZIP + manifesto'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-4 shadow-[var(--ds-shadow-sm)]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[var(--ds-color-text-primary)]" />
            <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-text-primary)]">
              Política de inclusão oficial
            </p>
          </div>
          <div className="mt-4 space-y-3 text-sm text-[var(--ds-color-text-primary)]">
            <p>
              Documentos oficiais entram no dossiê somente quando já existem no registry governado com PDF final válido.
            </p>
            <p>
              Pendências oficiais continuam explícitas no manifesto e nunca são tratadas como documento saudável.
            </p>
            <p>
              Anexos complementares permanecem separados dos documentos oficiais e não substituem evidências governadas.
            </p>
            <p>
              O ZIP inclui contexto serializado, manifesto e apenas artefatos oficiais resolvíveis pelo storage governado.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-4 shadow-[var(--ds-shadow-sm)]">
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--ds-color-text-primary)]">
            Prévia do recorte atual
          </p>
          {activePreviewLoading ? (
            <p className="mt-3 text-sm text-[var(--ds-color-text-primary)]">Atualizando contexto do dossiê...</p>
          ) : activePreviewError ? (
            <div className="mt-4 rounded-lg border border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] px-3 py-3 text-sm text-[var(--ds-color-danger)]">
              <p className="font-semibold text-[var(--ds-color-danger)]">Prévia indisponível</p>
              <p className="mt-1">{activePreviewError}</p>
            </div>
          ) : activeContext ? (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  label="Oficiais"
                  value={activeContext.summary.officialDocuments}
                />
                <MetricCard
                  label="Pendentes"
                  value={activeContext.summary.pendingOfficialDocuments}
                  tone="warning"
                />
                <MetricCard
                  label="Apoio"
                  value={activeContext.summary.supportingAttachments}
                />
                <MetricCard
                  label="Código"
                  value={activeContext.code}
                />
              </div>
              {activeContext.pendingGovernedDocumentLines.length > 0 ? (
                <div className="rounded-lg border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] px-3 py-3 text-sm text-[var(--ds-color-warning)]">
                  <div className="mb-2 flex items-center gap-2 font-semibold">
                    <TriangleAlert className="h-4 w-4" />
                    Pendências oficiais do recorte
                  </div>
                  <ul className="space-y-1">
                    {activeContext.pendingGovernedDocumentLines.slice(0, 4).map((item) => (
                      <li key={`${item.modulo}-${item.referencia}`}>
                        {item.modulo_label}: {item.referencia} — {item.pendencia}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-lg border border-[var(--ds-color-success-border)] bg-[var(--ds-color-success-subtle)] px-3 py-3 text-sm text-[var(--ds-color-success)]">
                  Todos os documentos oficiais já resolvidos para o recorte selecionado.
                </div>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--ds-color-text-primary)]">
              Selecione um colaborador ou uma obra/setor para pré-visualizar o recorte governado do dossiê.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function MetricCard({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'warning';
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-3 ${
        tone === 'warning'
          ? 'border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)]'
          : 'border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-muted)]'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-primary)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[var(--ds-color-text-primary)]">{value}</p>
    </div>
  );
}
