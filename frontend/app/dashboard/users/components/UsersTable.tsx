import React from 'react';
import { User } from '@/services/usersService';
import { EmptyState } from '@/components/ui/state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UsersTableRow } from './UsersTableRow';

interface UsersTableProps {
  users: User[];
  loading: boolean;
  onDelete: (id: string) => void;
}

export const UsersTable = React.memo(({ users, loading, onDelete }: UsersTableProps) => {
  if (!loading && users.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          title="Nenhum usuário encontrado"
          description="Não há usuários visíveis no recorte atual. Ajuste a busca ou cadastre um novo acesso."
          compact
        />
      </div>
    );
  }

  return (
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
          {loading ? (
            <TableRow>
              <TableCell colSpan={6} className="px-5 py-10 text-center">
                <div className="flex justify-center">
                  <div className="h-6 w-6 motion-safe:animate-spin rounded-full border-2 border-[var(--ds-color-action-primary)] border-t-transparent"></div>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => (
              <UsersTableRow
                key={user.id}
                user={user}
                onDelete={onDelete}
              />
            ))
          )}
      </TableBody>
    </Table>
  );
});

UsersTable.displayName = 'UsersTable';
