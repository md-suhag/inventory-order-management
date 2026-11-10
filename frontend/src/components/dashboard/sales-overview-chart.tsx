'use client';

import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney, type FormatSettings } from '@/lib/format';

export interface SalesPeriodPoint {
  period: string;
  grossSales: string;
  discounts: string;
  returns: string;
  netSales: string;
  tax: string;
  orderCount: number;
}

const emptySubscribe = () => () => {};

export function SalesOverviewChart({
  data,
  formatSettings,
}: {
  data: SalesPeriodPoint[];
  formatSettings: FormatSettings;
}) {
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const chartData = data.map((d) => ({
    period: d.period,
    netSales: Number(d.netSales),
    grossSales: Number(d.grossSales),
    orderCount: d.orderCount,
  }));

  if (!mounted) {
    return <div className="h-[260px] w-full animate-pulse rounded-md bg-muted/50" />;
  }

  if (chartData.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        No confirmed sales in the selected period.
      </div>
    );
  }

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
          <XAxis dataKey="period" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={72} />
          <Tooltip
            formatter={(value) => [formatMoney(Number(value ?? 0), formatSettings), 'Amount']}
            contentStyle={{
              borderRadius: '0.5rem',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--card)',
              fontSize: '12px',
            }}
          />
          <Bar dataKey="netSales" name="Net Sales" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
