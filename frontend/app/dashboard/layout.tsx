'use client';

import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { AIButton } from '@/components/AIButton';
import { ApiStatusBanner } from '@/components/ApiStatusBanner';
import CompanySelectorModal from '@/components/CompanySelectorModal';
import { OnboardingModal } from '@/components/OnboardingModal';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { selectedTenantStore } from '@/lib/selectedTenantStore';
import { Company } from '@/services/companiesService';
import { Building2, ChevronsUpDown } from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, hasPermission, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isAdminGeral = user?.profile?.nome === 'Administrador Geral';

  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(() => selectedTenantStore.get());

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
    const isAdmin = user?.profile?.nome === 'Administrador Geral';
    const hasRiskPermission = hasPermission('can_view_risks');

    if (
      !loading &&
      user &&
      isAdminRoute &&
      !isAdmin &&
      !(pathname.startsWith('/dashboard/risks') && hasRiskPermission)
    ) {
      router.push('/dashboard');
    }
  }, [user, loading, router, pathname, hasPermission]);

  const handleCompanySelect = (company: Company) => {
    selectedTenantStore.set({ companyId: company.id, companyName: company.razao_social });
    setSelectedTenant({ companyId: company.id, companyName: company.razao_social });
    setSelectorOpen(false);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0F172A] px-6 text-center text-white">
        <div className="max-w-md rounded-2xl border border-[#334155] bg-[#1E293B] p-6 shadow-xl">
          <h2 className="text-lg font-bold">Sessão não encontrada</h2>
          <p className="mt-2 text-sm text-[#CBD5E1]">
            Sua sessão expirou ou o acesso não foi carregado corretamente. Volte para o login e tente novamente.
          </p>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="mt-5 w-full rounded-xl bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1D4ED8]"
          >
            Ir para login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ds-shell-backdrop flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        {/* Badge da empresa selecionada para Admin Geral */}
        {isAdminGeral && (
          <div className="border-b border-indigo-400/15 bg-indigo-500/10 px-6 py-3 flex items-center justify-between backdrop-blur-sm">
            <div className="flex items-center gap-2 text-indigo-100 text-sm">
              <Building2 className="h-4 w-4 text-indigo-400" />
              {selectedTenant ? (
                <span>
                  Operando em: <span className="font-semibold text-white">{selectedTenant.companyName}</span>
                </span>
              ) : (
                <span className="text-yellow-300">Nenhuma empresa selecionada</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectorOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-indigo-300/15 bg-indigo-900/40 px-3 py-2 text-xs font-semibold text-indigo-100 transition-colors hover:bg-indigo-700/50 hover:text-white"
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
              Trocar empresa
            </button>
          </div>
        )}
        <ApiStatusBanner />
        <main className="flex-1 overflow-y-auto px-5 py-6 sm:px-6 xl:px-8">
          {children}
        </main>
        <AIButton />
      </div>

      <CompanySelectorModal
        open={selectorOpen}
        onSelect={handleCompanySelect}
        onLogout={logout}
        currentCompanyId={selectedTenant?.companyId}
      />
      <OnboardingModal userId={user?.id} />
    </div>
  );
}
