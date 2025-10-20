// Core TypeScript types for the semantic layer

export type ScalarType = 'string' | 'number' | 'boolean' | 'time';

export interface CatalogCard {
  name: string;
  grain: string;
  num_rows: number;
  domain?: string;
  description?: string;
  fields?: string[];
  example_questions?: string[];
  use_cases?: string;
  owners?: string[];
  tags?: string[];
}

export interface Catalog {
  version: number;
  entities: CatalogCard[];
}

export interface DimensionRaw {
  name: string;
  sql: string;
  type: ScalarType;
  title?: string;
  description?: string;
  primary_key?: boolean;
  public?: boolean;
  fill_rate?: number; // 0..100
  aliases?: string[];
  extremes?: {
    max_value?: number;
    min_value?: number;
  };
}

export interface TimeDimensionRaw {
  name: string;
  sql: string;
  type: 'time';
  title?: string;
  description?: string;
}

export interface MeasureRaw {
  name: string;
  title?: string;
  description?: string;
  type: 'count' | 'count_distinct' | 'sum' | 'avg' | 'min' | 'max';
  sql?: string;
  filters?: { sql: string }[];
}

export interface MetricFilterRaw {
  field: string;
  operator: 'in' | 'not_in' | '=' | '!=' | '>' | '>=' | '<' | '<=';
  values: any[];
}

export interface MetricRaw {
  name: string;
  label?: string;
  description?: string;
  type: 'atomic' | 'derived';
  source?: {
    measure: string;
    anchor_date: string; // name of a time dimension
    filters?: MetricFilterRaw[];
  };
  periods?: Array<'day' | 'week' | 'month' | 'quarter' | 'year'>;
  units?: {
    unit: string;
    unit_type: 'count' | 'ratio' | 'currency';
    rounding?: number;
  };
  aliases?: string[];
}

export interface JoinRaw {
  target_entity: string;
  relationship: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';
  join_columns: {
    from: string;
    to: string;
  };
}

export interface CommonFilterRaw {
  name: string;
  description?: string;
  sql: string;
}

export interface EntityYamlRaw {
  name: string;
  table: string;
  grain: string;
  description?: string;
  aliases?: Record<string, string[]>; // optional entity-level alias map
  dimensions?: DimensionRaw[];
  time_dimensions?: TimeDimensionRaw[];
  measures?: MeasureRaw[];
  metrics?: MetricRaw[];
  joins?: JoinRaw[];
  common_filters?: CommonFilterRaw[];
}

// Normalized types used by tools
export interface EntityJson {
  name: string;
  table: string;
  grain: string;
  description?: string;

  // Resolved arrays (never undefined, possibly empty)
  dimensions: DimensionRaw[];
  time_dimensions: TimeDimensionRaw[];
  measures: MeasureRaw[];
  metrics: MetricRaw[];
  joins: JoinRaw[];
  common_filters: CommonFilterRaw[];

  // Fast lookup maps for later
  _dimIndex: Map<string, DimensionRaw>;
  _measureIndex: Map<string, MeasureRaw>;
  _metricIndex: Map<string, MetricRaw>;
  _aliasIndex: Map<string, string[]>; // field/metric name -> aliases[]
  _reverseAliasIndex: Map<string, string>; // alias -> canonical name
}