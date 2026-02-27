'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { risksService, Risk } from '@/services/risksService';
import { toast } from 'sonner';
import { handleApiError } from '@/lib/error-handler';

export function useRisks() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const loadRisks = useCallback(async () => {
    try {
      setLoading(true);
      const data = await risksService.findAll();
      setRisks(data);
    } catch (error) {
      handleApiError(error, 'Riscos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRisks();
  }, [loadRisks]);

  const handleDelete = useCallback(async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este risco?')) {
      try {
        await risksService.delete(id);
        setRisks(prev => prev.filter(r => r.id !== id));
        toast.success('Risco excluído com sucesso!');
      } catch (error) {
        handleApiError(error, 'Riscos');
      }
    }
  }, []);

  const filteredRisks = useMemo(() => {
    return risks.filter(risk =>
      risk.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      risk.descricao?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [risks, searchTerm]);

  return {
    risks,
    loading,
    searchTerm,
    setSearchTerm,
    filteredRisks,
    handleDelete,
    loadRisks,
  };
}
