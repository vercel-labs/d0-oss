// lib/execute/repair.ts

import type { FinalizedPlan } from "@/lib/planning/types";
import type { EntityJson, DimensionRaw } from "@/lib/semantic/types";
import { computeJoinPath } from "@/lib/sql/joins";
import { isColumnNotFound, isAmbiguousColumn, isTimeout } from "./errors";

function normalize(s: string) {
  return s.replace(/["`]/g, "").trim().toLowerCase();
}

function levenshtein(a: string, b: string): number {
  // small, dependency-free edit distance for fuzzy match
  const m = a.length,
    n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function bestColumnMatch(
  target: string,
  registry: Map<string, EntityJson>
): { entity: string; field: string } | null {
  // Search across dimensions of selected entities + aliases
  const needle = normalize(target);
  let best: { entity: string; field: string; score: number } | null = null;

  for (const [ename, ent] of registry) {
    // Check dimensions
    for (const d of ent.dimensions) {
      const candidates = [d.name, ...(d.aliases ?? [])];
      for (const c of candidates) {
        const score = levenshtein(needle, normalize(c));
        if (!best || score < best.score)
          best = { entity: ename, field: d.name, score };
      }
    }
    // Also check time dimensions
    for (const td of ent.time_dimensions ?? []) {
      const score = levenshtein(needle, normalize(td.name));
      if (!best || score < best.score)
        best = { entity: ename, field: td.name, score };
    }
  }
  // Accept match only if reasonably close (edit distance <= 3 or 30% of length)
  if (
    best &&
    (best.score <= 3 || best.score <= Math.ceil(needle.length * 0.3))
  ) {
    return { entity: best.entity, field: best.field };
  }
  return null;
}

function qualifyIdentifier(
  sql: string,
  ident: string,
  qualified: string
): string {
  // Replace unqualified ident occurrences with qualified alias."ident"
  // Use word boundaries; avoid replacing inside strings by crude heuristic (skip between quotes)
  const pattern = new RegExp(`\\b${ident}\\b`, "g");
  let out = "";
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && (i === 0 || sql[i - 1] !== "\\")) inString = !inString;
    if (!inString) {
      // try to match at i
      const slice = sql.slice(i);
      const m = slice.match(pattern);
      if (m && m.index === 0) {
        out += qualified;
        i += ident.length - 1;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

function dropOrderBy(sql: string): string {
  // Remove trailing ORDER BY ... (simple heuristic)
  return sql.replace(/\border\s+by\b[\s\S]*?($|\nlimit\s+\d+)/i, "$1").trim();
}

export function buildRegistryFromPlan(
  plan: FinalizedPlan,
  entityLoader: (name: string) => Promise<EntityJson>
) {
  return (async () => {
    const registry = new Map<string, EntityJson>();
    const needed = new Set<string>(plan.selectedEntities);
    plan?.joinGraph?.forEach((e) => {
      needed.add(e.from);
      needed.add(e.to);
    });
    for (const e of needed) {
      registry.set(e, await entityLoader(e));
    }
    return registry;
  })();
}

export async function attemptRepair(
  sql: string,
  plan: FinalizedPlan,
  entityLoader: (name: string) => Promise<EntityJson>,
  err: any
): Promise<{ fixedSql?: string; reason: string } | null> {
  const cnf = isColumnNotFound(err);
  const amb = isAmbiguousColumn(err);
  const to = isTimeout(err);

  const registry = await buildRegistryFromPlan(plan, entityLoader);
  const base = plan.selectedEntities[0];
  const jp = computeJoinPath(base, plan.selectedEntities, registry);
  if (cnf && cnf.missingColumns.length > 0) {
    // Strategy: for each missing column, try to qualify or substitute best match
    let fixed = sql;
    let any = false;

    for (const miss of cnf.missingColumns) {
      const qual = (() => {
        // If miss is like e.col, split; else try best match
        if (miss.includes(".")) {
          const [e, col] = miss.split(".");
          const alias = jp.aliasByEntity.get(e);
          if (alias) return `${alias}."${col}"`;
        }
        const best = bestColumnMatch(miss, registry);
        if (!best) return null;
        const alias = jp.aliasByEntity.get(best.entity);
        if (!alias) return null;
        return `${alias}."${best.field}"`;
      })();

      if (qual) {
        fixed = qualifyIdentifier(fixed, miss.replace(/["`]/g, ""), qual);
        any = true;
      }
    }

    if (any && fixed !== sql) {
      return {
        fixedSql: fixed,
        reason:
          "Qualified/substituted missing columns using selected entities only.",
      };
    }
  }

  if (amb && amb.columns.length > 0) {
    // Strategy: qualify ambiguous columns using the entity that actually owns them
    let fixed = sql;
    let any = false;

    for (const col of amb.columns) {
      // Find which entity uniquely owns this column (by canonical or alias)
      const owners: { entity: string; dim: DimensionRaw }[] = [];
      for (const [e, ent] of registry) {
        const dim =
          ent._dimIndex.get(col) ||
          (ent._reverseAliasIndex.has(col)
            ? ent._dimIndex.get(ent._reverseAliasIndex.get(col)!)
            : undefined);
        if (dim) owners.push({ entity: e, dim });
      }
      if (owners.length === 1) {
        const alias = jp.aliasByEntity.get(owners[0].entity)!;
        const qualified = `${alias}."${owners[0].dim.name}"`;
        fixed = qualifyIdentifier(fixed, col, qualified);
        any = true;
      }
    }

    if (any && fixed !== sql) {
      return {
        fixedSql: fixed,
        reason: "Qualified ambiguous columns with table aliases.",
      };
    }
  }

  if (to) {
    // Strategy: enforce LIMIT; drop ORDER BY
    let fixed = sql;
    if (!/limit\s+\d+/i.test(fixed)) fixed = `${fixed}\nLIMIT 1001`;
    fixed = dropOrderBy(fixed);
    return {
      fixedSql: fixed,
      reason: "Added LIMIT and removed ORDER BY to reduce execution time.",
    };
  }

  return null;
}
