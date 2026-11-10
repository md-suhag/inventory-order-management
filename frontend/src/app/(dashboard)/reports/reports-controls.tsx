'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type ReportTab = 'sales' | 'purchases' | 'inventory' | 'financial';

export function ReportsControls({
  activeTab,
  availableTabs,
  from,
  to,
  groupBy,
  asOf,
}: {
  activeTab: ReportTab;
  availableTabs: { id: ReportTab; label: string }[];
  from: string;
  to: string;
  groupBy: 'day' | 'week' | 'month';
  asOf: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [fromVal, setFromVal] = React.useState(from);
  const [toVal, setToVal] = React.useState(to);
  const [asOfVal, setAsOfVal] = React.useState(asOf);

  function pushParams(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (!v) params.delete(k);
      else params.set(k, v);
    }
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleApply(e: React.FormEvent) {
    e.preventDefault();
    pushParams({
      from: fromVal || undefined,
      to: toVal || undefined,
      asOf: asOfVal || undefined,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 rounded-lg border bg-card p-1.5">
        {availableTabs.map((t) => (
          <Button
            key={t.id}
            type="button"
            variant={activeTab === t.id ? 'default' : 'ghost'}
            size="sm"
            className={cn(activeTab === t.id ? '' : 'text-muted-foreground')}
            onClick={() => pushParams({ tab: t.id })}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <form onSubmit={handleApply} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">From:</span>
          <Input
            type="date"
            value={fromVal}
            onChange={(e) => setFromVal(e.target.value)}
            className="h-8 w-[142px]"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">To:</span>
          <Input
            type="date"
            value={toVal}
            onChange={(e) => setToVal(e.target.value)}
            className="h-8 w-[142px]"
          />
        </div>

        {activeTab === 'sales' ? (
          <Select value={groupBy} onValueChange={(v) => pushParams({ groupBy: v })}>
            <SelectTrigger className="h-8 w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
            </SelectContent>
          </Select>
        ) : null}

        {activeTab === 'financial' ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Aging As Of:</span>
            <Input
              type="date"
              value={asOfVal}
              onChange={(e) => setAsOfVal(e.target.value)}
              className="h-8 w-[142px]"
            />
          </div>
        ) : null}

        <Button type="submit" size="sm" variant="secondary">
          Apply Range
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => router.push(`${pathname}?tab=${activeTab}`)}>
          Reset
        </Button>
      </form>
    </div>
  );
}
