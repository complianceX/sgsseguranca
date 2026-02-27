import React from 'react';
import { ClipboardCheck, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

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
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Conformes',
      value: insights.conforme,
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Pendentes',
      value: insights.pendente,
      icon: Clock,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
    {
      label: 'Não Conformes',
      value: insights.naoConforme,
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:shadow-md"
        >
          <div className={`rounded-lg ${card.bg} p-3`}>
            <card.icon className={`h-6 w-6 ${card.color}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">{card.label}</p>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
});

ChecklistInsights.displayName = 'ChecklistInsights';
