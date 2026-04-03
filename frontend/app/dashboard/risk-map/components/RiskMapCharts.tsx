'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type CategoryPoint = { name: string; count: number };

export function RiskCategoryBarChart({
  data,
}: {
  data: CategoryPoint[];
}) {
  return (
    <ResponsiveContainer width="100%" height={248}>
      <BarChart data={data} layout="vertical" margin={{ left: 80, right: 20 }}>
        <CartesianGrid
          stroke="color-mix(in srgb, var(--ds-color-border-subtle) 82%, transparent)"
          strokeDasharray="3 3"
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: 'var(--ds-color-text-secondary)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fill: 'var(--ds-color-text-secondary)' }}
          width={80}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 16,
            border: '1px solid var(--ds-color-border-subtle)',
            background: 'var(--ds-color-surface-elevated)',
            color: 'var(--ds-color-text-primary)',
          }}
        />
        <Bar
          dataKey="count"
          name="Riscos"
          fill="var(--ds-color-accent)"
          radius={[0, 8, 8, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

