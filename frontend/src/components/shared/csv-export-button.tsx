'use client';

import { Download } from 'lucide-react';
import { buildCsvContent, type CsvColumn } from '@/lib/csv';
import { Button } from '@/components/ui/button';

export type { CsvColumn };

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
    const csv = buildCsvContent(rows, columns);
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
