// lib/snowflake.ts
import type { Connection, Pool } from "snowflake-sdk";
import snowflake from "snowflake-sdk";

// ---------- Types ----------
export interface ColumnMeta {
  name: string;
  type: string;
}

export interface ExecResult {
  rows: Record<string, any>[];
  columns: ColumnMeta[];
  lastQueryId: string;
}

export interface ExecOptions {
  timeoutMs?: number; // default 20_000
  rowLimit?: number; // default 1001 (used only if enforceLimit)
  attempts?: number; // default 3 -> initial + 2 retries
  enforceLimit?: boolean; // default false here (Build phase already appends LIMIT 1001)
  queryTag?: string; // optional query tag
}

// ---------- Module-scoped pool & breaker ----------
let pool: Pool<Connection> | null = null; // Using 'any' as the type is Pool<Connection> from generic-pool

const breaker = {
  consecutiveFailures: 0,
  trippedUntil: 0, // epoch ms
  isOpen(now = Date.now()) {
    return now < this.trippedUntil;
  },
  recordSuccess() {
    this.consecutiveFailures = 0;
    this.trippedUntil = 0;
  },
  recordFailure() {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= 3) {
      this.trippedUntil = Date.now() + 60_000; // 60s cool-down
    }
  },
};

// ---------- Helpers ----------
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function getPrivateKey(): string {
  // Accept PEM with \n escaped or base64; prefer PEM
  let key = requireEnv("SNOWFLAKE_PRIVATE_KEY");
  key = key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
  return key.trim();
}

export function getSnowflakePool(): any {
  if (pool) return pool;

  // Check if we should use password auth or private key auth
  const usePasswordAuth =
    process.env.SNOWFLAKE_PASSWORD && !process.env.SNOWFLAKE_PRIVATE_KEY;

  console.log("[Snowflake] Initializing connection pool...");
  console.log(
    `[Snowflake] Auth method: ${usePasswordAuth ? "password" : "private key"}`
  );
  console.log(`[Snowflake] Account: ${process.env.SNOWFLAKE_ACCOUNT}`);
  console.log(`[Snowflake] Database: ${process.env.SNOWFLAKE_DATABASE}`);
  console.log(`[Snowflake] Schema: ${process.env.SNOWFLAKE_SCHEMA}`);

  const config: snowflake.ConnectionOptions = {
    account: requireEnv("SNOWFLAKE_ACCOUNT"),
    username: requireEnv("SNOWFLAKE_USERNAME"),
    ...(usePasswordAuth
      ? { password: requireEnv("SNOWFLAKE_PASSWORD") }
      : { privateKey: getPrivateKey() }),
    role: process.env.SNOWFLAKE_ROLE,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
    clientSessionKeepAlive: true,
  };

  pool = snowflake.createPool(config, {
    max: 5,
    min: 0,
    evictionRunIntervalMillis: 30_000,
    numTestsPerEvictionRun: 1,
    softIdleTimeoutMillis: 60_000,
  });

  return pool;
}

// Generic pool API uses acquire() and release() methods
async function getConnection(p: any): Promise<snowflake.Connection> {
  try {
    return await p.acquire();
  } catch {
    throw new Error("Failed to acquire connection from pool");
  }
}

async function releaseConnection(p: any, conn: snowflake.Connection) {
  try {
    await p.release(conn);
  } catch {
    /* ignore */
  }
}

