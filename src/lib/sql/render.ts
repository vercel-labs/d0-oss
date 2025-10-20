// SQL rendering logic for converting plans to Snowflake SQL

import type { FinalizedPlan, Intent, JoinEdge as PlanJoinEdge } from '@/lib/planning/types';
import type { EntityJson, MeasureRaw, MetricRaw } from '@/lib/semantic/types';
import { computeJoinPath } from './joins';
import { expandSqlExpression, MacroContext, qualifySimpleColumn } from './macros';

interface Registry extends Map<string, EntityJson> {}

function chooseBaseEntity(plan: FinalizedPlan, registry: Registry): string {
  // Prefer entity that contains at least one measure referenced by metrics
  const metricNames = new Set(plan.intent.metrics.map(m => m.toLowerCase()));
  for (const e of plan.selectedEntities) {
    const ent = registry.get(e)!;
    const measures = ent.measures.map(m => m.name.toLowerCase());
    // If any metric aliases to these measures we'll catch later; here just a heuristic
    if (measures.some(() => metricNames.size > 0)) return e;
  }
  // Fallback: first selected entity
  return plan.selectedEntities[0]!;
}

function aliasMapToObject(m: Map<string, string>) {
  return Object.fromEntries(Array.from(m.entries()));
}

function findMetric(ent: EntityJson, nameOrAlias: string): MetricRaw | null {
  let m = ent._metricIndex.get(nameOrAlias);
  if (m) return m;
  const canonical = ent._reverseAliasIndex.get(nameOrAlias);
  if (canonical) return ent._metricIndex.get(canonical) ?? null;
  return null;
}

function findMeasure(ent: EntityJson, name: string): MeasureRaw | null {
  // No aliases on measures by default (but allowed via entity-level alias map)
  return ent._measureIndex.get(name) ?? null;
}

function buildPredicate(
  filter: { field: string; operator: string; values: any[] },
  ctx: MacroContext
): string {
  // Resolve field to SQL
  const fieldToken = filter.field.includes('.') ? `{${filter.field}}` : `{${filter.field}}`;
  const fieldSql = expandSqlExpression(fieldToken, ctx);
  const op = filter.operator;
  const vs = filter.values;

  const asSqlLiteral = (v: any) => {
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    // simple escape for single quotes
    return `'${String(v).replace(/'/g, "''")}'`;
  };

  if (op === 'in' || op === 'not_in') {
    const list = vs.map(asSqlLiteral).join(', ');
    return `${fieldSql} ${op === 'in' ? 'IN' : 'NOT IN'} (${list})`;
  }

  if (vs.length !== 1) throw new Error(`Operator ${op} expects a single value.`);
  const v = asSqlLiteral(vs[0]);
  if (op === '=' || op === '!=' || op === '>' || op === '>=' || op === '<' || op === '<=') {
    return `${fieldSql} ${op} ${v}`;
  }

  throw new Error(`Unsupported operator: ${op}`);
}

function buildMetricExpr(
  metric: MetricRaw,
  hostEntity: EntityJson,
  ctx: MacroContext
): string {
  if (metric.type !== 'atomic' || !metric.source) {
    throw new Error(
      `Only atomic metrics with a single measure source are supported initially: ${metric.name}`
    );
  }
  const measure = findMeasure(hostEntity, metric.source.measure);
  if (!measure) {
    throw new Error(
      `Measure "${metric.source.measure}" not found in entity "${hostEntity.name}".`
    );
  }

  // Build base aggregation expression for the measure
  const buildAgg = (): string => {
    const sqlExpr = measure.sql
      ? expandSqlExpression(measure.sql, { ...ctx, currentEntity: hostEntity.name })
      : null;

    switch (measure.type) {
      case 'count':
        // Prefer COUNT(*) on host entity
        return `COUNT(*)`;
      case 'count_distinct':
        if (!sqlExpr) {
          throw new Error(`count_distinct requires 'sql' on measure "${measure.name}".`);
        }
        return `COUNT(DISTINCT ${sqlExpr})`;
      case 'sum':
      case 'avg':
      case 'min':
      case 'max':
        if (!sqlExpr) {
          throw new Error(
            `${measure.type.toUpperCase()} requires 'sql' on measure "${measure.name}".`
          );
        }
        return `${measure.type.toUpperCase()}(${sqlExpr})`;
      default:
        throw new Error(`Unsupported measure type: ${(measure as any).type}`);
    }
  };

  let agg = buildAgg();

  // Apply metric-level filters inside the aggregation:
  const filters = metric.source.filters ?? [];
  if (filters.length > 0) {
    // For COUNT(*) with predicates, use COUNT_IF; for others, wrap with IFF
    const preds = filters.map(f => buildPredicate(f as any, ctx));
    const pred = preds.length === 1 ? preds[0] : `(${preds.join(') AND (')})`;

    if (measure.type === 'count') {
      // Snowflake-specific COUNT_IF
      agg = `COUNT_IF(${pred})`;
    } else if (measure.type === 'count_distinct') {
      // IFF(predicate, expr, NULL) inside DISTINCT
      const sqlExpr = expandSqlExpression(measure.sql!, {
        ...ctx,
        currentEntity: hostEntity.name
      });
      agg = `COUNT(DISTINCT IFF(${pred}, ${sqlExpr}, NULL))`;
    } else {
      const sqlExpr = expandSqlExpression(measure.sql!, {
        ...ctx,
        currentEntity: hostEntity.name
      });
      agg = `${measure.type.toUpperCase()}(IFF(${pred}, ${sqlExpr}, NULL))`;
    }
  }

  return agg;
}

