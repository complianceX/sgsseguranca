import { useState, useEffect, useMemo, useCallback } from 'react';
import { checklistsService, Checklist } from '@/services/checklistsService';
import { signaturesService } from '@/services/signaturesService';
import { generateChecklistPdf } from '@/lib/pdf/checklistGenerator';
import { aiService } from '@/services/aiService';
import { handleApiError } from '@/lib/error-handler';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import React from 'react';

export function useChecklists() {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [modelFilter, setModelFilter] = useState<'all' | 'model' | 'regular'>('regular');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<{ name: string; filename: string; base64: string } | null>(null);

  const loadChecklists = useCallback(async () => {
    try {
      setLoading(true);
      const res = await checklistsService.findPaginated({
        onlyTemplates: modelFilter === 'model',
        excludeTemplates: modelFilter === 'regular',
        page,
        limit,
      });
      setChecklists(res.data);
      setTotal(res.total);
      setLastPage(res.lastPage);
    } catch (error) {
      handleApiError(error, 'Checklists');
    } finally {
      setLoading(false);
    }
  }, [modelFilter, page, limit]);

  const setModelFilterAndReset = useCallback(
    (value: 'all' | 'model' | 'regular') => {
      setPage(1);
      setModelFilter(value);
    },
    [],
  );

  useEffect(() => {
    loadChecklists();
  }, [loadChecklists]);

  const handleDownloadPdf = useCallback(async (checklist: Checklist) => {
    try {
      setPrintingId(checklist.id);
      const signatures = await signaturesService.findByChecklist(checklist.id);
      await generateChecklistPdf(checklist, signatures);
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      handleApiError(error, 'Gerar PDF');
    } finally {
      setPrintingId(null);
    }
  }, []);

  const handleSendEmail = useCallback(async (checklist: Checklist) => {
    try {
      setPrintingId(checklist.id);
      const signatures = await signaturesService.findByChecklist(checklist.id);
      const pdfData = await generateChecklistPdf(checklist, signatures, { save: false, output: 'base64' });
      
      if (pdfData && pdfData.base64) {
        setSelectedDoc({
          name: checklist.titulo,
          filename: pdfData.filename,
          base64: pdfData.base64,
        });
        setIsMailModalOpen(true);
      }
    } catch (error) {
      handleApiError(error, 'Preparar e-mail');
    } finally {
      setPrintingId(null);
    }
  }, []);

  const handlePrint = useCallback(async (checklist: Checklist) => {
    try {
      setPrintingId(checklist.id);
      const signatures = await signaturesService.findByChecklist(checklist.id);
      const result = await generateChecklistPdf(checklist, signatures, { save: false, output: 'base64' }) as { base64: string };
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
      handleApiError(error, 'Imprimir');
    } finally {
      setPrintingId(null);
    }
  }, []);

  const handleAiAnalysis = useCallback(async (id: string) => {
    try {
      setAnalyzingId(id);
      const result = await aiService.analyzeChecklist(id);
      
      toast.success('Análise do COMPLIANCE X concluída!', {
        description: (
          <div className="mt-2 space-y-2 max-h-[300px] overflow-y-auto pr-2">
            <p className="font-bold text-blue-700">{result.summary}</p>
            <div className="space-y-1">
              {result.suggestions.map((s: string, i: number) => (
                <div key={i} className="text-xs border-l-2 border-blue-200 pl-2 py-1 bg-blue-50/50">
                  {s}
                </div>
              ))}
            </div>
          </div>
        ),
        duration: 8000,
      });
    } catch (error) {
      handleApiError(error, 'Análise COMPLIANCE X');
    } finally {
      setAnalyzingId(null);
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este checklist?')) return;
    try {
      await checklistsService.delete(id);
      setChecklists(prev => prev.filter(c => c.id !== id));
      toast.success('Checklist excluído com sucesso!');
    } catch (error) {
      handleApiError(error, 'Excluir checklist');
    }
  }, []);

  const filteredChecklists = useMemo(() => {
    return checklists.filter((checklist) => {
      const term = searchTerm.toLowerCase();
      const matchesTerm = (
        checklist.titulo.toLowerCase().includes(term) ||
        (checklist.descricao || '').toLowerCase().includes(term) ||
        (checklist.equipamento || '').toLowerCase().includes(term) ||
        (checklist.maquina || '').toLowerCase().includes(term)
      );
      if (!matchesTerm) return false;
      if (modelFilter === 'model') return Boolean(checklist.is_modelo);
      if (modelFilter === 'regular') return !checklist.is_modelo;
      return true;
    });
  }, [checklists, searchTerm, modelFilter]);

  const insights = useMemo(() => {
    return {
      total,
      conforme: checklists.filter(c => c.status === 'Conforme').length,
      pendente: checklists.filter(c => c.status === 'Pendente').length,
      naoConforme: checklists.filter(c => c.status === 'Não Conforme').length,
    };
  }, [checklists, total]);

  const handleExportCsv = useCallback(() => {
    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const header = ['Data', 'Título', 'Status'];
    const rows = filteredChecklists.map((checklist) => [
      format(new Date(checklist.data), 'dd/MM/yyyy', { locale: ptBR }),
      checklist.titulo,
      checklist.status,
    ]);
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `checklists_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredChecklists]);

  return {
    checklists,
    loading,
    searchTerm,
    setSearchTerm,
    modelFilter,
    setModelFilter: setModelFilterAndReset,
    page,
    setPage,
    limit,
    total,
    lastPage,
    analyzingId,
    printingId,
    isMailModalOpen,
    setIsMailModalOpen,
    selectedDoc,
    setSelectedDoc,
    filteredChecklists,
    insights,
    handleDownloadPdf,
    handleSendEmail,
    handlePrint,
    handleAiAnalysis,
    handleDelete,
    handleExportCsv,
  };
}
