import { useState, useEffect, useMemo, useCallback } from 'react';
import { usersService, User, UserIdentityType } from '@/services/usersService';
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await usersService.findPaginated({
        page,
        limit,
        identityType: UserIdentityType.SYSTEM_USER,
      });
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

  const deleteUser = useCallback((id: string) => {
    setConfirmDeleteId(id);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!confirmDeleteId) return;
    setDeleteLoading(true);
    try {
      await usersService.gdprErasure(confirmDeleteId);
      setUsers(prev => prev.filter(u => u.id !== confirmDeleteId));
      toast.success('Dados anonimizados e usuário desativado!');
      setConfirmDeleteId(null);
    } catch (error) {
      handleApiError(error, 'Usuário');
    } finally {
      setDeleteLoading(false);
    }
  }, [confirmDeleteId]);

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
    confirmDelete,
    confirmDeleteId,
    setConfirmDeleteId,
    deleteLoading,
    loadUsers,
  };
}
