'use client';

import { Clock3, FilePlus2, FileCheck2, RefreshCcw, FileUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ReactNode } from 'react';

export interface AprLogEntry {
  id: string;
  apr_id: string;
  usuario_id?: string;
  acao: string;
  metadata?: Record<string, unknown>;
  data_hora: string;
}

interface AprTimelineProps {
  logs: AprLogEntry[];
  loading?: boolean;
}

const actionMap: Record<string, { label: string; icon: ReactNode }> = {
  APR_CRIADA: {
    label: 'APR criada',
    icon: <FilePlus2 className="h-4 w-4 text-[var(--ds-color-text-primary)]" />,
  },
  APR_APROVADA: {
    label: 'APR aprovada',
    icon: <FileCheck2 className="h-4 w-4 text-[var(--ds-color-success)]" />,
  },
  APR_REPROVADA: {
    label: 'APR reprovada/cancelada',
    icon: <Clock3 className="h-4 w-4 text-[var(--ds-color-danger)]" />,
  },
  APR_ENCERRADA: {
    label: 'APR encerrada',
    icon: <FileCheck2 className="h-4 w-4 text-[var(--ds-color-text-primary)]" />,
  },
  APR_ATUALIZADA: {
    label: 'APR atualizada',
    icon: <RefreshCcw className="h-4 w-4 text-[var(--ds-color-text-primary)]" />,
  },
  APR_PDF_ANEXADO: {
    label: 'PDF anexado',
    icon: <FileUp className="h-4 w-4 text-[var(--ds-color-text-primary)]" />,
  },
  APR_FINALIZADA: {
    label: 'APR finalizada/aprovada',
    icon: <FileCheck2 className="h-4 w-4 text-[var(--ds-color-success)]" />,
  },
  APR_NOVA_VERSAO_GERADA: {
    label: 'Nova versão gerada',
    icon: <RefreshCcw className="h-4 w-4 text-[var(--ds-color-text-primary)]" />,
  },
  APR_CRIADA_POR_VERSAO: {
    label: 'APR criada a partir de versão',
    icon: <FilePlus2 className="h-4 w-4 text-[var(--ds-color-text-primary)]" />,
  },
  APR_EVIDENCIA_ENVIADA: {
    label: 'Evidência enviada',
    icon: <FileUp className="h-4 w-4 text-[var(--ds-color-text-primary)]" />,
  },
  APR_REMOVIDA: {
    label: 'APR removida',
    icon: <Clock3 className="h-4 w-4 text-[var(--ds-color-danger)]" />,
  },
  aprovado: {
    label: 'APR aprovada',
    icon: <FileCheck2 className="h-4 w-4 text-[var(--ds-color-success)]" />,
  },
  reprovado: {
    label: 'APR reprovada/cancelada',
    icon: <Clock3 className="h-4 w-4 text-[var(--ds-color-danger)]" />,
  },
  encerrado: {
    label: 'APR encerrada',
    icon: <FileCheck2 className="h-4 w-4 text-[var(--ds-color-text-primary)]" />,
  },
  pdf_anexado: {
    label: 'PDF anexado',
    icon: <FileUp className="h-4 w-4 text-[var(--ds-color-text-primary)]" />,
  },
  nova_versao_criada: {
    label: 'Nova versão gerada',
    icon: <RefreshCcw className="h-4 w-4 text-[var(--ds-color-text-primary)]" />,
  },
  evidencia_enviada: {
    label: 'Evidência enviada',
    icon: <FileUp className="h-4 w-4 text-[var(--ds-color-text-primary)]" />,
  },
  removido: {
    label: 'APR removida',
    icon: <Clock3 className="h-4 w-4 text-[var(--ds-color-danger)]" />,
  },
};

export function AprTimeline({ logs, loading = false }: AprTimelineProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-10 animate-pulse rounded-lg bg-[var(--ds-color-surface-muted)]"
          />
        ))}
      </div>
    );
  }

  if (!logs.length) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--ds-color-border-subtle)] p-4 text-sm text-[var(--ds-color-text-muted)]">
        Sem eventos registrados para esta APR.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => {
        const mapped = actionMap[log.acao] || {
          label: log.acao,
          icon: <Clock3 className="h-4 w-4 text-[var(--ds-color-text-secondary)]" />,
        };
        return (
          <div
            key={log.id}
            className="flex items-start gap-3 rounded-lg border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-3"
          >
            <div className="mt-0.5">{mapped.icon}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">{mapped.label}</p>
              <p className="text-xs text-[var(--ds-color-text-muted)]">
                {formatDistanceToNow(new Date(log.data_hora), {
                  addSuffix: true,
                  locale: ptBR,
                })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
