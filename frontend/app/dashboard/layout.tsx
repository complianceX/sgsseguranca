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

  // Abre seletor automaticamente se Admin Geral sem empresa escolhida
  useEffect(() => {
    if (!loading && user && isAdminGeral && !selectedTenantStore.get()) {
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
        <div className="max-w-md rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-5 shadow-[var(--ds-shadow-sm)]">
          <h2 className="text-lg font-bold text-[var(--ds-color-text-primary)]">Sessão não encontrada</h2>
          <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
            Sua sessão expirou ou o acesso não foi carregado corretamente. Volte para o login e tente novamente.
          </p>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="mt-4 w-full rounded-xl bg-[var(--ds-color-action-primary)] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--ds-color-action-primary-hover)]"
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
          <div className="flex items-center justify-between border-b border-[var(--ds-color-border-default)] bg-[var(--ds-color-info-subtle)] px-5 py-3 shadow-[inset_0_-1px_0_rgba(255,255,255,0.35)]">
            <div className="flex items-center gap-2 text-sm text-[var(--ds-color-text-secondary)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl border border-[var(--ds-color-info-border)] bg-white/75 shadow-[var(--ds-shadow-xs)]">
                <Building2 className="h-4 w-4 text-[var(--ds-color-info)]" />
              </span>
              {selectedTenant ? (
                <span>
                  Operando em: <span className="font-semibold text-[var(--title)]">{selectedTenant.companyName}</span>
                </span>
              ) : (
                <span className="font-medium text-[var(--ds-color-warning)]">Nenhuma empresa selecionada</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectorOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--ds-color-info-border)] bg-[var(--ds-color-surface-base)] px-3 py-1.5 text-[11px] font-semibold text-[var(--ds-color-info-fg)] shadow-[var(--ds-shadow-xs)] transition-all hover:border-[var(--ds-color-action-primary)] hover:bg-[var(--ds-color-primary-subtle)] hover:text-[var(--ds-color-action-primary-active)]"
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
              Trocar empresa
            </button>
          </div>
        )}
        <ApiStatusBanner />
        <main className="flex-1 overflow-y-auto px-4 py-4 pb-28 sm:px-5 xl:px-6 xl:pb-5">
          {children}
        </main>
        <AIButton />
        <CommandPalette />
        <MobileFieldNav />
      </div>

      <CompanySelectorModal
        open={selectorOpen}
        onSelect={handleCompanySelect}
        onLogout={logout}
        currentCompanyId={selectedTenant?.companyId}
        onClose={() => setSelectorOpen(false)}
      />
      <OnboardingModal userId={user?.id} />
    </div>
  );
}
