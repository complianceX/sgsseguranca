'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const TOOLTIP_STYLE = {
  borderRadius: 16,
  border: '1px solid var(--ds-color-border-subtle)',
  background: 'var(--ds-color-surface-elevated)',
  color: 'var(--ds-color-text-primary)',
};

interface MonthlyPoint {
  month: string;
  total: number;
}

interface CategoryChartPoint {
  name: string;
  count: number;
}

interface ColoredCategoryChartPoint extends CategoryChartPoint {
  fill: string;
}

interface NcMonthlyPoint {
  mes: string;
  total: number;
}

interface CorrectiveActionBySitePoint {
  site: string;
  total: number;
  overdue: number;
  criticalOpen: number;
}

export function CatByMonthChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={204}>
      <LineChart data={data}>
        <CartesianGrid
          stroke="color-mix(in srgb, var(--ds-color-border-subtle) 82%, transparent)"
          strokeDasharray="3 3"
          vertical={false}
        />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 10, fill: 'var(--ds-color-text-muted)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--ds-color-text-muted)' }}
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Line
          type="monotone"
          dataKey="total"
          stroke="var(--ds-color-action-primary)"
          strokeWidth={2.5}
          dot={false}
          name="CATs"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CatByGravidadeChart({
  data,
}: {
  data: ColoredCategoryChartPoint[];
}) {
  return (
    <ResponsiveContainer width="100%" height={204}>
      <BarChart data={data} layout="vertical" margin={{ left: 60 }}>
        <CartesianGrid
          stroke="color-mix(in srgb, var(--ds-color-border-subtle) 82%, transparent)"
          strokeDasharray="3 3"
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: 'var(--ds-color-text-muted)' }}
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fill: 'var(--ds-color-text-muted)' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="count" name="CATs" radius={[0, 6, 6, 0]}>
          {data.map((entry, index) => (
            <Cell key={`${entry.name}-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CatByTipoChart({ data }: { data: CategoryChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={172}>
      <BarChart data={data} layout="vertical" margin={{ left: 100 }}>
        <CartesianGrid
          stroke="color-mix(in srgb, var(--ds-color-border-subtle) 82%, transparent)"
          strokeDasharray="3 3"
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: 'var(--ds-color-text-muted)' }}
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fill: 'var(--ds-color-text-muted)' }}
          width={100}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar
          dataKey="count"
          name="CATs"
          fill="var(--ds-color-info)"
          radius={[0, 6, 6, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function NcMonthlyChart({ data }: { data: NcMonthlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={204}>
      <LineChart data={data.map((item) => ({ ...item, name: item.mes }))}>
        <CartesianGrid
          stroke="color-mix(in srgb, var(--ds-color-border-subtle) 82%, transparent)"
          strokeDasharray="3 3"
          vertical={false}
        />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: 'var(--ds-color-text-muted)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--ds-color-text-muted)' }}
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Line
          type="monotone"
          dataKey="total"
          stroke="var(--ds-color-warning)"
          strokeWidth={2.5}
          dot={false}
          name="NCs"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CaSlaBySiteChart({
  data,
}: {
  data: CorrectiveActionBySitePoint[];
}) {
  return (
    <ResponsiveContainer width="100%" height={204}>
      <BarChart data={data} layout="vertical" margin={{ left: 120 }}>
        <CartesianGrid
          stroke="color-mix(in srgb, var(--ds-color-border-subtle) 82%, transparent)"
          strokeDasharray="3 3"
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: 'var(--ds-color-text-muted)' }}
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="site"
          tick={{ fontSize: 10, fill: 'var(--ds-color-text-muted)' }}
          width={120}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend />
        <Bar
          dataKey="total"
          name="Total"
          fill="var(--ds-color-info)"
          radius={[0, 6, 6, 0]}
        />
        <Bar
          dataKey="overdue"
          name="Vencidas"
          fill="var(--ds-color-danger)"
          radius={[0, 6, 6, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrainingStatusChart({
  data,
}: {
  data: ColoredCategoryChartPoint[];
}) {
  return (
    <ResponsiveContainer width="100%" height={152}>
      <BarChart data={data} layout="vertical" margin={{ left: 80 }}>
        <CartesianGrid
          stroke="color-mix(in srgb, var(--ds-color-border-subtle) 82%, transparent)"
          strokeDasharray="3 3"
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: 'var(--ds-color-text-muted)' }}
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11, fill: 'var(--ds-color-text-muted)' }}
          width={80}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="count" name="Qtd" radius={[0, 6, 6, 0]}>
          {data.map((entry, index) => (
            <Cell key={`${entry.name}-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
