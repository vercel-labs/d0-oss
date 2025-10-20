// Building phase tools for SQL generation and validation (SQLite)

import { tool } from "ai";
import { z } from "zod";
import type { FinalizedPlan } from "@/lib/planning/types";
import { loadEntityYaml } from "@/lib/semantic/io";
import { computeJoinPath } from "@/lib/sql/joins";
import { renderSQLFromPlan } from "@/lib/sql/render";
import { syntaxScan, semanticCheck } from "@/lib/sql/validate";

// Helper schema for plan input
const planInputSchema = z.object({
  plan: z.any(), // will be validated inside; expect FinalizedPlan shape
});

export const JoinPathFinder = tool({
  description:
    "Compute minimal join path & alias map from selected entities in plan for SQLite database.",
  inputSchema: z.object({
    baseEntity: z.string().min(1),
    entities: z.array(z.string().min(1)).min(1),
  }),
  execute: async ({ baseEntity, entities }) => {
    // Load all required entity YAMLs into registry map
    const registry = new Map<string, any>();
    for (const e of entities) {
      const { entity } = await loadEntityYaml(e);
      registry.set(e, entity);
    }
    const jp = computeJoinPath(baseEntity, entities, registry);
    return {
      edges: jp.edges,
      aliasByEntity: Array.from(jp.aliasByEntity.entries()),
      orderedEntities: jp.orderedEntities,
    };
  },
});

export const BuildSQL = tool({
  description:
    "Generate simple SQLite SQL from the query request. Provide dimensions (columns to select/group by), measures (aggregations), filters, orderBy, and limit.",
  inputSchema: z.object({
    baseEntity: z.string().min(1).describe("Primary entity (e.g., 'Accounts', 'People', 'Company')"),
    dimensions: z.array(z.string()).default([]).describe("Columns to select and group by (e.g., 'account_number', 'status')"),
    measures: z.array(z.string()).default([]).describe("Aggregations to compute (e.g., 'SUM(monthly_value)', 'COUNT(*)')"),
    filters: z.array(z.string()).default([]).describe("WHERE conditions (e.g., 'status = \"Active\"')"),
    orderBy: z.array(z.string()).default([]).describe("ORDER BY clauses (e.g., 'monthly_value DESC')"),
    limit: z.number().optional().describe("LIMIT clause"),
    joins: z.array(z.object({
      entity: z.string(),
      on: z.string().describe("Join condition (e.g., 'accounts.company_id = companies.id')")
    })).default([]).describe("Tables to join")
  }),
  execute: async ({ baseEntity, dimensions, measures, filters, orderBy, limit, joins }) => {
    console.log("[BuildSQL] Building simple SQLite query");

    // Load base entity to get table name
    const { entity } = await loadEntityYaml(baseEntity);
    const baseTable = entity.table;

    // Build SELECT clause
    const selectParts = [];
    if (dimensions.length > 0) {
      selectParts.push(...dimensions);
    }
    if (measures.length > 0) {
      selectParts.push(...measures);
    }

    if (selectParts.length === 0) {
      selectParts.push("*");
    }

    const selectClause = `SELECT ${selectParts.join(", ")}`;

    // Build FROM clause
    let fromClause = `FROM ${baseTable}`;

    // Build JOIN clauses
    if (joins.length > 0) {
      for (const join of joins) {
        const { entity: joinEntity } = await loadEntityYaml(join.entity);
        fromClause += `\n  LEFT JOIN ${joinEntity.table} ON ${join.on}`;
      }
    }

    // Build WHERE clause
    let whereClause = "";
    if (filters.length > 0) {
      whereClause = `WHERE ${filters.join(" AND ")}`;
    }

    // Build GROUP BY clause
    let groupByClause = "";
    if (dimensions.length > 0 && measures.length > 0) {
      groupByClause = `GROUP BY ${dimensions.join(", ")}`;
    }

    // Build ORDER BY clause
    let orderByClause = "";
    if (orderBy.length > 0) {
      orderByClause = `ORDER BY ${orderBy.join(", ")}`;
    }

    // Build LIMIT clause
    let limitClause = "";
    if (limit !== undefined) {
      limitClause = `LIMIT ${limit}`;
    }

    // Combine all parts
    const sql = [
      selectClause,
      fromClause,
      whereClause,
      groupByClause,
      orderByClause,
      limitClause
    ].filter(Boolean).join("\n");

    console.log("[BuildSQL] Generated SQL:", sql);
    return { sql };
  },
});

export const SyntaxValidator = tool({
  description:
    "Static scan of SQL to block multi-statements, DDL/DML, and risky constructs. Validates SQLite compatibility.",
  inputSchema: z.object({ sql: z.string().min(1) }),
  execute: async ({ sql }) => {
    const res = syntaxScan(sql);
    return res;
  },
});

