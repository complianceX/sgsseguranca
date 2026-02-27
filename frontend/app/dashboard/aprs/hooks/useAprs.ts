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

export function useAprs() {
  const [aprs, setAprs] = useState<Apr[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [insights, setInsights] = useState<Insight[]>([]);

  // Estados para o modal de e-mail
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; filename: string; base64: string } | null>(null);

  const loadAprs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await aprsService.findAll();
      setAprs(data);
    } catch (error) {
      handleApiError(error, 'APRs');
    } finally {
      setLoading(false);
    }
  }, []);

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

  return {
    aprs,
    loading,
    searchTerm,
    setSearchTerm,
    insights,
    isMailModalOpen,
    setIsMailModalOpen,
    selectedDoc,
    setSelectedDoc,
    filteredAprs,
    handleDelete,
    handleDownloadPdf,
    handlePrint,
    handleSendEmail,
    loadAprs,
  };
}
