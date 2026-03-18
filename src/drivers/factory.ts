import type { IDatabaseDriver } from "./types.js";
import type { MigrationRecorder } from "./postgres.js";
import { PostgresDriver } from "./postgres.js";

export type SupportedDbType = "postgres";

export function createDriver(
  dbType: string,
  connectionString: string,
  options?: { migrationRecorder?: MigrationRecorder }
): IDatabaseDriver {
  switch (dbType.toLowerCase()) {
    case "postgres":
      return new PostgresDriver(connectionString, options);
    default:
      throw new Error(`Unsupported DB_TYPE: ${dbType}`);
  }
}
