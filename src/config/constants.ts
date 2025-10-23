/**
 * Operational constants for the oss-data-analyst API
 * These are derived from config but exposed as constants for convenience
 */

// Default values (used in schema.ts)
export const DEFAULT_PORT = 3001;
export const DEFAULT_HOST = "0.0.0.0";
export const DEFAULT_WEB_URL = "http://localhost:3000";
export const DEFAULT_TABLE_CHUNK_SIZE = 500;
export const DEFAULT_MAX_TOOL_ROUNDTRIPS = 20;
export const DEFAULT_RATE_LIMIT_MAX = 100;
export const DEFAULT_RATE_LIMIT_WINDOW = "1 minute";

// Cache settings
export const JSON_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
