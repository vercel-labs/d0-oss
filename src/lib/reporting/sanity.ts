// lib/reporting/sanity.ts

import type { ColumnMeta } from "@/lib/snowflake";

export interface SanityReport {
  issues: string[];
  severity: "low" | "med" | "high";
}

export function sanityCheck(
  rows: Record<string, any>[],
  columns: ColumnMeta[]
): SanityReport {
  const issues: string[] = [];
  if (rows.length === 0) return { issues, severity: "low" };

  const n = rows.length;
  const names = columns.map((c) => c.name);

  // Null rates
  for (const name of names) {
    let nulls = 0;
    for (const r of rows)
      if (r[name] === null || r[name] === undefined) nulls++;
    const rate = nulls / n;
    if (rate > 0.3)
      issues.push(`High null rate in "${name}": ${(rate * 100).toFixed(1)}%`);
  }

  // Negative counts, >100% percentages
  const isPct = (k: string) => /pct|percent|percentage|rate|ratio/i.test(k);
  const isCount = (k: string) => /^ct[_A-Z]|count/i.test(k);

  for (const name of names) {
    const first = rows.find((r) => typeof r[name] === "number");
    if (!first) continue;
    const numeric = rows
      .map((r) => r[name])
      .filter((v) => typeof v === "number");

    if (isCount(name)) {
      const neg = numeric.filter((v) => v < 0).length;
      if (neg > 0)
        issues.push(`Negative values in count-like column "${name}"`);
    }

    if (isPct(name)) {
      const over1 = numeric.filter((v) => v > 1.2).length;
      const over100 = numeric.filter((v) => v > 100).length;
      if (over1 > 0 && over100 === 0) {
        issues.push(
          `Percentage/rate "${name}" has values > 1; check scaling (expected 0..1).`
        );
      }
      if (over100 > 0) {
        issues.push(
          `Percentage/rate "${name}" has values > 100; unlikely unless mis-scaled or outliers.`
        );
      }
    }
  }

  const severity =
    issues.length === 0 ? "low" : issues.length <= 2 ? "med" : "high";
  return { issues, severity };
}
