// lib/execute/errors.ts

export interface ColumnNotFoundInfo { missingColumns: string[] }
export interface AmbiguousColumnInfo { columns: string[] }
export interface TimeoutInfo { message: string }

export function isColumnNotFound(err: any): ColumnNotFoundInfo | null {
  const msg = String(err?.message ?? err ?? '');
  // Common Snowflake compilation message:
  // "SQL compilation error: error line X at position Y invalid identifier 'FOO'"
  // Also handle simpler format: "invalid identifier 'FOO'"
  const m = msg.match(/invalid identifier\s*['"]([^'"]+)['"]/gi);
  if (m) {
    const cols = Array.from(new Set(m.map(s => {
      const match = s.match(/invalid identifier\s*['"]([^'"]+)['"]/i);
      return match ? match[1] : '';
    }).filter(Boolean)));
    return { missingColumns: cols };
  }
  // Fallback phrase:
  if (/column .* not found/i.test(msg)) {
    const c = (msg.match(/column ([^ ]+) not found/i) || [,''])[1];
    return { missingColumns: c ? [c.replace(/["']/g,'')] : [] };
  }
  return null;
}

export function isAmbiguousColumn(err: any): AmbiguousColumnInfo | null {
  const msg = String(err?.message ?? err ?? '');
  // "ambiguous column name" or "ambiguous"
  if (/ambiguous/i.test(msg) && /column/i.test(msg)) {
    // Try to extract names in quotes
    const cols = Array.from(new Set((msg.match(/"([^"]+)"/g) || []).map(s => s.replace(/"/g,''))));
    return { columns: cols.length ? cols : ['(unknown)'] };
  }
  return null;
}

export function isTimeout(err: any): TimeoutInfo | null {
  const msg = String(err?.message ?? err ?? '');
  if (/timeout/i.test(msg)) return { message: msg };
  // Our own error message from lib/snowflake.ts
  if (/Statement timeout/i.test(msg)) return { message: msg };
  return null;
}