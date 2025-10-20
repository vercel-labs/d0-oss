// Building phase tools for SQL generation and validation

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
    "Compute minimal join path & alias map from selected entities in plan.",
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
    "Render Snowflake SQL from the finalized plan and available entities.",
  inputSchema: planInputSchema,
  execute: async ({ plan }) => {
    console.log("[BuildSQL] Received plan:", JSON.stringify(plan, null, 2));

    // Handle different plan formats from the agent

    // Ensure selectedEntities exists
    if (!plan.selectedEntities) {
      // Default to empty array - will be handled by validation
      plan.selectedEntities = [];
    }

    // Ensure joinGraph exists
    if (!plan.joinGraph) {
      plan.joinGraph = [];
    }

    // Ensure intent structure exists
    if (!plan.intent) {
      plan.intent = {
        metrics: [],
        dimensions: [],
        filters: [],
        structuredFilters: [],
      };
    }

    const p = plan as FinalizedPlan;

    // Validate required fields
    if (
      !p.selectedEntities ||
      !Array.isArray(p.selectedEntities) ||
      p.selectedEntities.length === 0
    ) {
      console.error("[BuildSQL] Error: selectedEntities missing or empty");
      console.error("[BuildSQL] Full plan:", JSON.stringify(plan));
      throw new Error(
        "Invalid plan: selectedEntities is required and must not be empty"
      );
    }

    // Load entities referenced in selectedEntities and joinGraph
    const needed = new Set<string>(p.selectedEntities);
    if (p.joinGraph && Array.isArray(p.joinGraph)) {
      p.joinGraph.forEach((e) => {
        needed.add(e.from);
        needed.add(e.to);
      });
    }

    const registry = new Map<string, any>();
    for (const e of needed) {
      // Entity names should match the file names exactly
      // The agent should provide the correct entity names from the planning phase
      const { entity } = await loadEntityYaml(e);
      registry.set(e, entity);
    }

    const sql = renderSQLFromPlan(p, registry);
    return { sql };
  },
});

export const SyntaxValidator = tool({
  description:
    "Static scan of SQL to block multi-statements, DDL/DML, and risky constructs.",
  inputSchema: z.object({ sql: z.string().min(1) }),
  execute: async ({ sql }) => {
    const res = syntaxScan(sql);
    return res;
  },
});

export const SemanticValidator = tool({
  description:
    "Validate that referenced fields/metrics exist and joins/time-grain make sense.",
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
    "Check the SQL for syntax safety and semantic correctness against the plan.",
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
      notes.push("All validation checks passed");
    }

    console.log("[ValidateSQL] Final result:", { syntaxOk, semanticOk, notes });

    return { syntaxOk, semanticOk, notes };
  },
});

export const FinalizeBuild = tool({
  description: "Lock the SQL and validation summary for execution.",
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
  execute: async (payload) => payload,
});
