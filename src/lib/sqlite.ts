import Database from "better-sqlite3";
import { join } from "path";

let db: Database.Database | null = null;

/**
 * Get or create SQLite database connection
 */
export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = join(process.cwd(), "data", "oss-data-analyst.db");
    console.log(`[SQLite] Connecting to database at: ${dbPath}`);
    db = new Database(dbPath);
    db.pragma("foreign_keys = ON");
  }
  return db;
}

/**
 * Execute SQL query and return results
 */
export interface QueryResult {
  rows: any[];
  columns: string[];
  rowCount: number;
  executionTime: number;
}

export async function executeSQL(sql: string): Promise<QueryResult> {
  const startTime = Date.now();
  console.log(`[SQLite] Executing query: ${sql.substring(0, 100)}...`);

  try {
    const db = getDatabase();

    // Determine if this is a SELECT query or a modification query
    const isSelect = sql.trim().toUpperCase().startsWith("SELECT");

    if (isSelect) {
      const stmt = db.prepare(sql);
      const rows = stmt.all();
      const columns =
        rows.length > 0 && rows[0]
          ? Object.keys(rows[0] as Record<string, unknown>)
          : [];

      const executionTime = Date.now() - startTime;
      console.log(
        `[SQLite] Query completed in ${executionTime}ms, returned ${rows.length} rows`
      );

      return {
        rows,
        columns,
        rowCount: rows.length,
        executionTime,
      };
    } else {
      // For INSERT, UPDATE, DELETE, etc.
      const result = db.prepare(sql).run();
      const executionTime = Date.now() - startTime;

      console.log(
        `[SQLite] Query completed in ${executionTime}ms, affected ${result.changes} rows`
      );

      return {
        rows: [],
        columns: [],
        rowCount: result.changes,
        executionTime,
      };
    }
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    console.error(
      `[SQLite] Query failed after ${executionTime}ms:`,
      error.message
    );
    throw new Error(`SQLite Error: ${error.message}`);
  }
}

/**
 * Get database schema information
 */
export function getSchema(): any[] {
  const db = getDatabase();

  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    )
    .all() as { name: string }[];

  return tables.map((table) => {
    const columns = db.prepare(`PRAGMA table_info(${table.name})`).all();
    const foreignKeys = db
      .prepare(`PRAGMA foreign_key_list(${table.name})`)
      .all();

    return {
      table: table.name,
      columns,
      foreignKeys,
    };
  });
}

/**
 * Test database connection
 */
export function testConnection(): boolean {
  try {
    const db = getDatabase();
    const result = db.prepare("SELECT 1 as test").get() as { test: number };
    return result.test === 1;
  } catch (error) {
    console.error("[SQLite] Connection test failed:", error);
    return false;
  }
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    console.log("[SQLite] Closing database connection");
    db.close();
    db = null;
  }
}

/**
 * Estimate query cost (simplified for SQLite)
 */
export async function estimateQueryCost(sql: string): Promise<{
  estimatedRows: number;
  estimatedCost: string;
}> {
  const db = getDatabase();

  try {
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all();
    console.log("[SQLite] Query plan:", plan);

    return {
      estimatedRows: 0, // SQLite doesn't provide row estimates easily
      estimatedCost: "low", // Simplified - SQLite is generally fast for small databases
    };
  } catch (error: any) {
    console.error("[SQLite] Failed to estimate query cost:", error.message);
    return {
      estimatedRows: 0,
      estimatedCost: "unknown",
    };
  }
}
