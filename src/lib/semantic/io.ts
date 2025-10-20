// I/O functions for loading and validating semantic layer YAML files
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { catalogSchema, entityYamlSchema } from "./schemas";
import type {
  Catalog,
  CatalogCard,
  EntityYamlRaw,
  EntityJson,
  DimensionRaw,
  MeasureRaw,
} from "./types";

const ROOT = process.cwd() + "/src";
const SEMANTIC_DIR = path.join(ROOT, "semantic");
const ENTITIES_DIR = path.join(SEMANTIC_DIR, "entities");

// Cache for parsed entity JSON objects to avoid redundant file I/O
const entityCache = new Map<string, { yaml: string; entity: EntityJson }>();

// Cache for the catalog
let catalogCache: { yaml: string; entities: CatalogCard[]; catalog: Catalog } | null = null;

function ensureArray<T>(v: T[] | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

export async function loadCatalog(): Promise<{
  yaml: string;
  entities: CatalogCard[];
  catalog: Catalog;
}> {
  // Return from cache if available
  if (catalogCache) {
    console.log("[Cache] Returning catalog from cache");
    return catalogCache;
  }

  const fp = path.join(SEMANTIC_DIR, "catalog.yml");
  let raw: string;
  try {
    raw = await fs.readFile(fp, "utf8");
  } catch {
    throw new Error(`Missing catalog file at ${fp}`);
  }

  let doc: any;
  try {
    doc = yaml.load(raw);
  } catch (e: any) {
    throw new Error(`YAML parse error for catalog.yml: ${e.message}`);
  }

  const parsed = catalogSchema.safeParse(doc);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")} — ${i.message}`)
      .join("; ");
    throw new Error(`catalog.yml failed validation: ${issues}`);
  }

  const catalog = parsed.data as Catalog;
  const result = { yaml: raw, entities: catalog.entities, catalog };

  // Cache the result
  catalogCache = result;
  console.log("[Cache] Catalog loaded and cached");

  return result;
}

function buildAliasIndexes(entity: EntityYamlRaw) {
  const aliasIndex = new Map<string, string[]>();
  const reverseAliasIndex = new Map<string, string>();

  // Entity-level aliases (rare; prefer field-level)
  if (entity.aliases) {
    for (const [canonical, arr] of Object.entries(entity.aliases)) {
      aliasIndex.set(canonical, arr);
      for (const alias of arr) {
        reverseAliasIndex.set(alias, canonical);
      }
    }
  }

  const addAliases = (canonical: string, aliases?: string[]) => {
    if (!aliases || aliases.length === 0) return;
    const prev = aliasIndex.get(canonical) ?? [];
    aliasIndex.set(canonical, [...prev, ...aliases]);
    for (const a of aliases) {
      reverseAliasIndex.set(a, canonical);
    }
  };

  // Add dimension aliases
  for (const d of ensureArray(entity.dimensions)) {
    addAliases(d.name, d.aliases);
  }

  // Add measure aliases (rare but possible)
  for (const m of ensureArray(entity.measures)) {
    addAliases(m.name, (m as any).aliases);
  }

  // Add metric aliases
  for (const m of ensureArray(entity.metrics)) {
    addAliases(m.name, m.aliases);
  }

  return { aliasIndex, reverseAliasIndex };
}

function indexByName<T extends { name: string }>(arr: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const x of arr) {
    m.set(x.name, x);
  }
  return m;
}

function validateJoins(
  entity: EntityYamlRaw,
  dimIndex: Map<string, DimensionRaw>
): void {
  for (const j of entity.joins ?? []) {
    if (!dimIndex.has(j.join_columns.from)) {
      throw new Error(
        `Entity "${entity.name}" join invalid: local dimension "${j.join_columns.from}" not found.`
      );
    }
    // Target entity's "to" will be validated later when both entities are loaded during planning
  }
}

