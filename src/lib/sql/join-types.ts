// Types for join path computation and SQL building

export interface JoinEdge {
  from: string; // entity name
  to: string; // entity name
  fromField: string; // local dimension name
  toField: string; // remote dimension name
  relationship: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';
}

export interface JoinPathResult {
  // The minimal edges to connect all requested entities
  edges: JoinEdge[];
  // Deterministic alias map for entities used in edges + base
  aliasByEntity: Map<string, string>;
  // Ordered list of entities for stable rendering (base first)
  orderedEntities: string[];
}