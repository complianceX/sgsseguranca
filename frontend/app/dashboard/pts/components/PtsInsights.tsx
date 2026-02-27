'use client';

import React from 'react';
import { Sparkles, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Insight {
  type: 'warning' | 'success' | 'info';
  title: string;
  message: string;
  action: string;
}

interface PtsInsightsProps {
  insights: Insight[];
}

export const PtsInsights = React.memo(({ insights }: PtsInsightsProps) => {
  if (insights.length === 0) return null;

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 transition-all animate-in fade-in slide-in-from-top-4">
      <div className="mb-3 flex items-center space-x-2">
        <Sparkles className="h-4 w-4 text-blue-600" />
        <h2 className="text-sm font-bold text-blue-900 uppercase tracking-wider">Insights do COMPLIANCE X AI</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {insights.map((insight, idx) => (
          <div key={idx} className="flex items-start space-x-3 rounded-lg bg-white p-3 shadow-sm border border-blue-100 transition-transform hover:scale-[1.02]">
            <div className={cn(
              "mt-0.5 rounded-full p-1",
              insight.type === 'warning' ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600"
            )}>
              {insight.type === 'warning' ? <AlertTriangle className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
            </div>
            <div>
              <p className="text-xs font-bold text-gray-900">{insight.title}</p>
              <p className="text-[11px] text-gray-600">{insight.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

PtsInsights.displayName = 'PtsInsights';
