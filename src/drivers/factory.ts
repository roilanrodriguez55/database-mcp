import type { IDatabaseDriver } from "./types.js";
import type { MigrationRecorder } from "./postgres.js";
import { PostgresDriver } from "./postgres.js";
import { SQLiteDriver } from "./sqlite.js";

export type SupportedDbType = "postgres" | "sqlite";

export function createDriver(
  dbType: string,
  connectionString: string,
  options?: { migrationRecorder?: MigrationRecorder }
): IDatabaseDriver {
  switch (dbType.toLowerCase()) {
    case "postgres":
      return new PostgresDriver(connectionString, options);
    case "sqlite":
      return new SQLiteDriver(connectionString, options);
    default:
      throw new Error(`Unsupported DB_TYPE: ${dbType}`);
  }
}
