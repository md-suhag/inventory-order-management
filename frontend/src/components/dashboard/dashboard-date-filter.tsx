'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function DashboardDateFilter({
  from,
  to,
  groupBy,
  showGroupBy,
}: {
  from: string;
  to: string;
  groupBy: 'day' | 'week' | 'month';
  showGroupBy: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [fromVal, setFromVal] = React.useState(from);
  const [toVal, setToVal] = React.useState(to);

  function pushParams(nextFrom: string, nextTo: string, nextGroup: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextFrom) params.set('from', nextFrom);
    else params.delete('from');
    if (nextTo) params.set('to', nextTo);
    else params.delete('to');
    if (nextGroup) params.set('groupBy', nextGroup);
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    pushParams(fromVal, toVal, groupBy);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <Input
        type="date"
        value={fromVal}
        onChange={(e) => setFromVal(e.target.value)}
        className="h-8 w-[142px]"
        aria-label="From date"
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        type="date"
        value={toVal}
        onChange={(e) => setToVal(e.target.value)}
        className="h-8 w-[142px]"
        aria-label="To date"
      />
      {showGroupBy ? (
        <Select value={groupBy} onValueChange={(v) => pushParams(fromVal, toVal, v)}>
          <SelectTrigger className="h-8 w-[112px]" aria-label="Granularity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Daily</SelectItem>
            <SelectItem value="week">Weekly</SelectItem>
            <SelectItem value="month">Monthly</SelectItem>
          </SelectContent>
        </Select>
      ) : null}
      <Button type="submit" size="sm" variant="secondary">
        Apply
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => router.push(pathname)}>
        Current Month
      </Button>
    </form>
  );
}
