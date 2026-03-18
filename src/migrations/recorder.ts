import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Makes execute_sql DDL idempotent (skip if object exists) */
function makeIdempotent(sql: string, description: string): string {
  if (description !== "execute_sql") return sql;
  // CREATE RULE: prepend DROP RULE IF EXISTS (handles schema.table and "schema"."table")
  const ruleMatch = sql.match(/CREATE\s+RULE\s+(\w+)\s+AS\s+ON\s+\w+\s+TO\s+([\w."]+)/i);
  if (ruleMatch) {
    const [, ruleName, tableRef] = ruleMatch;
    return `DROP RULE IF EXISTS ${ruleName} ON ${tableRef};\n${sql}`;
  }
  return sql;
}

/** Records DDL SQL to migration files for replay */
export async function recordMigration(
  migrationsDir: string,
  sql: string,
  description: string
): Promise<string> {
  const idempotentSql = makeIdempotent(sql, description);
  await mkdir(migrationsDir, { recursive: true });
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const name = `${timestamp}_${slug}.sql`;
  const path = join(migrationsDir, name);
  const content = `-- Migration: ${description}\n-- Generated at ${new Date().toISOString()}\n\n${idempotentSql}\n`;
  await writeFile(path, content);
  return name;
}