export const SemanticValidator = tool({
  description:
    "Validate that referenced fields/metrics exist and joins/time-grain make sense for SQLite tables.",
  inputSchema: planInputSchema.extend({ sql: z.string().min(1) }),
  execute: async ({ plan, sql }) => {
    const p = plan as FinalizedPlan;
    console.log("[SemanticValidator] Starting validation...");
    console.log("[SemanticValidator] Selected entities:", p.selectedEntities);

    // Same registry loading as BuildSQL
    const needed = new Set<string>(p.selectedEntities);
    p.joinGraph.forEach((e) => {
      needed.add(e.from);
      needed.add(e.to);
    });

    console.log("[SemanticValidator] Loading entities:", Array.from(needed));
    const registry = new Map<string, any>();
    for (const e of needed) {
      const { entity } = await loadEntityYaml(e);
      registry.set(e, entity);
      console.log(
        `[SemanticValidator] Loaded entity "${e}" with ${
          entity.dimensions?.length || 0
        } dimensions`
      );
    }

    const res = semanticCheck(p, sql, registry);
    console.log("[SemanticValidator] Result:", res);

    if (!res.ok && res.issues?.length > 0) {
      console.log("[SemanticValidator] Validation issues found:");
      res.issues.forEach((issue: string) => console.log(`  - ${issue}`));
    }

    return res;
  },
});

// --- Tool: ValidateSQL (Consolidated) ---
export const ValidateSQL = tool({
  description:
    "Check the SQL for syntax safety and semantic correctness against the plan. Ensures SQLite compatibility.",
  inputSchema: z.object({
    plan: z.any(), // Will cast to FinalizedPlan internally
    sql: z.string().min(1),
  }),
  outputSchema: z.object({
    syntaxOk: z.boolean(),
    semanticOk: z.boolean(),
    notes: z.array(z.string()),
  }),
  execute: async ({ plan, sql }) => {
    const p = plan as FinalizedPlan;
    const notes: string[] = [];

    console.log("[ValidateSQL] Starting consolidated validation...");

    // Step 1: Syntax check
    const syntaxRes = syntaxScan(sql);
    const syntaxOk = syntaxRes.ok === true;

    if (!syntaxOk) {
      // syntaxRes has issues array when there are problems
      if (syntaxRes.issues && syntaxRes.issues.length > 0) {
        for (const issue of syntaxRes.issues) {
          notes.push(`Syntax issue: ${issue}`);
        }
        console.log("[ValidateSQL] Syntax check failed:", syntaxRes.issues);
      } else {
        notes.push("Syntax issue: Failed syntax scan");
        console.log("[ValidateSQL] Syntax check failed");
      }
    } else {
      console.log("[ValidateSQL] Syntax check passed");
    }

    // Step 2: Load entities for semantic check
    const needed = new Set<string>(p.selectedEntities || []);
    if (Array.isArray(p.joinGraph)) {
      for (const j of p.joinGraph) {
        needed.add(j.from);
        needed.add(j.to);
      }
    }

    console.log("[ValidateSQL] Loading entities:", Array.from(needed));
    const registry = new Map<string, any>();
    for (const e of needed) {
      const { entity } = await loadEntityYaml(e);
      registry.set(e, entity);
    }

    // Step 3: Semantic check
    const semRes = semanticCheck(p, sql, registry);
    const semanticOk = semRes.ok === true;

    if (!semanticOk) {
      if (Array.isArray(semRes.issues) && semRes.issues.length > 0) {
        for (const issue of semRes.issues) {
          notes.push(issue);
        }
        console.log("[ValidateSQL] Semantic issues found:", semRes.issues);
      } else {
        notes.push("Semantic validation failed");
      }
    } else {
      console.log("[ValidateSQL] Semantic check passed");
    }

    // If both checks passed and no notes, add a confirmation
    if (syntaxOk && semanticOk && notes.length === 0) {
      notes.push("All validation checks passed - SQL is SQLite compatible");
    }

    console.log("[ValidateSQL] Final result:", { syntaxOk, semanticOk, notes });

    return { syntaxOk, semanticOk, notes };
  },
});

export const FinalizeBuild = tool({
  description: "Lock the SQL and validation summary for execution against SQLite database.",
  inputSchema: z.object({
    sql: z.string().min(1),
    validation: z.object({
      syntaxOk: z.boolean(),
      semanticOk: z.boolean(),
      notes: z.array(z.string()).default([]),
    }),
  }),
  outputSchema: z.object({
    sql: z.string().min(1),
    validation: z.object({
      syntaxOk: z.boolean(),
      semanticOk: z.boolean(),
      notes: z.array(z.string()),
    }),
  }),
  execute: async (payload) => {
    console.log("[FinalizeBuild] Finalizing SQL for SQLite execution");
    console.log("[FinalizeBuild] SQL:", payload.sql);
    console.log("[FinalizeBuild] Validation:", payload.validation);
    return payload;
  },
});
