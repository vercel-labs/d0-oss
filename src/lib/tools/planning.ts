// Planning tools for the AI-SDK v5 agent

import { tool } from "ai";
import { z } from "zod";
import {
  loadCatalog,
  loadEntityYaml,
  ListEntities,
  ReadEntityYaml,
} from "@/lib/semantic/io";
import { finalizePlanSchema } from "@/lib/planning/types";

// --- Tool: ListEntities ---
export const ListEntitiesYaml = tool({
  description:
    "List all available entity YAML files in the semantic/entities directory.",
  inputSchema: z.object({}),
  execute: async () => {
    const entities = await ListEntities();
    return { entities };
  },
});

// --- Tool: ReadEntityYaml ---
export const ReadEntityYamlRaw = tool({
  description: "Read the raw YAML content of an entity file by name.",
  inputSchema: z.object({
    name: z
      .string()
      .min(1)
      .describe("The name of the entity file (without .yml extension)"),
  }),
  execute: async ({ name }) => {
    const yaml = await ReadEntityYaml(name);
    return { name, yaml };
  },
});

// --- Tool: LoadCatalog ---
export const LoadCatalog = tool({
  description: "Load semantic/catalog.yml: returns raw YAML and catalog cards.",
  inputSchema: z.object({}),
  execute: async () => {
    const { yaml, entities, catalog } = await loadCatalog();
    return { yaml, entities, catalog };
  },
});

// --- Tool: LoadEntityYaml ---
export const LoadEntityYaml = tool({
  description:
    "Load a semantic entity YAML by name, returning raw YAML and normalized JSON.",
  inputSchema: z.object({
    name: z.string().min(1),
  }),
  execute: async ({ name }) => {
    const result = await loadEntityYaml(name);
    // Trim long descriptions to keep tokens light
    const { entity } = result;

    // Create a trimmed version without the Map objects (not serializable)
    const trimmed = {
      name: entity.name,
      table: entity.table,
      grain: entity.grain,
      description: entity.description?.slice(0, 400),
      dimensions: entity.dimensions.map((d) => ({
        ...d,
        description: d.description?.slice(0, 200),
      })),
      time_dimensions: entity.time_dimensions,
      measures: entity.measures.map((m) => ({
        ...m,
        description: m.description?.slice(0, 200),
      })),
      metrics: entity.metrics.map((m) => ({
        ...m,
        description: m.description?.slice(0, 200),
      })),
      joins: entity.joins,
      common_filters: entity.common_filters,
      // Include alias information but as arrays/objects, not Maps
      _aliasCount: entity._aliasIndex.size,
      _dimensionCount: entity.dimensions.length,
      _measureCount: entity.measures.length,
      _metricCount: entity.metrics.length,
    };

    return { name: result.name, yaml: result.yaml, entity: trimmed };
  },
});

// --- Tool: AssessEntityCoverage (collector) ---
export const AssessEntityCoverage = tool({
  description:
    "Record if an entity fully/partially/not answers the question & why.",
  inputSchema: z.object({
    name: z.string().min(1),
    coverage: z.enum(["complete", "partial", "none"]),
    neededFields: z.array(z.string()).optional(),
    reasons: z.array(z.string()).default([]),
  }),
  execute: async (payload) => payload,
});

// --- Tool: FinalizePlan (collector) ---
export const FinalizePlan = tool({
  description: "Finalize planning with structured plan payload for Building.",
  inputSchema: finalizePlanSchema,
  execute: async (payload) => {
    // Validate the payload
    const validated = finalizePlanSchema.parse(payload);

    // Additional validation: ensure at least 1, max 3 entities
    if (validated.selectedEntities.length < 1) {
      throw new Error("At least 1 entity must be selected");
    }
    if (validated.selectedEntities.length > 3) {
      throw new Error("Maximum 3 entities can be selected");
    }

    return validated;
  },
});

// --- Tool: FinalizeNoData ---
export const FinalizeNoData = tool({
  description:
    "Finalize an answer without querying data (for out-of-scope or direct responses).",
  inputSchema: z.object({
    message: z
      .string()
      .min(1)
      .describe(
        "The response message to the user when no data query is performed"
      ),
  }),
  outputSchema: z.object({
    message: z.string(),
  }),
  execute: async ({ message }) => {
    // Directly return the message; it will be delivered to the user as the final answer
    return { message };
  },
});

// --- Tool: ClarifyIntent ---
export const ClarifyIntent = tool({
  description:
    "Ask the user a single clarifying question when the query intent is ambiguous.",
  inputSchema: z.object({
    question: z
      .string()
      .min(1)
      .describe("The clarification question to ask the user"),
  }),
  outputSchema: z.object({
    question: z.string(),
  }),
  execute: async ({ question }) => {
    // Return the question; the agent will output this to the user and pause for an answer
    return { question };
  },
});

