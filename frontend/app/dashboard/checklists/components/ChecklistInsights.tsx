import React from 'react';
import { ClipboardCheck, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardDescription, CardTitle } from '@/components/ui/card';

interface ChecklistInsightsProps {
  insights: {
    total: number;
    conforme: number;
    pendente: number;
    naoConforme: number;
  };
}

export const ChecklistInsights = React.memo(({ insights }: ChecklistInsightsProps) => {
  const cards = [
    {
      label: 'Total de Checklists',
      value: insights.total,
      icon: ClipboardCheck,
      tone: 'text-[var(--ds-color-action-primary)]',
    },
    {
      label: 'Conformes',
      value: insights.conforme,
      icon: CheckCircle2,
      tone: 'text-[var(--ds-color-success)]',
    },
    {
      label: 'Pendentes',
      value: insights.pendente,
      icon: Clock,
      tone: 'text-[var(--ds-color-warning)]',
    },
    {
      label: 'Não Conformes',
      value: insights.naoConforme,
      icon: AlertTriangle,
      tone: 'text-[var(--ds-color-danger)]',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} interactive padding="md">
          <div className="flex items-center gap-4">
            <div className="rounded-[var(--ds-radius-md)] bg-[color:var(--ds-color-surface-muted)]/45 p-3">
              <card.icon className={`h-6 w-6 ${card.tone}`} />
            </div>
            <CardHeader className="gap-1">
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-2xl">{card.value}</CardTitle>
            </CardHeader>
          </div>
        </Card>
      ))}
    </div>
  );
});

ChecklistInsights.displayName = 'ChecklistInsights';
