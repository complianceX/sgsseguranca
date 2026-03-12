'use client';

import { useState, useEffect, useCallback, useDeferredValue } from 'react';
import { ptsService, Pt } from '@/services/ptsService';
import { aiService } from '@/services/aiService';
import { signaturesService } from '@/services/signaturesService';
import { generatePtPdf } from '@/lib/pdf/ptGenerator';
import { toast } from 'sonner';
import { handleApiError } from '@/lib/error-handler';
import { openPdfForPrint } from '@/lib/print-utils';
import { isAiEnabled } from '@/lib/featureFlags';

interface Insight {
  type: 'warning' | 'success' | 'info';
  title: string;
  message: string;
  action: string;
}

export function usePts() {
  const [pts, setPts] = useState<Pt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [statusFilter, setStatusFilter] = useState('');
  const [insights, setInsights] = useState<Insight[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  // Estados para o modal de e-mail
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; filename: string; base64: string } | null>(null);

  const loadPts = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await ptsService.findPaginated({
        page,
        limit,
        search: deferredSearchTerm || undefined,
        status: statusFilter || undefined,
      });
      setPts(res.data);
      setTotal(res.total);
      setLastPage(res.lastPage);
    } catch (error) {
      setLoadError('Nao foi possivel carregar a lista de PTs.');
      handleApiError(error, 'PTs');
    } finally {
      setLoading(false);
    }
  }, [page, limit, deferredSearchTerm, statusFilter]);

  const loadInsights = useCallback(async () => {
    if (!isAiEnabled()) return;
    try {
      const result = await aiService.getInsights();
      const ptInsights = result.insights.filter((i: Insight) => 
        i.action.includes('/pts') || i.title.toLowerCase().includes('pt') || i.title.toLowerCase().includes('risco')
      );
      setInsights(ptInsights);
    } catch (error) {
      console.error('Erro ao carregar insights:', error);
    }
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [deferredSearchTerm, statusFilter]);

  useEffect(() => {
    loadPts();
    loadInsights();
  }, [loadPts, loadInsights]);

  const handleDelete = useCallback(async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta PT?')) {
      try {
        await ptsService.delete(id);
        setPts(prev => prev.filter(p => p.id !== id));
        toast.success('PT excluída com sucesso!');
      } catch (error) {
        handleApiError(error, 'PTs');
      }
    }
  }, []);

  const handleDownloadPdf = useCallback(async (id: string) => {
    try {
      toast.info('Gerando PDF...');
      const [pt, signatures] = await Promise.all([
        ptsService.findOne(id),
        signaturesService.findByDocument(id, 'PT')
      ]);
      await generatePtPdf(pt, signatures);
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      handleApiError(error, 'PDF');
    }
  }, []);

  const handleSendEmail = useCallback(async (id: string) => {
    try {
      toast.info('Preparando documento...');
      const [pt, signatures] = await Promise.all([
        ptsService.findOne(id),
        signaturesService.findByDocument(id, 'PT')
      ]);
      const result = await generatePtPdf(pt, signatures, { save: false, output: 'base64' }) as { filename: string; base64: string };
      
      if (result) {
        setSelectedDoc({
          name: pt.titulo,
          filename: result.filename,
          base64: result.base64,
        });
        setIsMailModalOpen(true);
      }
    } catch (error) {
      handleApiError(error, 'Email');
    }
  }, []);

  const handlePrint = useCallback(async (id: string) => {
    try {
      toast.info('Preparando impressão...');
      const [pt, signatures] = await Promise.all([
        ptsService.findOne(id),
        signaturesService.findByDocument(id, 'PT')
      ]);
      const result = await generatePtPdf(pt, signatures, { save: false, output: 'base64' }) as { base64: string };
      if (result?.base64) {
        const byteCharacters = atob(result.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const file = new Blob([byteArray], { type: 'application/pdf' });
        const fileURL = URL.createObjectURL(file);
        openPdfForPrint(fileURL, () => {
          toast.info('Pop-up bloqueado. Abrimos o PDF na mesma aba para impressão.');
        });
      }
    } catch (error) {
      handleApiError(error, 'Impressão');
    }
  }, []);

  const handleApprove = useCallback(async (id: string) => {
    if (!confirm('Deseja aprovar esta PT?')) return;
    try {
      const updated = await ptsService.approve(id);
      setPts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.success('PT aprovada com sucesso!');
    } catch (error) {
      handleApiError(error, 'PT');
    }
  }, []);

  const handleReject = useCallback(async (id: string) => {
    const reason = prompt('Motivo da reprovação:');
    if (!reason) return;
    try {
      const updated = await ptsService.reject(id, reason);
      setPts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.success('PT reprovada.');
    } catch (error) {
      handleApiError(error, 'PT');
    }
  }, []);

  // Filtering is now server-side — pts already contains the filtered page
  const filteredPts = pts;

  return {
    pts,
    loading,
    loadError,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    insights,
    page,
    setPage,
    limit,
    total,
    lastPage,
    isMailModalOpen,
    setIsMailModalOpen,
    selectedDoc,
    setSelectedDoc,
    filteredPts,
    handleDelete,
    handleDownloadPdf,
    handleSendEmail,
    handlePrint,
    handleApprove,
    handleReject,
    loadPts,
  };
}
