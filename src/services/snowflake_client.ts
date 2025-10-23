/**
 * Snowflake client service
 * - Manages a connection pool (or single-connection fallback)
 * - Exposes a minimal `execute` facade compatible with the SDK
 * - Applies per-statement timeouts
 * - Supports graceful shutdown via `closeSnowflake()`
 */
import snowflake from "snowflake-sdk";
import config from "@/config/index";

/** Options for executing a Snowflake statement */
type ExecuteOpts = {
  complete: (err: unknown, stmt: unknown, rows: unknown) => void;
  sqlText: string;
  binds?: unknown[];
  statementTimeoutInSeconds?: number;
};

/** Minimal connection facade exposing `execute` */
type ConnectionFacade = {
  execute: (opts: ExecuteOpts) => void;
};

type SnowflakePool = {
  use<T>(cb: (c: snowflake.Connection) => Promise<T>): Promise<T>;
  drain?: () => Promise<void>;
  clear?: () => Promise<void>;
  destroy?: (cb: () => void) => void;
};

let pool: SnowflakePool | null = null;

/** Build base connection options from environment (do not log secrets) */
function getConnectionOptions() {
  return {
    account: config.SNOWFLAKE_ACCOUNT,
    username: config.SNOWFLAKE_USERNAME,
    password: config.SNOWFLAKE_PASSWORD,
    database: config.SNOWFLAKE_DATABASE,
    schema: config.SNOWFLAKE_SCHEMA,
    warehouse: config.SNOWFLAKE_WAREHOUSE,
    role: config.SNOWFLAKE_ROLE,
    application: config.SNOWFLAKE_APPLICATION ?? "oss-data-analyst-api",
    clientSessionKeepAlive: config.SNOWFLAKE_CLIENT_SESSION_KEEP_ALIVE ?? true,
  };
}

/** Pool sizing configuration */
function getPoolOptions() {
  return {
    max: config.SNOWFLAKE_POOL_MAX,
  };
}

/** Initialize the Snowflake pool or single-connection fallback */
async function initPool() {
  if (pool) return pool;
  const connOpts = getConnectionOptions();
  const poolOpts = getPoolOptions();

  // Prefer official SDK pool if available
  const maybeCreatePool = (
    snowflake as unknown as {
      createPool?: (conn: object, opts: { max: number }) => SnowflakePool;
    }
  ).createPool;
  if (typeof maybeCreatePool === "function") {
    pool = maybeCreatePool(connOpts as object, { max: poolOpts.max });
    console.info("[snowflake] Pool created", {
      max: poolOpts.max,
      application: connOpts.application,
    });
    return pool;
  }

  // Fallback: single connection if pool isn’t available
  const single = snowflake.createConnection(connOpts);
  await new Promise<void>((resolve, reject) => {
    single.connect((err) => (err ? reject(err) : resolve()));
  });
  pool = {
    use<T>(cb: (c: snowflake.Connection) => Promise<T>): Promise<T> {
      // Ensure we always return a Promise for generic-pool compatibility
      return Promise.resolve(cb(single));
    },
    destroy(cb: () => void) {
      single.destroy(() => cb());
    },
  } as SnowflakePool;
  console.warn(
    "[snowflake] SDK pool not available; using single connection fallback"
  );
  return pool;
}

/** Get pooled connection facade for executing statements */
export async function getSnowflake(): Promise<ConnectionFacade> {
  const p = await initPool();
  return {
    execute: (opts: ExecuteOpts) => {
      const timeout =
        typeof opts.statementTimeoutInSeconds === "number"
          ? opts.statementTimeoutInSeconds
          : config.SNOWFLAKE_STATEMENT_TIMEOUT;

      void p.use((conn: snowflake.Connection) => {
        return new Promise<void>((resolve, reject) => {
          type StatementOptionsWithTimeout = {
            sqlText: string;
            binds?: unknown[];
            complete: (err: unknown, stmt: unknown, rows: unknown) => void;
            statementTimeoutInSeconds?: number;
          };
          const optionsWithTimeout: StatementOptionsWithTimeout = {
            ...opts,
            complete: (err, stmt, rows) => {
              try {
                opts.complete(err, stmt, rows);
              } finally {
                resolve();
              }
            },
            statementTimeoutInSeconds: timeout,
          };
          try {
            (
              conn as unknown as {
                execute: (options: StatementOptionsWithTimeout) => void;
              }
            ).execute(optionsWithTimeout);
          } catch (err) {
            // Ensure the pool releases the resource on sync errors
            try {
              opts.complete(err, undefined, undefined);
            } finally {
              const error = err instanceof Error ? err : new Error(String(err));
              reject(error);
            }
          }
        });
      });
    },
  };
}

/** Gracefully close the Snowflake pool (or single connection) */
export async function closeSnowflake(): Promise<void> {
  if (!pool) return;

  if (pool) {
    if (typeof pool.drain === "function" && typeof pool.clear === "function") {
      await pool.drain();
      await pool.clear();
    } else if (typeof pool.destroy === "function") {
      await new Promise<void>((resolve) => {
        pool!.destroy!(resolve);
      });
    }
  }

  pool = null;
  console.info("[snowflake] Pool closed");
}
