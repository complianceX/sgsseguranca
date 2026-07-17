'use client';

import dynamic from 'next/dynamic';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { ApiStatusBanner } from '@/components/ApiStatusBanner';
import { OfflineCapabilityBanner } from '@/components/OfflineCapabilityBanner';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { PwaBootstrap } from '@/components/PwaBootstrap';
import { SentryUserContext } from '@/components/SentryUserContext';
import { StaleCacheBanner } from '@/components/StaleCacheBanner';
import { ResponsiveToaster } from '@/components/ResponsiveToaster';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { selectedTenantStore } from '@/lib/selectedTenantStore';
import { Company } from '@/services/companiesService';
import { AlertTriangle, Building2, ChevronsUpDown } from 'lucide-react';
import { MobileFieldNav } from '@/components/MobileFieldNav';
import {
  isAdminRoute,
  isHiddenRoute,
  getRoutePermissionException,
} from '@/lib/route-config';
import { cn } from '@/lib/utils';

const CompanySelectorModal = dynamic(
  () => import('@/components/CompanySelectorModal'),
  { ssr: false },
);
const OnboardingModal = dynamic(
  () =>
    import('@/components/OnboardingModal').then(
      (module) => module.OnboardingModal,
    ),
  { ssr: false },
);
const CommandPalette = dynamic(
  () =>
    import('@/components/CommandPalette').then(
      (module) => module.CommandPalette,
    ),
  { ssr: false },
);
const AIButton = dynamic(
  () => import('@/components/AIButton').then((module) => module.AIButton),
  { ssr: false },
);

function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, hasPermission, logout, isAdminGeral } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(() =>
    selectedTenantStore.get(),
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarModal, setSidebarModal] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!loading && user && isAdminGeral && !selectedTenantStore.get()) {
      setSelectorOpen(true);
    }
  }, [loading, user, isAdminGeral]);

  useEffect(() => {
    const unsub = selectedTenantStore.subscribe((tenant) =>
      setSelectedTenant(tenant),
    );
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }

    if (!loading && user && isHiddenRoute(pathname)) {
      router.push('/dashboard');
      return;
    }

    const permissionException = getRoutePermissionException(pathname);
    const hasExceptionPermission = permissionException
      ? hasPermission(permissionException)
      : false;

    if (
      !loading &&
      user &&
      isAdminRoute(pathname) &&
      !isAdminGeral &&
      !hasExceptionPermission
    ) {
      router.push('/dashboard');
    }
  }, [user, loading, router, pathname, hasPermission, isAdminGeral]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const handleCompanySelect = async (company: Company) => {
    const nextTenant = {
      companyId: company.id,
      companyName: company.razao_social,
    };
    await selectedTenantStore.set(nextTenant);
    setSelectedTenant(nextTenant);
    setSelectorOpen(false);
  };

  const handleLoginRedirect = () => {
    window.location.assign('/login?expired=1');
  };

  if (loading || !isMounted) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-12 w-12 motion-safe:animate-spin rounded-full border-4 border-[var(--ds-color-action-primary)] border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--ds-color-bg-canvas)] px-6 text-center text-[var(--ds-color-text-primary)]">
        <div className="max-w-md rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-5 shadow-[var(--ds-shadow-sm)]">
          <h2 className="text-lg font-bold text-[var(--ds-color-text-primary)]">
            Sessão não encontrada
          </h2>
          <p className="mt-2 text-sm text-[var(--ds-color-text-secondary)]">
            Sua sessão expirou ou o acesso não foi carregado corretamente. Volte
            para o login e tente novamente.
          </p>
          <button
            type="button"
            onClick={handleLoginRedirect}
            className="mt-4 w-full rounded-xl bg-[var(--ds-color-action-primary)] px-4 py-2 text-[13px] font-semibold text-white motion-safe:transition-colors hover:bg-[var(--ds-color-action-primary-hover)]"
          >
            Ir para login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-dashboard-shell ds-shell-backdrop ds-system-scope ds-density-compact flex xl:flex-row">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        onModalChange={setSidebarModal}
      />
      <div
        className="flex flex-1 flex-col overflow-hidden"
        inert={sidebarModal ? true : undefined}
        aria-hidden={sidebarModal ? true : undefined}
      >
        <Header onOpenMobileNav={openSidebar} />
        {isAdminGeral && (
          <div className="sticky top-0 z-40 flex min-h-12 items-center justify-between border-b border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] px-5 py-3">
            <div className="flex min-w-0 items-center gap-2 text-sm text-[var(--ds-color-warning-fg)]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-warning-subtle)] shadow-[var(--ds-shadow-xs)]">
                <Building2 className="h-4 w-4 text-[var(--ds-color-warning-fg)]" />
              </span>
              {selectedTenant ? (
                <span className="min-w-0 whitespace-nowrap">
                  Operando em:{' '}
                  <AlertTriangle
                    size={14}
                    className="mr-1.5 inline align-text-bottom text-[var(--ds-color-warning-fg)]"
                    aria-hidden="true"
                  />
                  <span className="inline-block max-w-[200px] truncate align-bottom font-semibold text-[var(--ds-color-warning-fg)]">
                    {selectedTenant.companyName}
                  </span>
                </span>
              ) : (
                <span className="min-w-0 truncate font-medium text-[var(--ds-color-warning-fg)]">
                  Nenhuma empresa selecionada
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectorOpen(true)}
              className="ml-3 flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--ds-color-warning-border)] bg-[var(--ds-color-surface-base)] px-3 py-1.5 text-[11px] font-semibold text-[var(--ds-color-warning-fg)] shadow-[var(--ds-shadow-xs)] motion-safe:transition-all hover:brightness-95"
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
              Trocar empresa
            </button>
          </div>
        )}
        <ApiStatusBanner />
        <OfflineCapabilityBanner />
        <main
          id="main-content"
          className={cn(
            'ds-dashboard-content flex-1 overflow-y-auto px-4 py-4 sm:px-5 md:px-6 md:py-5 xl:px-8',
            isAdminGeral && 'pt-12 md:pt-12',
          )}
        >
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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AppErrorBoundary resetKey={pathname}>
      <AuthProvider>
        <SentryUserContext />
        <StaleCacheBanner />
        <PwaBootstrap />
        <DashboardShell>{children}</DashboardShell>
        <ResponsiveToaster />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
