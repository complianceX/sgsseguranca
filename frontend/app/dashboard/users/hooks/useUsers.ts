import { useState, useEffect, useMemo, useCallback } from 'react';
import { usersService, User } from '@/services/usersService';
import { handleApiError } from '@/lib/error-handler';
import { toast } from 'sonner';

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await usersService.findPaginated({ page, limit });
      setUsers(res.data);
      setTotal(res.total);
      setLastPage(res.lastPage);
    } catch (error) {
      handleApiError(error, 'Usuários');
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const deleteUser = useCallback(async (id: string) => {
    if (!confirm('Anonimizar e desativar este usuário (LGPD)?')) return;

    try {
      await usersService.gdprErasure(id);
      setUsers(prev => prev.filter(u => u.id !== id));
      toast.success('Dados anonimizados e usuário desativado!');
    } catch (error) {
      handleApiError(error, 'Usuário');
    }
  }, []);

  const filteredUsers = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return users.filter(user =>
      user.nome.toLowerCase().includes(term) ||
      user.cpf.includes(term) ||
      (user.email && user.email.toLowerCase().includes(term))
    );
  }, [users, searchTerm]);

  return {
    users,
    loading,
    filteredUsers,
    searchTerm,
    setSearchTerm,
    page,
    setPage,
    limit,
    total,
    lastPage,
    deleteUser,
    loadUsers,
  };
}
