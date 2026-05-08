import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** Project root (parent of dist/ when built, or src/ when using tsx) */
export function getProjectRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return join(__dirname, "..");
}

export type LoadConfigType = {
  migrationsDir: string;
  migrationsEnabled: boolean;
}

/** Loads MIGRATIONS_DIR from env */
export function loadConfig(): LoadConfigType {
  const projectRoot = getProjectRoot();
  const migrationsDir =
    process.env.MIGRATIONS_DIR ?? join(projectRoot, "migrations");
  const migrationsEnabled = process.env.MIGRATIONS_ENABLED !== "false";

  return { migrationsDir, migrationsEnabled };
}
