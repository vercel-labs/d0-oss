import { configSchema, type Config } from "@/config/schema";
import * as constants from "@/config/constants";
import { config as loadDotenv } from "dotenv";

let cachedConfig: Config | null = null;

/**
 * Load and validate configuration from environment variables
 * Throws on validation failure with detailed error messages
 */
export function loadConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Load .env file
  loadDotenv();

  try {
    const result = configSchema.parse(process.env);
    cachedConfig = Object.freeze(result);
    return cachedConfig;
  } catch (error) {
    if (error instanceof Error) {
      console.error("❌ Configuration validation failed:");
      console.error(error.message);

      // Extract missing required fields for better error messages
      if (error.message.includes("OPENAI_API_KEY")) {
        console.error("💡 Set OPENAI_API_KEY in your .env file");
      }
      if (error.message.includes("SNOWFLAKE_")) {
        console.error(
          "💡 Ensure all SNOWFLAKE_* variables are set in your .env file",
        );
      }
      if (error.message.includes("LANGFUSE_")) {
        console.error(
          "💡 Set LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY in your .env file when OBSERVABILITY_ENABLED=true",
        );
      }
    }
    throw error;
  }
}

/**
 * Get current configuration (loads if not already cached)
 */
export function getConfig(): Config {
  return loadConfig();
}

/**
 * Reset cached config (useful for testing)
 */
export function resetConfig(): void {
  cachedConfig = null;
}

// Export constants for convenience
export { constants };

// Export the config instance as default
export default getConfig();
