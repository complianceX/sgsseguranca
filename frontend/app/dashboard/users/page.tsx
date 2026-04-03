'use client';

import { UserRound, Plus, Search, Shield, Building2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo } from 'react';
import { useUsers } from './hooks/useUsers';
import { UsersTable } from './components/UsersTable';
import { PaginationControls } from '@/components/PaginationControls';
import { ListPageLayout } from '@/components/layout';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function UsersPage() {
  const {
    loading,
    filteredUsers,
    users,
    searchTerm,
    setSearchTerm,
    page,
    setPage,
    total,
    lastPage,
    deleteUser,
  } = useUsers();

  const metrics = useMemo(() => {
    const withEmail = users.filter((user) => Boolean(user.email)).length;
    const withProfile = users.filter((user) => Boolean(user.profile?.nome)).length;
    const companies = new Set(users.map((user) => user.company_id).filter(Boolean)).size;

    return {
      visiveis: filteredUsers.length,
      withEmail,
      withProfile,
      companies,
    };
  }, [filteredUsers.length, users]);

  const handlePrevPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, [setPage]);

  const handleNextPage = useCallback(() => {
    setPage((current) => Math.min(lastPage, current + 1));
  }, [lastPage, setPage]);

  return (
    <ListPageLayout
      eyebrow="Acesso e governança"
      title="Usuários"
      description="Gerencie os usuários cadastrados no sistema com um fluxo mais limpo e focado em operação."
      icon={<UserRound className="h-5 w-5" />}
      actions={
        <Link href="/dashboard/users/new" className={cn(buttonVariants(), 'inline-flex items-center')}>
          <Plus className="mr-2 h-4 w-4" />
          Novo usuário
        </Link>
      }
      metrics={[
        {
          label: 'Total da página',
          value: metrics.visiveis,
          note: `${total} usuário(s) no recorte atual.`,
        },
        {
          label: 'Com e-mail',
          value: metrics.withEmail,
          note: 'Cadastros com contato configurado.',
          tone: 'primary',
        },
        {
          label: 'Com perfil',
          value: metrics.withProfile,
          note: 'Permissões atribuídas no tenant.',
          tone: 'success',
        },
        {
          label: 'Empresas na página',
          value: metrics.companies,
          note: 'Distribuição visível por empresa.',
        },
      ]}
      toolbarTitle="Base de usuários"
      toolbarDescription="Pesquise por nome, CPF ou e-mail sem navegar por blocos redundantes."
      toolbarContent={
        <div className="ds-list-search">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-[var(--ds-color-text-muted)]" />
          </span>
          <input
            type="text"
            placeholder="Pesquisar usuários..."
            className="w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] py-2 pl-10 pr-4 text-sm text-[var(--ds-color-text-primary)] transition-all duration-[var(--ds-motion-base)] focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]"
            value={searchTerm}
            onChange={(e) => onSearchChangeSafe(setSearchTerm, e.target.value)}
          />
        </div>
      }
      footer={
        !loading ? (
          <PaginationControls
            page={page}
            lastPage={lastPage}
            total={total}
            onPrev={handlePrevPage}
            onNext={handleNextPage}
          />
        ) : null
      }
    >
      <div className="space-y-4">
        <div className="mx-4 mt-4 flex flex-wrap gap-2">
          <span className="ds-badge ds-badge--info">
            <Shield className="h-3.5 w-3.5" />
            Gestão de acesso ativa
          </span>
          <span className="ds-badge">
            <Building2 className="h-3.5 w-3.5" />
            {metrics.companies} empresa(s) no recorte
          </span>
        </div>
        <UsersTable users={filteredUsers} loading={loading} onDelete={deleteUser} />
      </div>
    </ListPageLayout>
  );
}

function onSearchChangeSafe(setter: (value: string) => void, value: string) {
  setter(value);
}

