export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const SIGNED_NUMBER = /^[-+]?\d+(?:\.\d+)?$/;

/**
 * Formats and escapes a CSV cell, neutralizing spreadsheet formula injection (CWE-1236) on strings
 * that start with formula trigger characters while preserving genuine signed numeric values.
 */
export function escapeCsvCell(raw: string | number | boolean | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  let str = String(raw);
  if (typeof raw !== 'number' && typeof raw !== 'boolean' && FORMULA_PREFIX.test(str) && !SIGNED_NUMBER.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvContent<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const headerLine = columns.map((c) => escapeCsvCell(c.header)).join(',');
  const bodyLines = rows.map((row) => columns.map((c) => escapeCsvCell(c.value(row))).join(','));
  return [headerLine, ...bodyLines].join('\r\n');
}
