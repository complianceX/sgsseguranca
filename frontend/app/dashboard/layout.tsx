'use client';

import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { AIButton } from '@/components/AIButton';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
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

    if (!loading && user && isAdminRoute && !isAdmin) {
      router.push('/dashboard');
    }
  }, [user, loading, router, pathname]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
        <AIButton />
      </div>
    </div>
  );
}