function resolveDimensionExpr(
  field: string,
  currentEntityName: string,
  ctx: MacroContext
): string {
  // allow alias or canonical; produce a SQL expression (qualified)
  // Try {field}
  const token = field.includes('.') ? `{${field}}` : `{${field}}`;
  const expr = expandSqlExpression(token, { ...ctx, currentEntity: currentEntityName });
  return expr;
}

export function renderSQLFromPlan(plan: FinalizedPlan, registry: Registry): string {
  // 1) Choose base entity
  const base = plan.selectedEntities[0] ?? chooseBaseEntity(plan, registry);
  if (!base) throw new Error('No base entity selected.');

  // 2) Compute join path
  const required = Array.from(new Set(plan.selectedEntities));
  const jp = computeJoinPath(base, required, registry);

  const ctx: MacroContext = {
    currentEntity: base,
    aliasByEntity: jp.aliasByEntity,
    registry,
  };

  // 3) SELECT list: dimensions + metrics
  const selectCols: string[] = [];

  for (const dim of plan.intent.dimensions ?? []) {
    const expr = resolveDimensionExpr(dim, base, ctx);
    // Create a stable alias label for dimensions (use snake_case name)
    const label = dim.includes('.') ? dim.split('.').slice(-1)[0] : dim;
    selectCols.push(`${expr} AS "${label}"`);
  }

  // Locate a host entity for each metric (prefer base entity first)
  for (const mname of plan.intent.metrics ?? []) {
    let host: EntityJson | null = null;
    let metricObj: MetricRaw | null = null;

    // First try to find the metric
    for (const e of jp.orderedEntities) {
      const ent = registry.get(e)!;
      const metric = findMetric(ent, mname);
      if (metric) {
        host = ent;
        metricObj = metric;
        break;
      }
    }

    // If not found as metric, try as measure
    if (!host || !metricObj) {
      for (const e of jp.orderedEntities) {
        const ent = registry.get(e)!;
        const measure = findMeasure(ent, mname);
        if (measure) {
          host = ent;
          // Create a synthetic metric wrapper
          metricObj = {
            name: `__measure_${mname}`,
            type: 'atomic',
            source: {
              measure: mname,
              anchor_date: ent.time_dimensions[0]?.name ?? 'created_on',
            },
          } as MetricRaw;
          break;
        }
      }
    }

    if (!host || !metricObj) {
      throw new Error(`Metric or measure "${mname}" not found in selected entities.`);
    }

    const expr = buildMetricExpr(metricObj, host, { ...ctx, currentEntity: host.name });
    selectCols.push(`${expr} AS "${mname}"`);
  }

  // 4) FROM + JOINs
  const from = `FROM ${registry.get(base)!.table} ${jp.aliasByEntity.get(base)}`;
  const joins: string[] = [];
  for (const e of jp.edges) {
    // Determine the natural direction (use the edge as recorded)
    const leftAlias = jp.aliasByEntity.get(e.from)!;
    const rightAlias = jp.aliasByEntity.get(e.to)!;
    const leftCol = qualifySimpleColumn(
      `{CUBE}.${e.fromField}`,
      e.from,
      { ...ctx, currentEntity: e.from }
    );
    const rightCol = qualifySimpleColumn(
      `{CUBE}.${e.toField}`,
      e.to,
      { ...ctx, currentEntity: e.to }
    );
    const joinType = e.relationship === 'many_to_many' ? 'INNER JOIN' : 'LEFT JOIN';
    const rightTable = registry.get(e.to)!.table;
    joins.push(`${joinType} ${rightTable} ${rightAlias} ON ${leftCol} = ${rightCol}`);
  }

  // 5) WHERE: time range + structuredFilters
  const where: string[] = [];
  if (plan.intent.timeRange) {
    // use the first time dimension found in the base entity
    const tdim = registry.get(base)!.time_dimensions[0];
    if (!tdim) {
      throw new Error(`No time dimension found in base entity "${base}" to apply time range.`);
    }
    const tExpr = expandSqlExpression(tdim.sql, ctx);
    const { start, end } = plan.intent.timeRange;
    where.push(`${tExpr} >= '${start}' AND ${tExpr} < '${end}'`);
  }

  for (const f of plan.intent.structuredFilters ?? []) {
    const pred = buildPredicate(f as any, ctx);
    where.push(pred);
  }

  // (free-form filters are appended as comments; optional)
  for (const ff of plan.intent.filters ?? []) {
    where.push(`/* user_filter: ${ff.replace(/\*\//g, '* /')} */`);
  }

  // 6) GROUP BY (dimensions only)
  const groupBy: string[] = [];
  // Use ordinal positions for simplicity: 1..N for dimensions
  const dimCount = (plan.intent.dimensions ?? []).length;
  for (let i = 1; i <= dimCount; i++) groupBy.push(String(i));
  const groupByClause = dimCount > 0 ? `GROUP BY ${groupBy.join(', ')}` : '';

  // 7) LIMIT
  const limitClause = `LIMIT 1001`;

  // Build the SQL
  const parts: string[] = ['SELECT'];
  if (selectCols.length > 0) {
    parts.push('  ' + selectCols.join(',\n  '));
  } else {
    parts.push('  1 AS dummy');
  }
  parts.push(from);
  if (joins.length > 0) {
    parts.push(joins.join('\n'));
  }
  if (where.length > 0) {
    parts.push('WHERE ' + where.join('\n  AND '));
  }
  if (groupByClause) {
    parts.push(groupByClause);
  }
  parts.push(limitClause);

  return parts.join('\n');
}