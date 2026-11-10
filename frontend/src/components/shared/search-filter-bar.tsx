'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface FilterSelectOption {
  label: string;
  value: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  type: 'select' | 'date';
  options?: FilterSelectOption[];
  placeholder?: string;
}

interface SearchFilterBarProps {
  searchPlaceholder?: string;
  hideSearch?: boolean;
  filters?: FilterConfig[];
  sortOptions?: FilterSelectOption[];
}

export function SearchFilterBar({
  searchPlaceholder = 'Search…',
  hideSearch = false,
  filters = [],
  sortOptions = [],
}: SearchFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlSearch = searchParams.get('search') ?? '';
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  function applyParam(key: string, value: string | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === 'ALL') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.set('page', '1');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    applyParam('search', searchInputRef.current?.value.trim() || undefined);
  }

  function handleReset() {
    if (searchInputRef.current) {
      searchInputRef.current.value = '';
    }
    router.push(pathname);
  }

  const hasActiveFilters =
    Boolean(urlSearch) ||
    filters.some((f) => Boolean(searchParams.get(f.key))) ||
    Boolean(searchParams.get('sort'));

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
      {!hideSearch ? (
        <form onSubmit={handleSearchSubmit} className="flex flex-1 min-w-[220px] items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              key={urlSearch}
              defaultValue={urlSearch}
              placeholder={searchPlaceholder}
              className="pl-8"
              aria-label={searchPlaceholder}
            />
          </div>
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
        </form>
      ) : null}

      {filters.map((filter) => {
        const current = searchParams.get(filter.key) ?? '';
        if (filter.type === 'date') {
          return (
            <div key={filter.key} className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{filter.label}:</span>
              <Input
                type="date"
                value={current}
                onChange={(e) => applyParam(filter.key, e.target.value || undefined)}
                className="h-9 w-[148px]"
                aria-label={filter.label}
              />
            </div>
          );
        }
        return (
          <Select
            key={filter.key}
            value={current || 'ALL'}
            onValueChange={(value) => applyParam(filter.key, value)}
          >
            <SelectTrigger className="h-9 w-[170px]" aria-label={filter.label}>
              <SelectValue placeholder={filter.placeholder ?? filter.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All {filter.label}</SelectItem>
              {filter.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })}

      {sortOptions.length > 0 ? (
        <Select
          value={searchParams.get('sort') ?? 'DEFAULT'}
          onValueChange={(v) => applyParam('sort', v === 'DEFAULT' ? undefined : v)}
        >
          <SelectTrigger className="h-9 w-[180px]" aria-label="Sort">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DEFAULT">Default sort</SelectItem>
            {sortOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {hasActiveFilters ? (
        <Button variant="ghost" size="sm" onClick={handleReset}>
          <X className="size-3.5" />
          Clear
        </Button>
      ) : null}
    </div>
  );
}
