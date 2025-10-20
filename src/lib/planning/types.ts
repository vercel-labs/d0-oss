// Intent and plan types for the Planning phase

import { z } from "zod";

export const timeRangeSchema = z
  .object({
    start: z.string().min(1).optional(), // ISO date or timestamp
    end: z.string().min(1).optional(),
    grain: z.string().optional(), // e.g., day|week|month|quarter|year
  })
  .refine(
    (data) => {
      // If either start or end is provided, both must be provided
      if (data.start || data.end) {
        return data.start && data.end;
      }
      return true;
    },
    {
      message: "Both start and end must be provided if timeRange is used",
    }
  );

export const structuredFilterSchema = z.object({
  field: z.string().min(1), // canonical or alias
  operator: z.enum(["=", "!=", ">", ">=", "<", "<=", "in", "not_in"]),
  values: z.array(z.union([z.string(), z.number(), z.boolean()])),
});

export const intentSchema = z.object({
  metrics: z.array(z.string()).default([]), // metric/measure names or aliases
  dimensions: z.array(z.string()).default([]), // dimension names or aliases
  filters: z.array(z.string()).default([]), // free-form clauses; optional use
  structuredFilters: z.array(structuredFilterSchema).default([]),
  grain: z.string().optional(),
  compare: z.string().optional(),
  timeRange: timeRangeSchema.optional(),
});

export type Intent = z.infer<typeof intentSchema>;

// Join edge for the provisional join graph proposed in planning
export const joinEdgeSchema = z.object({
  from: z.string().min(1), // entity name
  to: z.string().min(1), // entity name
  on: z.object({
    from: z.string().min(1), // field name (dimension name)
    to: z.string().min(1), // field name (dimension name)
  }),
  relationship: z.enum([
    "one_to_one",
    "one_to_many",
    "many_to_one",
    "many_to_many",
  ]),
});

export type JoinEdge = z.infer<typeof joinEdgeSchema>;

export const finalizePlanSchema = z.object({
  intent: intentSchema,
  selectedEntities: z.array(z.string().min(1)).min(1).max(3),
  requiredFields: z.array(z.string()).default([]),
  joinGraph: z.array(joinEdgeSchema).default([]),
  assumptions: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  catalogRestarts: z.number().int().min(0).max(2).default(0).optional(),
});

export type FinalizedPlan = z.infer<typeof finalizePlanSchema>;
