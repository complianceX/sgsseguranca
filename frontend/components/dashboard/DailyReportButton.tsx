'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { DailyReportPdfSource } from '@/lib/pdf/dailyReportGenerator';
import { DashboardSectionBoundary } from './DashboardSectionBoundary';

const PDF_ERROR_AUTODISMISS_MS = 5_000;

export interface DailyReportButtonProps {
  disabled?: boolean;
  buildPayload: () => DailyReportPdfSource;
}

export function DailyReportButton({ disabled, buildPayload }: DailyReportButtonProps) {
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const pdfErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pdfErrorTimerRef.current) clearTimeout(pdfErrorTimerRef.current);
    };
  }, []);

  const handleExportPdf = useCallback(async () => {
    setExportingPdf(true);
    setPdfError(null);
    try {
      const { generateDailyReportPdf } = await import('@/lib/pdf/dailyReportGenerator');
      generateDailyReportPdf(buildPayload(), { save: true });
    } catch {
      setPdfError('Não foi possível gerar o relatório. Tente novamente.');
      if (pdfErrorTimerRef.current) clearTimeout(pdfErrorTimerRef.current);
      pdfErrorTimerRef.current = setTimeout(() => setPdfError(null), PDF_ERROR_AUTODISMISS_MS);
    } finally {
      setExportingPdf(false);
    }
  }, [buildPayload]);

  const handlePrefetch = useCallback(() => {
    void import('@/lib/pdf/dailyReportGenerator');
  }, []);

  return (
    <DashboardSectionBoundary fallbackTitle="Relatório Diário">
      {pdfError && (
        <p role="alert" className="rounded-lg border border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] px-3 py-1.5 text-xs text-[var(--ds-color-danger-fg)]">
          {pdfError}
        </p>
      )}
      <button
        type="button"
        onMouseEnter={handlePrefetch}
        onFocus={handlePrefetch}
        onClick={() => void handleExportPdf()}
        disabled={exportingPdf || disabled || !buildPayload}
        aria-label="Exportar relatório do dia em PDF"
        className="flex items-center gap-1.5 rounded-xl bg-[var(--ds-color-action-primary)] px-4 py-2 text-xs font-bold text-white shadow-sm transition-none hover:opacity-100 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-color-action-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {exportingPdf ? <Loader2 className="h-3 w-3" aria-hidden="true" /> : <Download className="h-3 w-3" aria-hidden="true" />}
        {exportingPdf ? 'Gerando...' : 'Gerar Relatório'}
      </button>
    </DashboardSectionBoundary>
  );
}
