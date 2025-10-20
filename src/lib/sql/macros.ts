// Macro expansion for SQL expressions with cycle detection

import type { EntityJson, DimensionRaw } from '@/lib/semantic/types';

export interface MacroContext {
  currentEntity: string; // entity in whose context this expression lives
  aliasByEntity: Map<string, string>; // from computeJoinPath()
  registry: Map<string, EntityJson>; // entity name -> EntityJson (selected + joined)
}

const CUBE_RE = /^\{CUBE\}\.([A-Za-z0-9_]+)$/;
const SAME_ENTITY_FIELD_RE = /^\{([A-Za-z0-9_]+)\}$/;
const OTHER_ENTITY_FIELD_RE = /^\{([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\}$/;

function resolveCanonicalField(
  entity: EntityJson,
  nameOrAlias: string
): DimensionRaw | null {
  // Try direct dimension name
  let d = entity._dimIndex.get(nameOrAlias);
  if (d) return d;

  // Try time dimension
  const timeDim = entity.time_dimensions.find(td => td.name === nameOrAlias);
  if (timeDim) {
    // Convert TimeDimensionRaw to DimensionRaw-like structure
    return {
      name: timeDim.name,
      sql: timeDim.sql,
      type: 'time',
      title: timeDim.title,
      description: timeDim.description,
    };
  }

  // Try reverse alias
  const canonical = entity._reverseAliasIndex.get(nameOrAlias);
  if (canonical) {
    d = entity._dimIndex.get(canonical);
    if (d) return d;

    // Check time dimensions again with canonical name
    const td = entity.time_dimensions.find(t => t.name === canonical);
    if (td) {
      return {
        name: td.name,
        sql: td.sql,
        type: 'time',
        title: td.title,
        description: td.description,
      };
    }
  }

  return null;
}

// Recursively expand an expression with macros. Prevent cycles via 'stack'.
export function expandSqlExpression(
  expr: string,
  ctx: MacroContext,
  stack: string[] = []
): string {
  // Check for cycles
  if (stack.includes(expr)) {
    throw new Error(`Cyclic macro expansion detected at "${expr}".`);
  }

  // Base case: exact {CUBE}.field
  let m = expr.match(CUBE_RE);
  if (m) {
    const field = m[1]!;
    const ent = ctx.registry.get(ctx.currentEntity);
    if (!ent) {
      throw new Error(`Unknown current entity "${ctx.currentEntity}" in macro expansion.`);
    }
    const dim = resolveCanonicalField(ent, field);
    if (!dim) {
      throw new Error(`Field "${field}" not found in entity "${ent.name}".`);
    }

    // If dim.sql is simple column reference, return qualified column
    const simpleMatch = dim.sql.match(CUBE_RE);
    if (simpleMatch) {
      const alias = ctx.aliasByEntity.get(ctx.currentEntity);
      if (!alias) {
        throw new Error(`Missing alias for current entity "${ctx.currentEntity}".`);
      }
      return `${alias}.${simpleMatch[1]}`;
    }

    // Otherwise expand recursively
    return expandSqlExpression(dim.sql, ctx, stack.concat([`${ent.name}.${field}`]));
  }

  // Base case: exact {field} (same entity)
  m = expr.match(SAME_ENTITY_FIELD_RE);
  if (m) {
    const field = m[1]!;
    const ent = ctx.registry.get(ctx.currentEntity);
    if (!ent) {
      throw new Error(`Unknown current entity "${ctx.currentEntity}" in macro expansion.`);
    }
    const dim = resolveCanonicalField(ent, field);
    if (!dim) {
      throw new Error(`Field "${field}" not found in entity "${ent.name}".`);
    }

    // If dim.sql is simple column reference, return qualified column
    const simpleMatch = dim.sql.match(CUBE_RE);
    if (simpleMatch) {
      const alias = ctx.aliasByEntity.get(ctx.currentEntity);
      if (!alias) {
        throw new Error(`Missing alias for current entity "${ctx.currentEntity}".`);
      }
      return `${alias}.${simpleMatch[1]}`;
    }

    return expandSqlExpression(dim.sql, ctx, stack.concat([`${ent.name}.${field}`]));
  }

  // Base case: exact {entity.field}
  m = expr.match(OTHER_ENTITY_FIELD_RE);
  if (m) {
    const entityName = m[1]!;
    const field = m[2]!;
    const ent = ctx.registry.get(entityName);
    if (!ent) {
      throw new Error(
        `Referenced entity "${entityName}" is not loaded in the current plan.`
      );
    }
    const dim = resolveCanonicalField(ent, field);
    if (!dim) {
      throw new Error(`Field "${field}" not found in entity "${entityName}".`);
    }

    // Expand in the context of the referenced entity
    const alias = ctx.aliasByEntity.get(entityName);
    if (!alias) {
      throw new Error(
        `Entity "${entityName}" has no alias; ensure it is in the join path.`
      );
    }

    // If dim.sql is simple column reference, return qualified column
    const simpleMatch = dim.sql.match(CUBE_RE);
    if (simpleMatch) {
      return `${alias}.${simpleMatch[1]}`;
    }

    // Otherwise expand recursively in the referenced entity's context
    const inner = expandSqlExpression(
      dim.sql,
      { ...ctx, currentEntity: entityName },
      stack.concat([`${entityName}.${field}`])
    );
    return inner;
  }

  // General case: find macro tokens inside a larger expression and replace recursively
  let result = expr;

  // Replace {CUBE}.field patterns
  result = result.replace(/\{CUBE\}\.([A-Za-z0-9_]+)/g, (match, field) => {
    const ent = ctx.registry.get(ctx.currentEntity);
    if (!ent) {
      throw new Error(`Unknown current entity "${ctx.currentEntity}" in macro expansion.`);
    }
    const dim = resolveCanonicalField(ent, field);
    if (!dim) {
      throw new Error(`Field "${field}" not found in entity "${ent.name}".`);
    }

    // If dim.sql is simple column reference, return qualified column
    const simpleMatch = dim.sql.match(CUBE_RE);
    if (simpleMatch) {
      const alias = ctx.aliasByEntity.get(ctx.currentEntity);
      if (!alias) {
        throw new Error(`Missing alias for current entity "${ctx.currentEntity}".`);
      }
      return `${alias}.${simpleMatch[1]}`;
    }

    // Otherwise expand recursively
    return expandSqlExpression(
      dim.sql,
      ctx,
      stack.concat([`${ent.name}.${field}`])
    );
  });

  // Replace {entity.field} patterns
  result = result.replace(/\{([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\}/g, (match, entityName, field) => {
    const ent = ctx.registry.get(entityName);
    if (!ent) {
      throw new Error(`Referenced entity "${entityName}" not loaded.`);
    }
    const dim = resolveCanonicalField(ent, field);
    if (!dim) {
      throw new Error(`Field "${field}" not found in "${entityName}".`);
    }
    const alias = ctx.aliasByEntity.get(entityName);
    if (!alias) {
      throw new Error(`Missing alias for entity "${entityName}".`);
    }

    // If dim.sql is simple column reference, return qualified column
    const simpleMatch = dim.sql.match(CUBE_RE);
    if (simpleMatch) {
      return `${alias}.${simpleMatch[1]}`;
    }

    // Otherwise expand in the referenced entity's context
    return expandSqlExpression(
      dim.sql,
      { ...ctx, currentEntity: entityName },
      stack.concat([`${entityName}.${field}`])
    );
  });

  // Replace {field} patterns (same entity)
  result = result.replace(/\{([A-Za-z0-9_]+)\}/g, (match, field) => {
    // Skip if this looks like it's part of {entity.field} (already handled)
    if (match.includes('.')) return match;

    const ent = ctx.registry.get(ctx.currentEntity);
    if (!ent) {
      throw new Error(`Unknown current entity "${ctx.currentEntity}" in macro expansion.`);
    }
    const dim = resolveCanonicalField(ent, field);
    if (!dim) {
      // If not a field, might be a literal {CUBE} reference
      if (field === 'CUBE') {
        const alias = ctx.aliasByEntity.get(ctx.currentEntity);
        if (!alias) {
          throw new Error(`Missing alias for current entity "${ctx.currentEntity}".`);
        }
        return alias;
      }
      throw new Error(`Field "${field}" not found in entity "${ent.name}".`);
    }

    // If dim.sql is simple column reference, return qualified column
    const simpleMatch = dim.sql.match(CUBE_RE);
    if (simpleMatch) {
      const alias = ctx.aliasByEntity.get(ctx.currentEntity);
      if (!alias) {
        throw new Error(`Missing alias for current entity "${ctx.currentEntity}".`);
      }
      return `${alias}.${simpleMatch[1]}`;
    }

    return expandSqlExpression(
      dim.sql,
      ctx,
      stack.concat([`${ent.name}.${field}`])
    );
  });

  return result;
}

export function qualifySimpleColumn(
  expr: string,
  entityName: string,
  ctx: MacroContext
): string {
  // If expr is exactly {CUBE}.col or {entity.col}, expand to alias."col"
  const m1 = expr.match(CUBE_RE);
  if (m1) {
    const col = m1[1]!;
    const alias = ctx.aliasByEntity.get(entityName);
    if (!alias) {
      throw new Error(`Missing alias for entity "${entityName}".`);
    }
    return `${alias}."${col}"`;
  }

  const m2 = expr.match(OTHER_ENTITY_FIELD_RE);
  if (m2) {
    const e = m2[1]!;
    const col = m2[2]!;
    const alias = ctx.aliasByEntity.get(e);
    if (!alias) {
      throw new Error(`Missing alias for entity "${e}".`);
    }
    return `${alias}."${col}"`;
  }

  return expr; // leave complex expressions to expandSqlExpression
}