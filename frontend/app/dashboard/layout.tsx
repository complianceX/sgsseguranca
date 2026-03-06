'use client';

import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { AIButton } from '@/components/AIButton';
import { ApiStatusBanner } from '@/components/ApiStatusBanner';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, hasPermission } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }

    // Proteção de rotas administrativas
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
    <div className="flex h-screen bg-[#0F172A]">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <ApiStatusBanner />
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
        <AIButton />
      </div>
    </div>
  );
}
