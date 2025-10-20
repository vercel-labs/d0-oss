// lib/tools/execute.ts
import { tool } from "ai";
import { z } from "zod";
import { getSnowflakePool, explainJSON, execWithRetry } from "@/lib/snowflake";

// ---- Estimate Cost Heuristics ----
function collectNumbers(obj: any, keys: string[], acc = 0): number {
  if (obj && typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (typeof v === "number" && keys.includes(k.toLowerCase())) acc += v;
      else if (v && typeof v === "object") acc += collectNumbers(v, keys, 0);
    }
  }
  return acc;
}

function estimatePlanCost(planJson: any): {
  score: number;
  notes: string[];
  actions: string[];
} {
  // Heuristic: sum of these signals across the plan
  const keys = [
    "bytes",
    "bytesread",
    "bytesassigned",
    "rows",
    "rowcount",
    "partitions",
    "partitionstotal",
  ];
  const total = collectNumbers(planJson, keys);

  // crude join count approximation:
  const planText = JSON.stringify(planJson).toLowerCase();
  const joinCount = (planText.match(/join/g) || []).length;

  // Score 0..100 with log scaling
  const magnitude = Math.log10(1 + total);
  const score = Math.min(100, Math.round(magnitude * 12 + joinCount * 5));

  const notes: string[] = [
    `heuristic_total_signal=${total.toLocaleString()}`,
    `approx_join_ops=${joinCount}`,
    `log10_magnitude=${magnitude.toFixed(2)}`,
  ];

  const actions: string[] = [];
  if (score >= 60) actions.push("addPartitionFilters");
  if (score >= 70) actions.push("reduceTimeWindow");
  if (score >= 80) actions.push("coarsenGrain");
  if (score >= 90) actions.push("limitColumnsOrAddMV");

  return { score, notes, actions };
}

// ---- Tools ----
export const ExplainSnowflake = tool({
  description:
    "Run EXPLAIN USING JSON for the given SQL and return parsed plan JSON.",
  inputSchema: z.object({
    sql: z.string().min(1),
    timeoutMs: z.number().int().positive().max(30000).default(10000),
  }),
  execute: async ({ sql, timeoutMs = 10000 }) => {
    const pool = getSnowflakePool();
    const planJson = await explainJSON(pool, sql, timeoutMs);
    return { planJson };
  },
});

export const EstimateCost = tool({
  description:
    "Estimate performance cost from EXPLAIN JSON; returns score 0..100 and recommended actions.",
  inputSchema: z.object({ planJson: z.any() }),
  execute: async ({ planJson }) => {
    const { score, notes, actions } = estimatePlanCost(planJson);
    return { score, notes, actions };
  },
});

export const ExecuteSQL = tool({
  description:
    "Execute read-only SQL with timeout, retries, and circuit breaker. Returns rows, columns, lastQueryId.",
  inputSchema: z.object({
    sql: z.string().min(1),
    timeoutMs: z.number().int().positive().max(120_000).default(20_000),
    attempts: z.number().int().min(1).max(5).default(3),
    enforceLimit: z.boolean().default(false),
    queryTag: z.string().optional(),
  }),
  execute: async ({
    sql,
    timeoutMs = 20000,
    attempts = 3,
    enforceLimit = false,
    queryTag,
  }) => {
    const pool = getSnowflakePool();
    const res = await execWithRetry(pool, sql, {
      timeoutMs,
      attempts,
      enforceLimit,
      queryTag,
      rowLimit: 1001,
    });
    return res;
  },
});

// Import additional dependencies for ExecuteSQLWithRepair
import type { FinalizedPlan } from "@/lib/planning/types";
import { loadEntityYaml } from "@/lib/semantic/io";
import { attemptRepair } from "@/lib/execute/repair";

// Query result cache to avoid hitting database for identical queries
// Map from SQL string to cached result
const queryCache = new Map<string, {
  rows: any[];
  columns: Array<{ name: string; type: string }>;
  lastQueryId?: string;
  cachedAt: number;
}>();

// Cache settings
const CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_SIZE = 100; // Maximum number of cached queries

// Helper to clean old cache entries
function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, value] of queryCache.entries()) {
    if (now - value.cachedAt > CACHE_MAX_AGE_MS) {
      queryCache.delete(key);
      console.log(`[QueryCache] Expired cache entry removed for SQL`);
    }
  }

  // Also enforce size limit (remove oldest entries if over limit)
  if (queryCache.size > CACHE_MAX_SIZE) {
    const entries = Array.from(queryCache.entries())
      .sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    const toRemove = entries.slice(0, queryCache.size - CACHE_MAX_SIZE);
    for (const [key] of toRemove) {
      queryCache.delete(key);
      console.log(`[QueryCache] Size limit reached, removed oldest entry`);
    }
  }
}

// Export cache management functions for testing/debugging
export function clearQueryCache() {
  queryCache.clear();
  console.log("[QueryCache] All query cache entries cleared");
}

