'use client';

import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { ApiStatusBanner } from '@/components/ApiStatusBanner';
import CompanySelectorModal from '@/components/CompanySelectorModal';
import { OnboardingModal } from '@/components/OnboardingModal';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { selectedTenantStore } from '@/lib/selectedTenantStore';
import { Company } from '@/services/companiesService';
import { Building2, ChevronsUpDown } from 'lucide-react';
import { MobileFieldNav } from '@/components/MobileFieldNav';
import { CommandPalette } from '@/components/CommandPalette';
import { AIButton } from '@/components/AIButton';
import { isTemporarilyHiddenDashboardRoute } from '@/lib/temporarilyHiddenModules';

const UUID_LIKE_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuidLike = (value?: string | null): value is string =>
  typeof value === 'string' && UUID_LIKE_REGEX.test(value.trim());

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, hasPermission, logout, isAdminGeral } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(() => selectedTenantStore.get());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const hasValidSelectedTenant = Boolean(
    selectedTenant?.companyId && isUuidLike(selectedTenant.companyId),
  );

  useEffect(() => {
    if (!isAdminGeral) {
      return;
    }

    const tenant = selectedTenantStore.get();
    if (tenant?.companyId && !isUuidLike(tenant.companyId)) {
      selectedTenantStore.clear();
      setSelectedTenant(null);
    }
  }, [isAdminGeral]);

  // Abre seletor automaticamente se Admin Geral sem empresa escolhida
  useEffect(() => {
    const selectedTenantFromStore = selectedTenantStore.get();
    const hasValidTenant =
      Boolean(selectedTenantFromStore?.companyId) &&
      isUuidLike(selectedTenantFromStore!.companyId);
    if (!loading && user && isAdminGeral && !hasValidTenant) {
      setSelectorOpen(true);
    }
  }, [loading, user, isAdminGeral]);

  // Sincroniza estado com a store
  useEffect(() => {
    const unsub = selectedTenantStore.subscribe((t) => setSelectedTenant(t));
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }

    if (!loading && user && isTemporarilyHiddenDashboardRoute(pathname)) {
      router.push('/dashboard');
      return;
    }

    const adminRoutes = [
      '/dashboard/companies',
      '/dashboard/sites',
      '/dashboard/users',
      '/dashboard/activities',
      '/dashboard/risks',
      '/dashboard/epis',
      '/dashboard/tools',
      '/dashboard/machines',
    ];

    const isAdminRoute = adminRoutes.some(route => pathname.startsWith(route));
    const hasRiskPermission = hasPermission('can_view_risks');

    if (
      !loading &&
      user &&
      isAdminRoute &&
      !isAdminGeral &&
      !(pathname.startsWith('/dashboard/risks') && hasRiskPermission)
    ) {
      router.push('/dashboard');
    }
  }, [user, loading, router, pathname, hasPermission, isAdminGeral]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const handleCompanySelect = (company: Company) => {
    selectedTenantStore.set({ companyId: company.id, companyName: company.razao_social });
    setSelectedTenant({ companyId: company.id, companyName: company.razao_social });
    setSelectorOpen(false);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--ds-color-action-primary)] border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--ds-color-bg-canvas)] px-6 text-center text-[var(--ds-color-text-primary)]">
        <div className="max-w-md rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-gradient-surface)] p-5 shadow-[var(--ds-shadow-sm)]">
          <h2 className="text-lg font-bold text-[var(--ds-color-text-primary)]">Sessão não encontrada</h2>
          <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
            Sua sessão expirou ou o acesso não foi carregado corretamente. Volte para o login e tente novamente.
          </p>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="mt-4 w-full rounded-xl bg-[image:var(--ds-gradient-brand)] px-4 py-2 text-[13px] font-semibold text-white transition-all hover:-translate-y-px hover:brightness-105"
          >
            Ir para login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-shell-backdrop ds-system-scope ds-density-compact flex h-screen">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onOpenMobileNav={() => setSidebarOpen(true)} />
        {/* Badge da empresa selecionada para Admin Geral */}
        {isAdminGeral && (
          <div className="flex items-center justify-between border-b border-[color:var(--ds-color-info)]/18 bg-[color:var(--ds-color-info)]/10 px-5 py-2.5 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sm text-[var(--ds-color-text-secondary)]">
              <Building2 className="h-4 w-4 text-[var(--ds-color-info)]" />
              {hasValidSelectedTenant ? (
                <span>
                  Operando em: <span className="font-semibold text-[var(--ds-color-text-primary)]">{selectedTenant.companyName}</span>
                </span>
              ) : (
                <span className="text-[var(--ds-color-warning)]">Nenhuma empresa selecionada</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectorOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-[color:var(--ds-color-info)]/20 bg-[color:var(--ds-color-info)]/10 px-3 py-1.5 text-[11px] font-semibold text-[var(--ds-color-info)] transition-colors hover:bg-[color:var(--ds-color-info)]/16 hover:text-[var(--ds-color-text-primary)]"
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
              Trocar empresa
            </button>
          </div>
        )}
        <ApiStatusBanner />
        <main className="flex-1 overflow-y-auto px-4 py-4 pb-28 sm:px-5 xl:px-6 xl:pb-5">
          {isAdminGeral && !hasValidSelectedTenant ? (
            <div className="flex min-h-[70vh] items-center justify-center">
              <div className="max-w-md rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-gradient-surface)] p-6 text-center shadow-[var(--ds-shadow-sm)]">
                <h2 className="text-lg font-semibold text-[var(--ds-color-text-primary)]">
                  Selecione uma empresa para continuar
                </h2>
                <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
                  Para evitar falhas de contexto de tenant nos documentos, escolha a empresa ativa.
                </p>
                <button
                  type="button"
                  onClick={() => setSelectorOpen(true)}
                  className="mt-4 rounded-xl bg-[image:var(--ds-gradient-brand)] px-4 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-px hover:brightness-105"
                >
                  Selecionar empresa
                </button>
              </div>
            </div>
          ) : (
            children
          )}
        </main>
        <AIButton />
        <CommandPalette />
        <MobileFieldNav />
      </div>

      <CompanySelectorModal
        open={selectorOpen}
        onSelect={handleCompanySelect}
        onLogout={logout}
        currentCompanyId={
          hasValidSelectedTenant ? selectedTenant?.companyId : null
        }
        onClose={() => setSelectorOpen(false)}
      />
      <OnboardingModal userId={user?.id} />
    </div>
  );
}
