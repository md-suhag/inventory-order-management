'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

function escapeCsvCell(raw: string | number | boolean | null | undefined): string {
  const str = raw === null || raw === undefined ? '' : String(raw);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function CsvExportButton<T>({
  filename,
  rows,
  columns,
  label = 'Export CSV',
}: {
  filename: string;
  rows: T[];
  columns: CsvColumn<T>[];
  label?: string;
}) {
  function handleExport() {
    const headerLine = columns.map((c) => escapeCsvCell(c.header)).join(',');
    const bodyLines = rows.map((row) => columns.map((c) => escapeCsvCell(c.value(row))).join(','));
    const csv = [headerLine, ...bodyLines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleExport} disabled={rows.length === 0}>
      <Download className="size-4" />
      {label}
    </Button>
  );
}
