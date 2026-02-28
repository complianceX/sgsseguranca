'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { aprsService, Apr } from '@/services/aprsService';
import { aiService } from '@/services/aiService';
import { signaturesService } from '@/services/signaturesService';
import { generateAprPdf } from '@/lib/pdf/aprGenerator';
import { toast } from 'sonner';
import { handleApiError } from '@/lib/error-handler';

interface Insight {
  type: 'warning' | 'success' | 'info';
  title: string;
  message: string;
  action: string;
}

type AprOverviewMetrics = {
  totalAprs: number;
  aprovadas: number;
  pendentes: number;
  riscosCriticos: number;
  mediaScoreRisco: number;
};

export function useAprs() {
  const [aprs, setAprs] = useState<Apr[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [insights, setInsights] = useState<Insight[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  // Estados para o modal de e-mail
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; filename: string; base64: string } | null>(null);

  const loadAprs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await aprsService.findPaginated({ page, limit });
      setAprs(res.data);
      setTotal(res.total);
      setLastPage(res.lastPage);
    } catch (error) {
      handleApiError(error, 'APRs');
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

  const loadInsights = useCallback(async () => {
    try {
      const result = await aiService.getInsights();
      const aprInsights = result.insights.filter((i: Insight) => 
        i.action.includes('/aprs') || i.title.toLowerCase().includes('apr')
      );
      setInsights(aprInsights);
    } catch (error) {
      console.error('Erro ao carregar insights:', error);
    }
  }, []);

  useEffect(() => {
    loadAprs();
    loadInsights();
  }, [loadAprs, loadInsights]);

  const handleDelete = useCallback(async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta APR?')) {
      try {
        await aprsService.delete(id);
        setAprs(prev => prev.filter(a => a.id !== id));
        toast.success('APR excluída com sucesso!');
      } catch (error) {
        handleApiError(error, 'APR');
      }
    }
  }, []);

  const handleDownloadPdf = useCallback(async (id: string) => {
    try {
      toast.info('Gerando PDF...');
      const apr = await aprsService.findOne(id);
      const signatures = await signaturesService.findByDocument(id, 'APR');
      await generateAprPdf(apr, signatures);
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      handleApiError(error, 'PDF');
    }
  }, []);

  const handlePrint = useCallback(async (apr: Apr) => {
    try {
      toast.info('Preparando impressão...');
      const fullApr = await aprsService.findOne(apr.id);
      const signatures = await signaturesService.findByDocument(apr.id, 'APR');
      const result = await generateAprPdf(fullApr, signatures, { save: false, output: 'base64' }) as { base64: string };
      
      if (result) {
        const byteCharacters = atob(result.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const file = new Blob([byteArray], { type: 'application/pdf' });
        const fileURL = URL.createObjectURL(file);
        
        const printWindow = window.open(fileURL);
        if (printWindow) {
          printWindow.print();
        } else {
          toast.error('Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-ups está ativo.');
        }
      }
    } catch (error) {
      handleApiError(error, 'Impressão');
    }
  }, []);

  const handleSendEmail = useCallback(async (id: string) => {
    try {
      toast.info('Preparando documento...');
      const apr = await aprsService.findOne(id);
      const signatures = await signaturesService.findByDocument(id, 'APR');
      const result = await generateAprPdf(apr, signatures, { save: false, output: 'base64' }) as { filename: string; base64: string };
      
      if (result) {
        setSelectedDoc({
          name: apr.titulo,
          filename: result.filename,
          base64: result.base64,
        });
        setIsMailModalOpen(true);
      }
    } catch (error) {
      handleApiError(error, 'Email');
    }
  }, []);

  const filteredAprs = useMemo(() => {
    return aprs.filter(apr =>
      apr.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      apr.descricao?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [aprs, searchTerm]);

  const overviewMetrics: AprOverviewMetrics | null = useMemo(() => {
    const list = filteredAprs;
    if (!list) return null;

    const totalAprs = total;
    const aprovadas = list.filter((a) => a.status === 'Aprovada').length;
    const pendentes = list.filter((a) => a.status === 'Pendente').length;
    const riscosCriticos = list.filter((a) => (a.classificacao_resumo?.critico || 0) > 0).length;

    let scoreSum = 0;
    let scoreCount = 0;
    list.forEach((a) => {
      (a.risk_items || []).forEach((ri) => {
        if (typeof ri.score_risco === 'number') {
          scoreSum += ri.score_risco;
          scoreCount += 1;
        }
      });
    });

    const mediaScoreRisco = scoreCount > 0 ? scoreSum / scoreCount : 0;
    return { totalAprs, aprovadas, pendentes, riscosCriticos, mediaScoreRisco };
  }, [filteredAprs, total]);

  const handleFinalize = useCallback(async (id: string) => {
    if (!confirm('Deseja aprovar esta APR?')) return;
    try {
      const updated = await aprsService.approve(id);
      setAprs((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast.success('APR aprovada com sucesso!');
    } catch (error) {
      handleApiError(error, 'APR');
    }
  }, []);

  const handleReject = useCallback(async (id: string) => {
    const reason = prompt('Motivo da reprovação:');
    if (!reason) return;
    try {
      const updated = await aprsService.reject(id, reason);
      setAprs((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast.success('APR reprovada.');
    } catch (error) {
      handleApiError(error, 'APR');
    }
  }, []);

  const handleCreateNewVersion = useCallback(async (id: string) => {
    if (!confirm('Criar uma nova versão desta APR?')) return;
    try {
      await aprsService.createNewVersion(id);
      toast.success('Nova versão criada.');
      await loadAprs();
    } catch (error) {
      handleApiError(error, 'APR');
    }
  }, [loadAprs]);

  return {
    aprs,
    loading,
    searchTerm,
    setSearchTerm,
    insights,
    overviewMetrics,
    page,
    setPage,
    limit,
    total,
    lastPage,
    isMailModalOpen,
    setIsMailModalOpen,
    selectedDoc,
    setSelectedDoc,
    filteredAprs,
    handleDelete,
    handleDownloadPdf,
    handlePrint,
    handleSendEmail,
    handleFinalize,
    handleReject,
    handleCreateNewVersion,
    loadAprs,
  };
}
