import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { IDatabaseDriver } from "../drivers/types.js";

const MIGRATIONS_TABLE = "public._mcp_migrations";

export async function ensureMigrationsTable(driver: IDatabaseDriver): Promise<void> {
  await driver.execute(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

export async function getAppliedMigrations(
  driver: IDatabaseDriver
): Promise<string[]> {
  await ensureMigrationsTable(driver);
  const { rows } = await driver.execute(
    `SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY id`
  );
  return (rows as { name: string }[]).map((r) => r.name);
}

export async function listMigrationFiles(migrationsDir: string): Promise<string[]> {
  try {
    const files = await readdir(migrationsDir);
    return files
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    return [];
  }
}

export async function getPendingMigrations(
  driver: IDatabaseDriver,
  migrationsDir: string
): Promise<string[]> {
  const applied = await getAppliedMigrations(driver);
  const all = await listMigrationFiles(migrationsDir);
  return all.filter((f) => !applied.includes(f));
}

export async function applyMigration(
  driver: IDatabaseDriver,
  migrationsDir: string,
  name: string
): Promise<{ applied: boolean; error?: string }> {
  const path = join(migrationsDir, name);
  let content: string;
  try {
    content = await readFile(path, "utf-8");
  } catch (err) {
    return { applied: false, error: `File not found: ${name}` };
  }

  const applied = await getAppliedMigrations(driver);
  if (applied.includes(name)) {
    return { applied: false, error: `Already applied: ${name}` };
  }

  try {
    await driver.execute(content);
    await driver.execute(
      `INSERT INTO ${MIGRATIONS_TABLE} (name) VALUES ($1)`,
      [name]
    );
    return { applied: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { applied: false, error: msg };
  }
}

export async function applyAllMigrations(
  driver: IDatabaseDriver,
  migrationsDir: string
): Promise<{ applied: string[]; failed: { name: string; error: string }[] }> {
  const pending = await getPendingMigrations(driver, migrationsDir);
  const applied: string[] = [];
  const failed: { name: string; error: string }[] = [];

  for (const name of pending) {
    const result = await applyMigration(driver, migrationsDir, name);
    if (result.applied) {
      applied.push(name);
    } else if (result.error) {
      failed.push({ name, error: result.error });
    }
  }

  return { applied, failed };
}