export function getQueryCacheSize(): number {
  return queryCache.size;
}

export const ExecuteSQLWithRepair = tool({
  description:
    "Execute SQL with up to two auto-repair attempts (missing/ambiguous columns, timeout).",
  inputSchema: z.object({
    sql: z.string().min(1),
    plan: z.any(), // expect FinalizedPlan
    timeoutMs: z.number().int().positive().max(120_000).default(20_000),
    attempts: z.number().int().min(1).max(5).default(3),
    enforceLimit: z.boolean().default(true),
    queryTag: z.string().optional(),
  }),
  execute: async ({
    sql,
    plan,
    timeoutMs = 20000,
    attempts = 3,
    enforceLimit = true,
    queryTag,
  }) => {
    console.log("[ExecuteSQLWithRepair] Starting execution...");
    console.log(sql);

    // Clean expired cache entries periodically
    cleanExpiredCache();

    // Check if we have a cached result for this exact SQL
    const cacheKey = sql;
    if (queryCache.has(cacheKey)) {
      const cached = queryCache.get(cacheKey)!;
      const age = Date.now() - cached.cachedAt;

      // Return cached result if still fresh
      if (age < CACHE_MAX_AGE_MS) {
        console.log(`[ExecuteSQLWithRepair] Cache hit! Age: ${Math.round(age/1000)}s`);
        return {
          rows: cached.rows,
          columns: cached.columns,
          lastQueryId: cached.lastQueryId,
          attemptedSql: sql,
          repaired: false,
          repairReason: null,
          fromCache: true,
        };
      } else {
        // Remove stale entry
        queryCache.delete(cacheKey);
        console.log("[ExecuteSQLWithRepair] Cache entry expired, removing");
      }
    }

    const p = plan as FinalizedPlan;
    const pool = getSnowflakePool();
    const entityLoader = async (name: string) =>
      (await loadEntityYaml(name)).entity;

    const tryExec = async (candidateSql: string) => {
      return execWithRetry(pool, candidateSql, {
        timeoutMs,
        attempts,
        enforceLimit,
        queryTag,
        rowLimit: 1001,
      });
    };

    // Attempt #0: original SQL
    try {
      console.log("[ExecuteSQLWithRepair] Attempting original SQL...");
      const res = await tryExec(sql);
      console.log(
        "[ExecuteSQLWithRepair] Success! Rows returned:",
        res.rows.length
      );

      // Cache the successful result under the original SQL
      queryCache.set(cacheKey, {
        rows: res.rows,
        columns: res.columns,
        lastQueryId: res.lastQueryId,
        cachedAt: Date.now(),
      });
      console.log("[ExecuteSQLWithRepair] Result cached for future use");

      return { ...res, attemptedSql: sql, repaired: false, repairReason: null };
    } catch (err0: any) {
      console.error(
        "[ExecuteSQLWithRepair] Original SQL failed:",
        err0.message
      );
      // Attempt #1: repair
      const r1 = await attemptRepair(sql, p, entityLoader, err0);
      if (!r1?.fixedSql) {
        // no repair possible
        return {
          ok: false,
          error: String(err0?.message ?? err0),
          attemptedSql: sql,
          repaired: false,
        };
      }
      try {
        const res1 = await tryExec(r1.fixedSql);

        // Cache the successful result under the ORIGINAL SQL
        // So future identical queries skip execution entirely
        queryCache.set(cacheKey, {
          rows: res1.rows,
          columns: res1.columns,
          lastQueryId: res1.lastQueryId,
          cachedAt: Date.now(),
        });
        console.log("[ExecuteSQLWithRepair] Repaired result cached under original SQL");

        return {
          ...res1,
          attemptedSql: r1.fixedSql,
          repaired: true,
          repairReason: r1.reason,
        };
      } catch (err1: any) {
        // Attempt #2: repair again (on the second error)
        const r2 = await attemptRepair(r1.fixedSql, p, entityLoader, err1);
        if (!r2?.fixedSql) {
          return {
            ok: false,
            error: String(err1?.message ?? err1),
            attemptedSql: r1.fixedSql,
            repaired: true,
            repairReason: r1.reason,
          };
        }
        try {
          const res2 = await tryExec(r2.fixedSql);

          // Cache the successful result under the ORIGINAL SQL
          queryCache.set(cacheKey, {
            rows: res2.rows,
            columns: res2.columns,
            lastQueryId: res2.lastQueryId,
            cachedAt: Date.now(),
          });
          console.log("[ExecuteSQLWithRepair] Second repair result cached under original SQL");

          return {
            ...res2,
            attemptedSql: r2.fixedSql,
            repaired: true,
            repairReason: r2.reason,
          };
        } catch (err2: any) {
          return {
            ok: false,
            error: String(err2?.message ?? err2),
            attemptedSql: r2.fixedSql,
            repaired: true,
            repairReason: r2.reason,
          };
        }
      }
    }
  },
});
