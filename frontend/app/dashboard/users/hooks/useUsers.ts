import { useState, useEffect, useMemo, useCallback } from 'react';
import { usersService, User } from '@/services/usersService';
import { handleApiError } from '@/lib/error-handler';
import { toast } from 'sonner';

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await usersService.findAll();
      setUsers(data);
    } catch (error) {
      handleApiError(error, 'Usuários');
    } finally {
      setLoading(false);
    }
  }, []);

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
    deleteUser,
    loadUsers,
  };
}
