import React from 'react';
import { User } from '@/services/usersService';
import { EmptyState } from '@/components/ui/state';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UsersTableRow } from './UsersTableRow';
import Link from 'next/link';
import { Pencil, Trash2, UserX } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import { maskCpf } from '@/lib/format/cpf';
import { cn } from '@/lib/utils';
import { ResponsiveDataList } from '@/components/ui/responsive-data-list';
import {
  CatalogMobileCard,
  catalogMobileActionClassName,
} from '../../components/CatalogMobileCard';

interface UsersTableProps {
  users: User[];
  loading: boolean;
  onGdprErase: (id: string) => void;
  onHardDelete: (id: string) => void;
}

export const UsersTable = React.memo(({ users, loading, onGdprErase, onHardDelete }: UsersTableProps) => {
  const emptyState = (
      <div className="p-6">
        <EmptyState
          title="Nenhum usuário encontrado"
          description="Não há usuários visíveis no recorte atual. Ajuste a busca ou cadastre um novo acesso."
          compact
        />
      </div>
  );

  return (
    <ResponsiveDataList
      items={users}
      getKey={(user) => user.id}
      mobileClassName="grid min-w-0 gap-3 p-3"
      loading={loading && users.length === 0 ? (
        <div className="flex justify-center p-10" role="status" aria-label="Carregando usuários">
          <div className="h-6 w-6 motion-safe:animate-spin rounded-full border-2 border-[var(--ds-color-action-primary)] border-t-transparent" />
        </div>
      ) : undefined}
      empty={!loading ? emptyState : undefined}
      desktop={() => (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Nome</TableHead>
          <TableHead>CPF</TableHead>
          <TableHead>Função</TableHead>
          <TableHead>Perfil</TableHead>
          <TableHead>Acesso</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
            {users.map((user) => (
              <UsersTableRow
                key={user.id}
                user={user}
                onGdprErase={onGdprErase}
                onHardDelete={onHardDelete}
              />
            ))}
      </TableBody>
    </Table>
      )}
      mobile={(user) => {
        const accessBadge = resolveAccessBadge(user);
        return (
          <CatalogMobileCard
            title={user.nome}
            description={user.email || 'E-mail não informado'}
            fields={[
              { label: 'CPF', value: maskCpf(user.cpf) },
              { label: 'Função', value: user.funcao || '—' },
              { label: 'Perfil', value: user.profile?.nome || user.role || '—' },
              { label: 'Acesso', value: <StatusPill tone={accessBadge.tone} size="sm">{accessBadge.label}</StatusPill> },
            ]}
            actionsLabel={`Ações do usuário ${user.nome}`}
            actions={
              <>
                <Link href={`/dashboard/users/edit/${user.id}`} className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), catalogMobileActionClassName, 'min-h-11')}>
                  <Pencil className="h-4 w-4" /> Editar
                </Link>
                <Button type="button" size="sm" variant="outline" onClick={() => onGdprErase(user.id)} className={cn(catalogMobileActionClassName, 'min-h-11 text-[var(--ds-color-warning-fg)]')}>
                  <UserX className="h-4 w-4" /> Anonimizar
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => onHardDelete(user.id)} className={cn(catalogMobileActionClassName, 'min-h-11 text-[var(--ds-color-danger)]')}>
                  <Trash2 className="h-4 w-4" /> Excluir
                </Button>
              </>
            }
          />
        );
      }}
    />
  );
});

UsersTable.displayName = 'UsersTable';

function resolveAccessBadge(user: User): {
  label: string;
  tone: 'success' | 'warning' | 'info' | 'neutral';
} {
  if (user.access_status === 'credentialed') return { label: 'Com acesso', tone: 'success' };
  if (user.access_status === 'missing_credentials') return { label: 'Credencial pendente', tone: 'warning' };
  if (user.access_status === 'no_login') return { label: 'Sem login', tone: 'info' };
  return { label: 'Não classificado', tone: 'neutral' };
}
