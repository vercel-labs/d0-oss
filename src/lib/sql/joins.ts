// Join path computation using shortest path BFS

import type { EntityJson } from "@/lib/semantic/types";
import type { JoinEdge, JoinPathResult } from "./join-types";

interface GraphEdge {
  a: string;
  b: string;
  fromField: string;
  toField: string;
  relationship: JoinEdge["relationship"];
}

function buildGraph(
  entities: Map<string, EntityJson>
): Map<string, GraphEdge[]> {
  const g = new Map<string, GraphEdge[]>();

  for (const [name, entity] of entities) {
    if (!g.has(name)) g.set(name, []);

    for (const j of entity.joins) {
      const edge: GraphEdge = {
        a: name,
        b: j.target_entity,
        fromField: j.join_columns.from,
        toField: j.join_columns.to,
        relationship: j.relationship,
      };

      if (!g.has(j.target_entity)) g.set(j.target_entity, []);
      g.get(name)!.push(edge);

      // Treat as undirected for path search (direction handled later during SQL render)
      g.get(j.target_entity)!.push({
        a: j.target_entity,
        b: name,
        fromField: j.join_columns.to,
        toField: j.join_columns.from,
        relationship: j.relationship,
      });
    }
  }

  return g;
}

function shortestPath(
  g: Map<string, GraphEdge[]>,
  start: string,
  goal: string
): GraphEdge[] | null {
  if (start === goal) return [];

  const q: string[] = [start];
  const prev = new Map<string, { node: string; edge?: GraphEdge }>();
  prev.set(start, { node: start });

  while (q.length) {
    const u = q.shift()!;

    for (const e of g.get(u) ?? []) {
      const v = e.b;

      if (!prev.has(v)) {
        prev.set(v, { node: u, edge: e });

        if (v === goal) {
          // Reconstruct path
          const path: GraphEdge[] = [];
          let cur = v;

          while (cur !== start) {
            const p = prev.get(cur)!;
            path.push(p.edge!);
            cur = p.node;
          }

          return path.reverse();
        }

        q.push(v);
      }
    }
  }

  return null;
}

export function computeJoinPath(
  baseEntity: string,
  requiredEntities: string[],
  registry: Map<string, EntityJson>
): JoinPathResult {
  // Build graph from all registry entities
  const g = buildGraph(registry);
  const edges: GraphEdge[] = [];
  const seenPairs = new Set<string>();

  for (const target of requiredEntities) {
    if (target === baseEntity) continue;

    const p = shortestPath(g, baseEntity, target);
    if (!p) {
      throw new Error(
        `No join path from "${baseEntity}" to "${target}". ` +
          `Make sure Planning loaded all necessary joined entities.`
      );
    }

    for (const e of p) {
      const key = `${e.a}->${e.b}:${e.fromField}=${e.toField}`;
      if (!seenPairs.has(key)) {
        edges.push(e);
        seenPairs.add(key);
      }
    }
  }

  // Build deterministic alias map: base -> t0, others lexical order -> t1...
  const entitySet = new Set<string>([baseEntity]);
  edges.forEach((e) => {
    entitySet.add(e.a);
    entitySet.add(e.b);
  });

  const others = Array.from(entitySet)
    .filter((n) => n !== baseEntity)
    .sort();
  const orderedEntities = [baseEntity, ...others];
  const aliasByEntity = new Map<string, string>();
  orderedEntities.forEach((n, i) => aliasByEntity.set(n, `t${i}`));

  // Convert GraphEdge -> JoinEdge in forward direction (as found by path)
  const finalEdges: JoinEdge[] = edges.map((e) => ({
    from: e.a,
    to: e.b,
    fromField: e.fromField,
    toField: e.toField,
    relationship: e.relationship,
  }));

  return { edges: finalEdges, aliasByEntity, orderedEntities };
}
