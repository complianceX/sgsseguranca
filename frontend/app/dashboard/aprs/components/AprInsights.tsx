'use client';

import React from 'react';
import { Sparkles, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface Insight {
  type: 'warning' | 'success' | 'info';
  title: string;
  message: string;
  action: string;
}

interface AprInsightsProps {
  insights: Insight[];
}

export const AprInsights = React.memo(({ insights }: AprInsightsProps) => {
  if (insights.length === 0) return null;

  return (
    <Card
      tone="muted"
      padding="md"
      className="border-[color:var(--ds-color-action-primary)]/20 bg-[color:var(--ds-color-action-primary)]/8 animate-in fade-in slide-in-from-top-4"
    >
      <CardHeader className="gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--ds-color-action-primary)]" />
          <CardTitle className="text-sm uppercase tracking-wider text-[var(--ds-color-action-primary)]">
            Insights da SOPHIE
          </CardTitle>
        </div>
        <CardDescription>
          Sinais automáticos para priorizar análise, aprovação e resposta operacional das APRs.
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {insights.map((insight, idx) => (
          <div
            key={idx}
            className="flex items-start gap-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-4 transition-all duration-[var(--ds-motion-base)] hover:-translate-y-px hover:shadow-[var(--ds-shadow-sm)]"
          >
            <div
              className={cn(
                'mt-0.5 rounded-full p-1.5',
                insight.type === 'warning'
                  ? 'bg-[color:var(--ds-color-warning)]/14 text-[var(--ds-color-warning)]'
                  : 'bg-[color:var(--ds-color-action-primary)]/12 text-[var(--ds-color-action-primary)]',
              )}
            >
              {insight.type === 'warning' ? (
                <AlertTriangle className="h-3.5 w-3.5" />
              ) : (
                <Info className="h-3.5 w-3.5" />
              )}
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                {insight.title}
              </p>
              <p className="text-xs leading-5 text-[var(--ds-color-text-muted)]">
                {insight.message}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
});

AprInsights.displayName = 'AprInsights';