// --- Tool: SearchCatalog ---
export const SearchCatalog = tool({
  description:
    "Search the semantic catalog for entities related to the user's query.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe(
        "The user's query or keywords to match against entity names and descriptions"
      ),
  }),
  outputSchema: z.object({
    candidates: z.array(
      z.object({
        entity: z.string(),
        description: z.string().optional(),
        score: z.number().optional(),
      })
    ),
  }),
  execute: async ({ query }) => {
    const { catalog } = await loadCatalog();
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2); // Skip very short words
    const candidates: {
      entity: string;
      description?: string;
      score: number;
    }[] = [];

    for (const card of catalog.entities) {
      const name = card.name.toLowerCase();
      const desc = (card.description || "").toLowerCase();
      const exampleQuestions = card.example_questions || [];

      let score = 0;

      // Check each search term
      for (const term of terms) {
        // Name matches are weighted highest
        if (name.includes(term)) score += 3;

        // Description matches
        if (desc.includes(term)) score += 2;

        // Example questions matches (if available)
        for (const question of exampleQuestions) {
          if (question.toLowerCase().includes(term)) {
            score += 1;
            break; // Only count once per term
          }
        }
      }

      // Also check if the full query appears in description or examples
      const fullQuery = query.toLowerCase();
      if (desc.includes(fullQuery)) score += 2;
      for (const question of exampleQuestions) {
        if (question.toLowerCase().includes(fullQuery)) {
          score += 1;
          break;
        }
      }

      if (score > 0) {
        candidates.push({
          entity: card.name,
          description: card.description?.slice(0, 150), // Truncate long descriptions
          score,
        });
      }
    }

    // Sort candidates by score descending
    candidates.sort((a, b) => b.score - a.score);

    // Limit to top 5 results to avoid overloading context
    const topCandidates = candidates.slice(0, 5).map((c) => ({
      entity: c.entity,
      description: c.description,
      score: c.score,
    }));

    return { candidates: topCandidates };
  },
});

// --- Tool: LoadEntitiesBulk ---
export const LoadEntitiesBulk = tool({
  description:
    "Load multiple semantic entity YAMLs by names in one call for efficiency.",
  inputSchema: z.object({
    names: z.array(z.string().min(1)).describe("List of entity names to load"),
  }),
  outputSchema: z.object({
    entities: z.record(z.string(), z.any()), // mapping name->parsed entity JSON or error
  }),
  execute: async ({ names }) => {
    const result: Record<string, any> = {};
    console.log(`[LoadEntitiesBulk] Loading ${names.length} entities...`);

    for (const name of names) {
      try {
        const { entity } = await loadEntityYaml(name);
        result[name] = entity;
      } catch (err) {
        // If entity not found or error, include error info
        result[name] = {
          error: err instanceof Error ? err.message : String(err),
        };
        console.log(
          `[LoadEntitiesBulk] Failed to load "${name}": ${result[name].error}`
        );
      }
    }

    const successCount = Object.values(result).filter((e) => !e.error).length;
    console.log(
      `[LoadEntitiesBulk] Successfully loaded ${successCount}/${names.length} entities`
    );

    return { entities: result };
  },
});

// --- Tool: SearchSchema ---
export const SearchSchema = tool({
  description:
    "Search all entities and fields in the semantic layer for a given keyword.",
  inputSchema: z.object({
    keyword: z
      .string()
      .min(1)
      .describe("The term or field name to search for in the schema"),
  }),
  outputSchema: z.object({
    matches: z.array(
      z.object({
        entity: z.string(),
        field: z.string().optional(),
        context: z.string().optional(),
      })
    ),
  }),
  execute: async ({ keyword }) => {
    const term = keyword.toLowerCase();
    const matches: { entity: string; field?: string; context?: string }[] = [];
    const entities = await ListEntities();

    for (const name of entities) {
      const yamlText = await ReadEntityYaml(name);

      if (yamlText.toLowerCase().includes(term)) {
        // Basic approach: if term appears anywhere in the YAML text, report it
        const entityMatch: {
          entity: string;
          field?: string;
          context?: string;
        } = { entity: name };

        // Try to find a bit of context around the term
        const lines = yamlText.split("\n");
        const matchingLine = lines.find((l) => l.toLowerCase().includes(term));

        if (matchingLine) {
          // Provide context - truncate if too long
          entityMatch.context = matchingLine.trim().slice(0, 100);

          // Try to extract field name if this looks like a field definition
          // Patterns to match: "- name: fieldname" or "fieldname:" or "sql: fieldname"
          const fieldPatterns = [
            /^\s*-?\s*name:\s*([A-Za-z0-9_]+)/, // dimension/measure name
            /^\s*([A-Za-z0-9_]+):/, // direct field name
            /^\s*sql:\s*.*\b([A-Za-z0-9_]*keyword[A-Za-z0-9_]*)\b/i, // SQL containing the term
          ];

          for (const pattern of fieldPatterns) {
            const fieldMatch = matchingLine.match(pattern);
            if (fieldMatch) {
              entityMatch.field = fieldMatch[1];
              break;
            }
          }
        }

        matches.push(entityMatch);
      }
    }

    return { matches };
  },
});

