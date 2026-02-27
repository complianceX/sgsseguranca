'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ptsService, Pt } from '@/services/ptsService';
import { aiService } from '@/services/aiService';
import { signaturesService } from '@/services/signaturesService';
import { generatePtPdf } from '@/lib/pdf/ptGenerator';
import { toast } from 'sonner';
import { handleApiError } from '@/lib/error-handler';

interface Insight {
  type: 'warning' | 'success' | 'info';
  title: string;
  message: string;
  action: string;
}

export function usePts() {
  const [pts, setPts] = useState<Pt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [insights, setInsights] = useState<Insight[]>([]);

  // Estados para o modal de e-mail
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; filename: string; base64: string } | null>(null);

  const loadPts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await ptsService.findAll();
      setPts(data);
    } catch (error) {
      handleApiError(error, 'PTs');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInsights = useCallback(async () => {
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

  const filteredPts = useMemo(() => {
    return pts.filter(pt =>
      pt.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pt.numero.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [pts, searchTerm]);

  return {
    pts,
    loading,
    searchTerm,
    setSearchTerm,
    insights,
    isMailModalOpen,
    setIsMailModalOpen,
    selectedDoc,
    setSelectedDoc,
    filteredPts,
    handleDelete,
    handleDownloadPdf,
    handleSendEmail,
    handlePrint,
    loadPts,
  };
}
