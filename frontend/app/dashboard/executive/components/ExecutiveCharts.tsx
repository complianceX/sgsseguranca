'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const CHART_TOKENS = {
  grid: 'color-mix(in srgb, var(--ds-color-border-subtle) 82%, transparent)',
  axis: 'var(--ds-color-text-muted)',
  surface: 'var(--ds-color-surface-elevated)',
  border: 'var(--ds-color-border-subtle)',
  risk: 'var(--ds-color-action-primary)',
  riskFill:
    'color-mix(in srgb, var(--ds-color-action-primary) 26%, transparent)',
  warning: 'var(--ds-color-warning)',
};

type RiskPoint = { month: string; risk_score: number };
type NcPoint = { month: string; count: number };

export function ExecutiveRiskTrendChart({ data }: { data: RiskPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={208}>
      <AreaChart data={data}>
        <CartesianGrid
          stroke={CHART_TOKENS.grid}
          strokeDasharray="3 3"
          vertical={false}
        />
        <XAxis
          dataKey="month"
          tick={{ fill: CHART_TOKENS.axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: CHART_TOKENS.axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 16,
            border: `1px solid ${CHART_TOKENS.border}`,
            background: CHART_TOKENS.surface,
            color: 'var(--ds-color-text-primary)',
          }}
        />
        <Area
          type="monotone"
          dataKey="risk_score"
          stroke={CHART_TOKENS.risk}
          fill={CHART_TOKENS.riskFill}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ExecutiveNcTrendChart({ data }: { data: NcPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={208}>
      <BarChart data={data}>
        <CartesianGrid
          stroke={CHART_TOKENS.grid}
          strokeDasharray="3 3"
          vertical={false}
        />
        <XAxis
          dataKey="month"
          tick={{ fill: CHART_TOKENS.axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: CHART_TOKENS.axis, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 16,
            border: `1px solid ${CHART_TOKENS.border}`,
            background: CHART_TOKENS.surface,
            color: 'var(--ds-color-text-primary)',
          }}
        />
        <Bar dataKey="count" fill={CHART_TOKENS.warning} radius={[8, 8, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