// --- Tool: ScanEntityProperties ---
// Selective field loading to reduce context size
export const ScanEntityProperties = tool({
  description:
    "Load specific fields from an entity's schema to avoid loading the full entity. Useful for large entities when you only need a few fields.",
  inputSchema: z.object({
    entity: z.string().min(1).describe("The entity name to scan"),
    fields: z
      .array(z.string().min(1))
      .describe(
        "List of field names (dimensions, measures, or metrics) to retrieve"
      ),
  }),
  outputSchema: z.object({
    entity: z.string(),
    table: z.string().optional(),
    properties: z.record(z.string(), z.any()),
    dependencies: z.record(z.string(), z.array(z.string())).optional(),
  }),
  execute: async ({ entity, fields }) => {
    console.log(
      `[ScanEntityProperties] Loading ${fields.length} fields from ${entity}`
    );

    // Load the entity (will use cache if available)
    const { entity: entityData } = await loadEntityYaml(entity);

    const properties: Record<string, any> = {};
    const dependencies: Record<string, string[]> = {};

    // Helper to extract field references from SQL expressions
    const extractFieldRefs = (sql: string): string[] => {
      const refs: string[] = [];
      // Simple regex to find potential field references
      // This matches words that might be column names (not SQL keywords)
      const fieldPattern = /\b([a-z_][a-z0-9_]*)\b/gi;
      const sqlKeywords = new Set([
        "select",
        "from",
        "where",
        "group",
        "by",
        "order",
        "having",
        "sum",
        "count",
        "avg",
        "min",
        "max",
        "case",
        "when",
        "then",
        "else",
        "end",
        "and",
        "or",
        "not",
        "null",
        "as",
        "distinct",
      ]);

      const matches = sql.matchAll(fieldPattern);
      for (const match of matches) {
        const field = match[1].toLowerCase();
        if (!sqlKeywords.has(field) && !refs.includes(field)) {
          refs.push(field);
        }
      }
      return refs;
    };

    // Process requested fields
    for (const fieldName of fields) {
      let found = false;

      // Check dimensions
      const dim = entityData.dimensions?.find((d) => d.name === fieldName);
      if (dim) {
        properties[fieldName] = {
          ...dim,
          fieldType: "dimension",
        };
        // Dimensions usually don't have dependencies, but check SQL
        if (dim.sql) {
          const deps = extractFieldRefs(dim.sql);
          if (deps.length > 0) {
            dependencies[fieldName] = deps;
          }
        }
        found = true;
      }

      // Check time_dimensions
      if (!found) {
        const timeDim = entityData.time_dimensions?.find(
          (t) => t.name === fieldName
        );
        if (timeDim) {
          properties[fieldName] = {
            ...timeDim,
            fieldType: "time_dimension",
          };
          found = true;
        }
      }

      // Check measures
      if (!found) {
        const measure = entityData.measures?.find((m) => m.name === fieldName);
        if (measure) {
          properties[fieldName] = {
            ...measure,
            fieldType: "measure",
          };
          // Extract dependencies from measure SQL/formula
          if (measure.sql) {
            const deps = extractFieldRefs(measure.sql);
            if (deps.length > 0) {
              dependencies[fieldName] = deps;
              // Auto-include dependent fields if they're in same entity
              for (const dep of deps) {
                if (!properties[dep] && !fields.includes(dep)) {
                  // Try to find and include the dependency
                  const depDim = entityData.dimensions?.find(
                    (d) => d.name === dep
                  );
                  if (depDim) {
                    properties[dep] = {
                      ...depDim,
                      fieldType: "dimension",
                      addedAsDependency: true,
                    };
                  }
                }
              }
            }
          }
          found = true;
        }
      }

      // Check metrics
      if (!found) {
        const metric = entityData.metrics?.find((m) => m.name === fieldName);
        if (metric) {
          properties[fieldName] = {
            ...metric,
            fieldType: "metric",
          };
          // For atomic metrics, check source measure
          if (metric.type === "atomic" && metric.source?.measure) {
            const sourceMeasure = metric.source.measure;
            if (!dependencies[fieldName]) {
              dependencies[fieldName] = [];
            }
            dependencies[fieldName].push(sourceMeasure);

            // Auto-include the source measure if not already requested
            if (!properties[sourceMeasure] && !fields.includes(sourceMeasure)) {
              const measure = entityData.measures?.find(
                (m) => m.name === sourceMeasure
              );
              if (measure) {
                properties[sourceMeasure] = {
                  ...measure,
                  fieldType: "measure",
                  addedAsDependency: true,
                };
              }
            }
          }
          found = true;
        }
      }

      // Mark if field wasn't found
      if (!found) {
        properties[fieldName] = {
          fieldType: "not_found",
          error: `Field '${fieldName}' not found in entity '${entity}'`,
        };
      }
    }

    console.log(
      `[ScanEntityProperties] Retrieved ${
        Object.keys(properties).length
      } properties (including dependencies)`
    );

    return {
      entity,
      table: entityData.table,
      properties,
      dependencies:
        Object.keys(dependencies).length > 0 ? dependencies : undefined,
    };
  },
});
