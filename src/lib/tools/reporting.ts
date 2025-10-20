// lib/tools/reporting.ts
import { tool } from "ai";
import { z } from "zod";
import { sanityCheck } from "@/lib/reporting/sanity";
import { toCSV } from "@/lib/reporting/csv";
import { buildVegaLite } from "@/lib/reporting/viz";
import type { ColumnMeta } from "@/lib/snowflake";

const columnMetaSchema = z.object({
  name: z.string(),
  type: z.string(),
});

const rowsSchema = z.array(z.any());
const columnsSchema = z.array(columnMetaSchema);

export const SanityCheck = tool({
  description: "Quick QA over result rows/columns; flags simple anomalies.",
  inputSchema: z.object({
    rows: rowsSchema,
    columns: columnsSchema,
  }),
  execute: async ({ rows, columns }) => {
    const report = sanityCheck(rows, columns as ColumnMeta[]);
    return report; // { issues: string[], severity: 'low'|'med'|'high' }
  },
});

export const FormatResults = tool({
  description:
    "Convert rows/columns into Base64 CSV (≤1000 rows) and a small preview array. Returns truncation flag if data was limited.",
  inputSchema: z.object({
    rows: rowsSchema,
    columns: columnsSchema,
  }),
  outputSchema: z.object({
    csvBase64: z.string(),
    preview: rowsSchema,
    truncated: z.boolean(),
    totalRows: z.number(),
  }),
  execute: async ({ rows, columns }) => {
    const maxRows = 1000;
    // Detect if truncation occurred
    const totalRows = rows.length;
    const truncated = totalRows > maxRows;

    // Drop possible +1 truncation row from executor
    const limited = rows.slice(0, maxRows);
    const { csvBase64, preview } = toCSV(limited, columns as ColumnMeta[], {
      maxRows,
    });

    if (truncated) {
      console.log(
        `[FormatResults] Data truncated: showing ${maxRows} of ${totalRows} rows`
      );
    }

    return { csvBase64, preview, truncated, totalRows };
  },
});

export const VisualizeData = tool({
  description:
    "Generate a minimal Vega-Lite v5 spec for the given intent and result set.",
  inputSchema: z.object({
    intent: z.object({
      metrics: z.array(z.string()).optional(),
      dimensions: z.array(z.string()).optional(),
      timeRange: z
        .object({
          start: z.string(),
          end: z.string(),
          grain: z.string().optional(),
        })
        .optional(),
    }),
    rows: rowsSchema,
    columns: columnsSchema,
  }),
  execute: async ({ intent, rows, columns }) => {
    const spec = buildVegaLite(intent, rows, columns as ColumnMeta[]);
    return { vegaLite: spec };
  },
});

export const ExplainResults = tool({
  description:
    "Record the business-facing narrative and a calibrated confidence score (0..1).",
  inputSchema: z.object({
    narrative: z.string().min(1).max(2000),
    confidence: z.number().min(0).max(1),
    assumptions: z.array(z.string()).default([]),
    issues: z.array(z.string()).default([]),
  }),
  outputSchema: z.object({
    narrative: z.string().min(1).max(2000),
    confidence: z.number().min(0).max(1),
    assumptions: z.array(z.string()),
    issues: z.array(z.string()),
  }),
  execute: async ({ narrative, confidence, assumptions = [], issues = [] }) => {
    return { narrative, confidence, assumptions, issues };
  },
});

export const FinalizeReport = tool({
  description: "Finalize report payload for the UI.",
  inputSchema: z.object({
    sql: z.string().min(1),
    csvBase64: z.string().min(1),
    preview: rowsSchema,
    vegaLite: z.any(),
    narrative: z.string().min(1),
    confidence: z.number().min(0).max(1),
  }),
  outputSchema: z.object({
    sql: z.string().min(1),
    csvBase64: z.string().min(1),
    preview: rowsSchema,
    vegaLite: z.any(),
    narrative: z.string().min(1),
    confidence: z.number().min(0).max(1),
  }),
  execute: async (payload) => payload,
});
