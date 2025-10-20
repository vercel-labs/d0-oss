// lib/reporting/viz.ts

import type { ColumnMeta } from '@/lib/snowflake';

export interface IntentLike {
  metrics?: string[];
  dimensions?: string[];
  timeRange?: { start: string; end: string; grain?: string };
}

function looksTemporal(name: string): boolean {
  return /date|time|on$|_at$|timestamp/i.test(name);
}

function firstNumeric(columns: ColumnMeta[], rows: Record<string, any>[]): string | null {
  // prefer a metric from intent; else scan first row for number types
  if (rows.length === 0) return null;
  const keys = Object.keys(rows[0]);
  for (const k of keys) {
    if (typeof rows[0][k] === 'number') return k;
  }
  return null;
}

function chooseDimension(intent: IntentLike, columns: ColumnMeta[], rows: Record<string, any>[]): { field: string; temporal: boolean } | null {
  const candidates: string[] = [];
  if (intent.dimensions && intent.dimensions.length > 0) {
    candidates.push(...intent.dimensions);
  } else if (rows.length > 0) {
    candidates.push(...Object.keys(rows[0]));
  }
  for (const c of candidates) {
    if (!rows[0] || !(c in rows[0])) continue;
    const isTemp = looksTemporal(c);
    return { field: c, temporal: isTemp };
  }
  return null;
}

export function buildVegaLite(
  intent: IntentLike,
  rows: Record<string, any>[],
  columns: ColumnMeta[]
): any {
  // Decide channels
  const dim = chooseDimension(intent, columns, rows);
  const metric = intent.metrics?.[0] ?? firstNumeric(columns, rows);

  if (!dim || !metric) {
    // Table-like fallback: show first two columns as nominal vs quantitative if possible
    if (rows.length === 0) {
      return {
        $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
        data: { values: [] },
        mark: 'bar',
        encoding: {}
      };
    }
    const keys = Object.keys(rows[0]);
    const d = keys[0];
    const m = keys.find(k => typeof rows[0][k] === 'number') ?? keys[1] ?? keys[0];
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      data: { values: rows },
      mark: 'bar',
      encoding: {
        x: { field: d, type: 'nominal', sort: null, axis: { labelAngle: -45 }, scale: { paddingInner: 0.3 } },
        y: { field: m, type: 'quantitative' }
      }
    };
  }

  const x = dim.temporal
    ? {
        field: dim.field,
        type: 'temporal' as const,
        axis: { format: '%b %d, %Y', labelAngle: -45 }
      }
    : {
        field: dim.field,
        type: 'nominal' as const,
        sort: null,
        axis: { labelAngle: -45 },
        scale: { paddingInner: 0.3 }
      };

  const spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    data: { values: rows },
    mark: dim.temporal ? 'line' : 'bar',
    encoding: {
      x,
      y: { field: metric, type: 'quantitative' }
    }
  };

  // If we have a second dimension in intent, use it for color (categorical)
  if (intent.dimensions && intent.dimensions.length > 1) {
    const second = intent.dimensions[1];
    if (rows[0] && rows[0][second] !== undefined) {
      (spec as any).encoding.color = { field: second, type: 'nominal' };
    }
  }

  return spec;
}