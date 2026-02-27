'use client';

import { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, AlertTriangle, CheckCircle, Info, Loader2 } from 'lucide-react';
import { aiService } from '@/services/aiService';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface Insight {
  type: 'warning' | 'success' | 'info';
  title: string;
  message: string;
  action: string;
}

interface InsightsData {
  insights: Insight[];
  summary: string;
  timestamp: string;
}

export function GandraInsights() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInsights() {
      try {
        const result = await aiService.getInsights();
        setData(result);
      } catch (error) {
        console.error('Erro ao carregar insights do COMPLIANCE X:', error);
      } finally {
        setLoading(false);
      }
    }

    loadInsights();
  }, []);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-blue-100 bg-white shadow-sm">
        <div className="flex flex-col items-center space-y-2">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm font-medium text-gray-500">COMPLIANCE X analisando dados...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm transition-all hover:shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-blue-100">
        <div className="flex items-center space-x-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
            <span className="text-lg font-black italic">G</span>
          </div>
          <h2 className="text-lg font-bold text-gray-800">COMPLIANCE X Insights</h2>
        </div>
        <div className="flex items-center space-x-1 rounded-full bg-blue-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700">
          <Sparkles className="h-3 w-3" />
          <span>IA Ativa</span>
        </div>
      </div>

      <div className="p-6">
        <p className="mb-6 text-sm leading-relaxed text-gray-600">
          {data.summary}
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {data.insights.map((insight, index) => (
            <div 
              key={index}
              className={cn(
                "group relative flex flex-col justify-between rounded-xl p-4 transition-all hover:scale-[1.02]",
                insight.type === 'warning' && "bg-amber-50 border border-amber-100",
                insight.type === 'success' && "bg-emerald-50 border border-emerald-100",
                insight.type === 'info' && "bg-blue-50 border border-blue-100"
              )}
            >
              <div className="mb-4">
                <div className="mb-2 flex items-center space-x-2">
                  {insight.type === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                  {insight.type === 'success' && <CheckCircle className="h-4 w-4 text-emerald-600" />}
                  {insight.type === 'info' && <Info className="h-4 w-4 text-blue-600" />}
                  <h3 className={cn(
                    "text-xs font-bold uppercase tracking-wider",
                    insight.type === 'warning' && "text-amber-800",
                    insight.type === 'success' && "text-emerald-800",
                    insight.type === 'info' && "text-blue-800"
                  )}>
                    {insight.title}
                  </h3>
                </div>
                <p className="text-xs leading-relaxed text-gray-700">
                  {insight.message}
                </p>
              </div>

              <Link 
                href={insight.action}
                className={cn(
                  "flex items-center text-[11px] font-bold uppercase transition-all group-hover:translate-x-1",
                  insight.type === 'warning' && "text-amber-700",
                  insight.type === 'success' && "text-emerald-700",
                  insight.type === 'info' && "text-blue-700"
                )}
              >
                Ver Detalhes <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
