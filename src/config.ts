import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** Project root (parent of dist/ when built, or src/ when using tsx) */
function getProjectRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return join(__dirname, "..");
}

/** Loads DATABASE_URL, DB_TYPE, MIGRATIONS_DIR from env */
export function loadConfig(): {
  databaseUrl: string;
  dbType: string;
  migrationsDir: string;
  migrationsEnabled: boolean;
} {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  let dbType = process.env.DB_TYPE;
  if (!dbType) {
    if (databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://")) {
      dbType = "postgres";
    } else {
      dbType = "postgres";
    }
  }

  const projectRoot = getProjectRoot();
  const migrationsDir =
    process.env.MIGRATIONS_DIR ?? join(projectRoot, "migrations");
  const migrationsEnabled = process.env.MIGRATIONS_ENABLED !== "false";

  return { databaseUrl, dbType, migrationsDir, migrationsEnabled };
}
