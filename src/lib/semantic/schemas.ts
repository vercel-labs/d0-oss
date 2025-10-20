// Zod schemas for validating YAML structures

import { z } from "zod";

export const scalarType = z.enum(["string", "number", "boolean", "time"]);

export const dimensionSchema = z.object({
  name: z.string().min(1),
  sql: z.string().min(1),
  type: scalarType,
  title: z.string().optional(),
  description: z.string().optional(),
  primary_key: z.boolean().optional(),
  public: z.boolean().optional(),
  fill_rate: z.number().int().min(0).max(100).optional(),
  aliases: z.array(z.string()).optional(),
  extremes: z
    .object({
      max_value: z.number().optional(),
      min_value: z.number().optional(),
    })
    .optional(),
});

export const timeDimensionSchema = z.object({
  name: z.string().min(1),
  sql: z.string().min(1),
  type: z.literal("time"),
  title: z.string().optional(),
  description: z.string().optional(),
});

export const measureSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  type: z.enum([
    "count",
    "count_distinct",
    "sum",
    "avg",
    "min",
    "max",
    "number",
  ]),
  sql: z.string().optional(),
  filters: z.array(z.object({ sql: z.string().min(1) })).optional(),
});

export const metricFilterSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(["in", "not_in", "=", "!=", ">", ">=", "<", "<="]),
  values: z.array(z.any()),
});

export const metricSchema = z.object({
  name: z.string().min(1),
  label: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(["atomic", "derived"]),
  source: z
    .object({
      measure: z.string().min(1),
      anchor_date: z.string().min(1),
      filters: z.array(metricFilterSchema).optional(),
    })
    .optional(),
  periods: z
    .array(z.enum(["day", "week", "month", "quarter", "year"]))
    .optional(),
  units: z
    .object({
      unit: z.string().min(1),
      unit_type: z.enum(["count", "ratio", "currency"]),
      rounding: z.number().int().optional(),
    })
    .optional(),
  aliases: z.array(z.string()).optional(),
});

export const joinSchema = z.object({
  target_entity: z.string().min(1),
  relationship: z.enum([
    "one_to_one",
    "one_to_many",
    "many_to_one",
    "many_to_many",
  ]),
  join_columns: z.object({
    from: z.string().min(1),
    to: z.string().min(1),
  }),
});

export const commonFilterSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  sql: z.string().min(1),
});

export const entityYamlSchema = z.object({
  name: z.string().min(1),
  table: z.string().min(1),
  grain: z.string().min(1),
  description: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  dimensions: z.array(dimensionSchema).default([]),
  time_dimensions: z.array(timeDimensionSchema).default([]),
  measures: z.array(measureSchema).default([]),
  metrics: z.array(metricSchema).default([]),
  joins: z.array(joinSchema).default([]),
  common_filters: z.array(commonFilterSchema).default([]),
});

export const catalogCardSchema = z.object({
  name: z.string().min(1),
  grain: z.string().min(1),
  num_rows: z.number().int().nonnegative().optional(),
  domain: z.string().optional(),
  description: z.string().optional(),
  fields: z.array(z.string()).optional(),
  example_questions: z.array(z.string()).optional(),
  use_cases: z.string().optional(),
  owners: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export const catalogSchema = z.object({
  version: z.number().int().default(1),
  entities: z.array(catalogCardSchema),
});