function validateMetricSources(
  entity: EntityYamlRaw,
  measureIndex: Map<string, MeasureRaw>,
  timeDimNames: Set<string>
): void {
  for (const met of entity.metrics ?? []) {
    if (met.type === "atomic") {
      if (!met.source) {
        throw new Error(
          `Metric "${met.name}" in entity "${entity.name}" must have a source.`
        );
      }
      if (!measureIndex.has(met.source.measure)) {
        throw new Error(
          `Metric "${met.name}" references unknown measure "${met.source.measure}".`
        );
      }
      if (!timeDimNames.has(met.source.anchor_date)) {
        throw new Error(
          `Metric "${met.name}" anchor_date "${met.source.anchor_date}" not a time_dimension.`
        );
      }
      for (const f of met.source.filters ?? []) {
        // Field existence is verified later with cross-entity resolution if needed
        if (!f.field) {
          throw new Error(
            `Metric "${met.name}" has a filter with empty field name.`
          );
        }
      }
    }
  }
}

// Clear cache functions (useful for development/hot-reload)
export function clearEntityCache(name?: string) {
  if (name) {
    entityCache.delete(name);
    console.log(`[Cache] Cleared cache for entity "${name}"`);
  } else {
    entityCache.clear();
    console.log("[Cache] Cleared all entity caches");
  }
}

export function clearCatalogCache() {
  catalogCache = null;
  console.log("[Cache] Cleared catalog cache");
}

export function clearAllCaches() {
  clearEntityCache();
  clearCatalogCache();
  console.log("[Cache] All caches cleared");
}

export async function ListEntities(): Promise<string[]> {
  try {
    const files = await fs.readdir(ENTITIES_DIR);
    return files
      .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
      .map((f) => f.replace(/\.(yml|yaml)$/, ""));
  } catch (error) {
    throw new Error(
      `Failed to list entities in ${ENTITIES_DIR}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function ReadEntityYaml(name: string): Promise<string> {
  const fp = path.join(ENTITIES_DIR, `${name}.yml`);
  try {
    return await fs.readFile(fp, "utf8");
  } catch (error) {
    throw new Error(
      `Failed to read entity file at ${fp}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function loadEntityYaml(
  name: string
): Promise<{ name: string; yaml: string; entity: EntityJson }> {
  // Check cache first
  if (entityCache.has(name)) {
    const cached = entityCache.get(name)!;
    console.log(`[Cache] Returning entity "${name}" from cache`);
    return { name, yaml: cached.yaml, entity: cached.entity };
  }

  const fp = path.join(ENTITIES_DIR, `${name}.yml`);
  let raw: string;
  try {
    raw = await fs.readFile(fp, "utf8");
  } catch {
    throw new Error(`Missing entity file at ${fp}`);
  }

  let doc: any;
  try {
    doc = yaml.load(raw);
  } catch (e: any) {
    throw new Error(`YAML parse error for ${name}.yml: ${e.message}`);
  }

  const parsed = entityYamlSchema.safeParse(doc);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")} — ${i.message}`)
      .join("; ");
    throw new Error(`${name}.yml failed validation: ${issues}`);
  }

  const entityRaw = parsed.data as any as EntityYamlRaw;

  // Build indexes
  const dimensions = entityRaw.dimensions ?? [];
  const measures = entityRaw.measures ?? [];
  const metrics = entityRaw.metrics ?? [];
  const joins = entityRaw.joins ?? [];
  const timeDimensions = entityRaw.time_dimensions ?? [];
  const commonFilters = entityRaw.common_filters ?? [];

  const _dimIndex = indexByName(dimensions);
  const _measureIndex = indexByName(measures);
  const _metricIndex = indexByName(metrics);
  const { aliasIndex, reverseAliasIndex } = buildAliasIndexes(entityRaw);

  // Structural validations that require indexes
  validateJoins(entityRaw, _dimIndex);
  validateMetricSources(
    entityRaw,
    _measureIndex,
    new Set(timeDimensions.map((t) => t.name))
  );

  const entity: EntityJson = {
    name: entityRaw.name,
    table: entityRaw.table,
    grain: entityRaw.grain,
    description: entityRaw.description ?? undefined,
    dimensions,
    time_dimensions: timeDimensions,
    measures,
    metrics,
    joins,
    common_filters: commonFilters,
    _dimIndex,
    _measureIndex,
    _metricIndex,
    _aliasIndex: aliasIndex,
    _reverseAliasIndex: reverseAliasIndex,
  };

  // Cache the parsed entity
  entityCache.set(name, { yaml: raw, entity });
  console.log(`[Cache] Entity "${name}" loaded and cached`);

  return { name, yaml: raw, entity };
}
