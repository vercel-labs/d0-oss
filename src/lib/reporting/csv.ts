// lib/reporting/csv.ts

import type { ColumnMeta } from '@/lib/snowflake';

function csvEscape(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  let s = String(value);
  // If contains quotes, commas, or newlines, wrap in quotes and escape quotes
  const needsQuote = /[",\n]/.test(s);
  if (needsQuote) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function toCSV(
  rows: Record<string, any>[],
  columns: ColumnMeta[],
  opts: { maxRows?: number } = {}
): { csvBase64: string; preview: Record<string, any>[] } {
  const max = Math.min(opts.maxRows ?? 1000, 1000);
  const header = columns.map(c => c.name);
  const buf: string[] = [];
  buf.push(header.map(csvEscape).join(','));

  const limited = rows.slice(0, max);
  for (const r of limited) {
    const line = header.map(h => csvEscape(r[h]));
    buf.push(line.join(','));
  }

  const csvText = buf.join('\n');
  const csvBase64 = Buffer.from(csvText, 'utf8').toString('base64');

  const preview = limited.slice(0, Math.min(30, limited.length));
  return { csvBase64, preview };
}