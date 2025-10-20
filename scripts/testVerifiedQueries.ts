import { sqlEvalSet } from "@/evals/sql-queries";
import { ExecuteSQL } from "@/lib/tools/execute";

const execSnowflakeWithSingleLimit = async (sql: string) => {
  const limitedSql = sql + " LIMIT 1";
  await ExecuteSQL?.execute?.(
    { sql: limitedSql, enforceLimit: false, timeoutMs: 15000, attempts: 1 },
    {
      messages: [],
      toolCallId: "",
    }
  );
};

const results = [];
for (const item of sqlEvalSet) {
  try {
    const result = await execSnowflakeWithSingleLimit(item.expected);
    results.push({ item: item.input, result: "SUCCESS" });
  } catch (e) {
    results.push({
      item: item.input,
      result: "ERROR",
      reason: e instanceof Error ? e.message : String(e),
    });
  }
}

console.log("Results:", results);
