import { z } from "zod";

/**
 * Complete environment variable schema for oss-data-analyst API
 * Single source of truth for all configuration
 */
export const configSchema = z
  .object({
    // Server Configuration
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PORT: z.string().transform(Number).default(3001),
    HOST: z.string().default("0.0.0.0"),
    WEB_URL: z.url().default("http://localhost:3000"),

    // AI Gateway Configuration
    // AI_GATEWAY_API_KEY: z.string().min(1, "AI_GATEWAY_API_KEY is required"),

    // Snowflake Configuration
    SNOWFLAKE_ACCOUNT: z.string().min(1, "SNOWFLAKE_ACCOUNT is required"),
    SNOWFLAKE_USERNAME: z.string().min(1, "SNOWFLAKE_USERNAME is required"),
    SNOWFLAKE_PASSWORD: z.string().min(1, "SNOWFLAKE_PASSWORD is required"),
    SNOWFLAKE_WAREHOUSE: z.string().min(1, "SNOWFLAKE_WAREHOUSE is required"),
    SNOWFLAKE_DATABASE: z.string().optional(),
    SNOWFLAKE_SCHEMA: z.string().optional(),
    SNOWFLAKE_ROLE: z.string().optional(),
    SNOWFLAKE_STATEMENT_TIMEOUT: z.string().transform(Number).default(120),
    SNOWFLAKE_POOL_MAX: z.string().transform(Number).default(10),
    SNOWFLAKE_APPLICATION: z
      .string()
      .default("oss-data-analyst-api")
      .optional(),
    SNOWFLAKE_CLIENT_SESSION_KEEP_ALIVE: z
      .string()
      .transform((v) => v === "true")
      .default(true)
      .optional(),

    // Runtime Flags
    STRICT_SQL_VALIDATION: z
      .string()
      .transform((val) => val === "true")
      .default(false),
    TABLE_CHUNK_SIZE: z.string().transform(Number).default(500),
    MAX_TOOL_ROUNDTRIPS: z.string().transform(Number).default(10),

    SEND_REASONING: z
      .string()
      .transform((v) => v === "true")
      .default(true),

    // Rate Limiting
    RATE_LIMIT_MAX: z.string().transform(Number).default(1000),
    RATE_LIMIT_WINDOW: z.string().default("1 minute"),

    // Observability Configuration
    OBSERVABILITY_ENABLED: z
      .string()
      .transform((v) => v === "true")
      .default(false),
    LANGFUSE_SECRET_KEY: z.string().optional(),
    LANGFUSE_PUBLIC_KEY: z.string().optional(),
    LANGFUSE_BASEURL: z.string().url().optional(),
  })
  .refine(
    (data) => {
      // If observability is enabled, Langfuse keys are required
      if (data.OBSERVABILITY_ENABLED) {
        return !!(data.LANGFUSE_SECRET_KEY && data.LANGFUSE_PUBLIC_KEY);
      }
      return true;
    },
    {
      message:
        "LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY are required when OBSERVABILITY_ENABLED=true",
    }
  );

export type Config = z.infer<typeof configSchema>;
