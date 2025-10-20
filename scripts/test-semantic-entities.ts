#!/usr/bin/env tsx
/**
 * Test script for semantic entity YAML files
 *
 * For each *.yml file in semantic/entities:
 * 1. Validates YAML can be loaded and passes Zod schema validation
 * 2. Executes SELECT * FROM {table} LIMIT 1 against Snowflake
 * 3. Verifies all dimensions in YAML match columns returned from Snowflake
 */

import { ListEntities, loadEntityYaml } from "@/lib/semantic/io";
import { getSnowflake } from "@/services/snowflake_client";

interface TestResult {
  entity: string;
  schemaValid: boolean;
  snowflakeQuery: boolean;
  dimensionsMatch: boolean;
  errors: string[];
  warnings: string[];
  missingInSnowflake?: string[];
  extraInSnowflake?: string[];
}

async function executeSnowflakeQuery(sql: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    getSnowflake()
      .then((conn) => {
        conn.execute({
          sqlText: sql,
          complete: (err, _stmt, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows as any[]);
            }
          },
        });
      })
      .catch(reject);
  });
}

async function testEntity(entityName: string): Promise<TestResult> {
  const result: TestResult = {
    entity: entityName,
    schemaValid: false,
    snowflakeQuery: false,
    dimensionsMatch: false,
    errors: [],
    warnings: [],
  };

  try {
    // Step 1: Load and validate YAML
    const { entity } = await loadEntityYaml(entityName);
    result.schemaValid = true;

    // Step 2: Query Snowflake for 1 row
    const sql = `SELECT * FROM ${entity.table} LIMIT 1`;
    let rows: any[];

    try {
      rows = await executeSnowflakeQuery(sql);
      result.snowflakeQuery = true;
    } catch (err) {
      result.errors.push(
        `Snowflake query failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return result;
    }

    // Step 3: Compare dimensions with Snowflake columns
    if (rows.length === 0) {
      result.warnings.push("Snowflake table is empty (0 rows)");
      // Still validate schema structure even with empty table
      result.dimensionsMatch = true;
      return result;
    }

    const snowflakeColumns = new Set(
      Object.keys(rows[0]).map((col) => col.toLowerCase())
    );

    // Get all dimension names (including time dimensions)
    // Exclude derived dimensions (where sql is different from the column name)
    const yamlDimensions = new Set([
      ...entity.dimensions
        .filter((d) => !d.sql || d.sql.toLowerCase() === d.name.toLowerCase())
        .map((d) => d.name.toLowerCase()),
      ...entity.time_dimensions
        .filter((d) => !d.sql || d.sql.toLowerCase() === d.name.toLowerCase())
        .map((d) => d.name.toLowerCase()),
    ]);

    // Check for dimensions in YAML but not in Snowflake
    const missingInSnowflake: string[] = [];
    for (const dim of yamlDimensions) {
      if (!snowflakeColumns.has(dim)) {
        missingInSnowflake.push(dim);
      }
    }

    // Check for columns in Snowflake but not in YAML
    const extraInSnowflake: string[] = [];
    for (const col of snowflakeColumns) {
      if (!yamlDimensions.has(col)) {
        extraInSnowflake.push(col);
      }
    }

    if (missingInSnowflake.length > 0) {
      result.missingInSnowflake = missingInSnowflake;
      result.errors.push(
        `Dimensions in YAML but not in Snowflake: ${missingInSnowflake.join(", ")}`
      );
    }

    if (extraInSnowflake.length > 0) {
      result.extraInSnowflake = extraInSnowflake;
      result.warnings.push(
        `Columns in Snowflake but not in YAML: ${extraInSnowflake.join(", ")}`
      );
    }

    result.dimensionsMatch =
      missingInSnowflake.length === 0 && extraInSnowflake.length === 0;
  } catch (err) {
    result.errors.push(
      `Schema validation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return result;
}

async function main() {
  console.log("🔍 Testing semantic entity YAML files...\n");

  const entities = await ListEntities();
  console.log(`Found ${entities.length} entity files\n`);

  const results: TestResult[] = [];

  for (const entity of entities) {
    process.stdout.write(`Testing ${entity}... `);
    const result = await testEntity(entity);
    results.push(result);

    if (result.errors.length === 0) {
      console.log("✅");
    } else {
      console.log("❌");
    }
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80) + "\n");

  const passed = results.filter((r) => r.errors.length === 0);
  const failed = results.filter((r) => r.errors.length > 0);

  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed.length} ✅`);
  console.log(`Failed: ${failed.length} ❌\n`);

  if (failed.length > 0) {
    console.log("FAILURES:\n");
    for (const result of failed) {
      console.log(`❌ ${result.entity}`);
      for (const error of result.errors) {
        console.log(`   - ${error}`);
      }
      if (result.warnings.length > 0) {
        for (const warning of result.warnings) {
          console.log(`   ⚠️  ${warning}`);
        }
      }
      console.log();
    }
  }

  // Show warnings for passing tests
  const passedWithWarnings = passed.filter((r) => r.warnings.length > 0);
  if (passedWithWarnings.length > 0) {
    console.log("WARNINGS:\n");
    for (const result of passedWithWarnings) {
      console.log(`⚠️  ${result.entity}`);
      for (const warning of result.warnings) {
        console.log(`   - ${warning}`);
      }
      console.log();
    }
  }

  // Exit with error code if any tests failed
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
