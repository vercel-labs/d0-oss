// lib/security/policy.ts

export const allowedSchemas = (process.env.ALLOWED_SCHEMAS ?? "analytics,crm,main")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function parseTableIdent(ident: string): {
  db?: string;
  schema?: string;
  table?: string;
} {
  // Snowflake fully qualified: <db>.<schema>.<table>
  const parts = ident.split(".");
  if (parts.length === 3)
    return { db: parts[0], schema: parts[1], table: parts[2] };
  if (parts.length === 2) return { schema: parts[0], table: parts[1] };
  if (parts.length === 1) return { table: parts[0] };
  return {};
}

export function verifyAllowedTables(
  registry: Map<string, { table: string }>,
  allowed: string[] = allowedSchemas
) {
  const violations: string[] = [];
  for (const [entity, ent] of registry.entries()) {
    const parsed = parseTableIdent(ent.table);
    if (!parsed.schema) {
      violations.push(
        `Entity "${entity}" table "${ent.table}" is not schema-qualified.`
      );
      continue;
    }
    if (!allowed.includes(parsed.schema)) {
      violations.push(
        `Entity "${entity}" table schema "${parsed.schema}" not in allowed list: [${allowed.join(", ")}]`
      );
    }
  }
  if (violations.length > 0) {
    const msg = "Security policy violation: " + violations.join("; ");
    throw new Error(msg);
  }
}