function runStatement(
  conn: snowflake.Connection,
  sqlText: string,
  timeoutMs: number
): Promise<{ rows: any[]; stmt: snowflake.RowStatement }> {
  return new Promise((resolve, reject) => {
    let cancelled = false;
    const stmt = conn.execute({
      sqlText,
      complete: (err, stmt, rows) => {
        if (cancelled) return; // ignore callback after cancel
        if (err) return reject(err);
        resolve({ rows: rows ?? [], stmt });
      },
    });

    // Statement-level timeout with cancel
    const timer = setTimeout(() => {
      cancelled = true;
      try {
        stmt.cancel((cancelErr) => {
          reject(
            cancelErr ?? new Error(`Statement timeout after ${timeoutMs}ms`)
          );
        });
      } catch {
        reject(new Error(`Statement timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    // Clear timer on both resolve/reject:
    const clear = () => clearTimeout(timer);
    // Patch resolve/reject to clear timer:
    const origResolve = resolve,
      origReject = reject;
    (resolve as any) = (v: any) => {
      clear();
      origResolve(v);
    };
    (reject as any) = (e: any) => {
      clear();
      origReject(e);
    };
  });
}

function setQueryTag(
  conn: snowflake.Connection,
  tag: string,
  timeoutMs: number
): Promise<void> {
  const safe = tag.replace(/'/g, "''");
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText: `ALTER SESSION SET QUERY_TAG='${safe}'`,
      complete: (err) => {
        if (err) reject(err);
        else resolve();
      },
    });
    // we intentionally do not set a timeout here; cheap param set
    setTimeout(() => resolve(), Math.min(1000, timeoutMs)); // soft timeout
  });
}

// Guardrails: reject multi-statements & DDL/DML
const DISALLOWED = [
  /\bDROP\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\b/i,
  /\bCREATE\b/i,
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bDELETE\b/i,
  /\bMERGE\b/i,
  /\bCOPY\b/i,
  /\bPUT\b/i,
  /\bGET\b/i,
];
function preflightGuard(sql: string) {
  if ((sql.match(/;/g) || []).length > 0) {
    throw new Error("Multi-statement SQL is not allowed.");
  }
  for (const rx of DISALLOWED) {
    if (rx.test(sql)) throw new Error(`Disallowed token matched: ${rx}`);
  }
}

function ensureLimit(sql: string, rowLimit: number): string {
  if (/limit\s+\d+/i.test(sql)) return sql;
  return `${sql}\nLIMIT ${rowLimit}`;
}

// ---------- Public API ----------

/**
 * Run EXPLAIN USING JSON <sql> and return parsed plan JSON.
 */
export async function explainJSON(
  pool: any,
  sql: string,
  timeoutMs = 10_000
): Promise<any> {
  if (breaker.isOpen()) {
    throw new Error("Circuit breaker open. Temporarily refusing EXPLAIN.");
  }

  const conn = await getConnection(pool);
  try {
    preflightGuard(sql);
    const explain = `EXPLAIN USING JSON ${sql}`;
    const { rows } = await runStatement(conn, explain, timeoutMs);
    // Expect a single row with EXPLAIN_JSON column (string)
    const first = rows[0] ?? {};
    const key =
      Object.keys(first).find((k) =>
        k.toUpperCase().includes("EXPLAIN_JSON")
      ) ?? Object.keys(first)[0];
    const text = first[key];
    const parsed = typeof text === "string" ? JSON.parse(text) : text;
    breaker.recordSuccess();
    return parsed;
  } catch (err) {
    breaker.recordFailure();
    throw err;
  } finally {
    await releaseConnection(pool, conn);
  }
}

/**
 * Execute SQL with retries, timeout, circuit breaker, and optional LIMIT enforcement.
 */
export async function execWithRetry(
  pool: any,
  sql: string,
  opts: ExecOptions = {}
): Promise<ExecResult & { truncated: boolean }> {
  const now = Date.now();
  if (breaker.isOpen(now))
    throw new Error("Circuit breaker open. Temporarily refusing execution.");

  const timeoutMs = opts.timeoutMs ?? 20_000;
  const rowLimit = opts.rowLimit ?? 1001;
  const attempts = Math.max(1, Math.min(opts.attempts ?? 3, 5));
  const enforceLimit = !!opts.enforceLimit;
  let lastErr: any;

  console.log("[Snowflake] Executing SQL with retry...");
  console.log(
    "[Snowflake] Query preview:",
    sql.substring(0, 150) + (sql.length > 150 ? "..." : "")
  );
  console.log(`[Snowflake] Timeout: ${timeoutMs}ms, Attempts: ${attempts}`);

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const backoffMs = attempt === 1 ? 0 : 250 * Math.pow(2, attempt - 2); // 0, 250, 500
    if (backoffMs) await new Promise((r) => setTimeout(r, backoffMs));

    const conn = await getConnection(pool);
    try {
      preflightGuard(sql);
      if (opts.queryTag) await setQueryTag(conn, opts.queryTag, 500);

      const finalSql = enforceLimit ? ensureLimit(sql, rowLimit) : sql;
      const { rows, stmt } = await runStatement(conn, finalSql, timeoutMs);

      const lastQueryId = stmt.getStatementId();
      const cols = (stmt.getColumns?.() ?? []).map((c: any) => ({
        name: c.getName?.() ?? String(c.name ?? c.columnName ?? ""),
        type: String(c.getType?.() ?? c.type ?? ""),
      })) as ColumnMeta[];

      breaker.recordSuccess();

      // If we enforced LIMIT rowLimit, then truncated = rows.length >= rowLimit
      const truncated = enforceLimit ? rows.length >= rowLimit : false;

      return { rows, columns: cols, lastQueryId, truncated };
    } catch (err: any) {
      lastErr = err;
      breaker.recordFailure();
      // fallthrough to retry
    } finally {
      await releaseConnection(pool, conn);
    }
  }

  throw lastErr ?? new Error("Unknown execution failure.");
}
