import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { IDatabaseDriver } from "./drivers/types.js";
import { createDriver, type SupportedDbType } from "./drivers/factory.js";
import { recordMigration } from "./migrations/recorder.js";
import { log } from "./logger.js";

export interface DatabaseConfig {
  name: string;
  description?: string;
  connectionString: string;
  dbType: SupportedDbType;
  enabled?: boolean;
  readonly?: boolean;
}

export interface DatabaseInfo {
  name: string;
  description?: string;
  dbType: SupportedDbType;
  enabled: boolean;
  readonly: boolean;
}

function getProjectRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const currentDir = dirname(__filename);
  const parentDir = dirname(currentDir);
  const grandparentDir = dirname(parentDir);

  const path1 = join(parentDir, "databases.json");
  const path2 = join(grandparentDir, "databases.json");

  if (existsSync(path2)) {
    return grandparentDir;
  }
  return parentDir;
}

export class ConnectionManager {
  private connections: Map<string, IDatabaseDriver> = new Map();
  private configs: Map<string, DatabaseConfig> = new Map();
  private migrationsDir: string;
  private migrationsEnabled: boolean;

  constructor(
    migrationsDir: string,
    migrationsEnabled: boolean = true,
    configs?: DatabaseConfig[]
  ) {
    this.migrationsDir = migrationsDir;
    this.migrationsEnabled = migrationsEnabled;
    if (configs) {
      for (const db of configs) this.configs.set(db.name, db);
    } else {
      this.loadDatabases();
    }
  }

  private loadDatabases(): void {
    const projectRoot = getProjectRoot();
    const configPath = join(projectRoot, "databases.json");

    let databases: DatabaseConfig[];

    try {
      const content = readFileSync(configPath, "utf-8");
      databases = JSON.parse(content);
    } catch (err) {
      throw new Error(`Failed to load databases.json from ${configPath}: ${err}`);
    }

    if (!Array.isArray(databases)) {
      throw new Error("databases.json must contain an array");
    }

    for (const db of databases) {
      if (!db.name || !db.connectionString || !db.dbType) {
        throw new Error("Each database must have name, connectionString, and dbType");
      }
      this.configs.set(db.name, db);
    }
  }

  getDatabase(name: string): IDatabaseDriver {
    const config = this.configs.get(name);
    if (!config) {
      throw new Error(`Database "${name}" not found in databases.json`);
    }

    if (config.enabled === false) {
      throw new Error(`Database "${name}" is disabled`);
    }

    let driver = this.connections.get(name);

    if (!driver) {
      const migrationRecorder = this.migrationsEnabled
        ? async (sql: string, desc: string) => {
            try {
              await recordMigration(this.migrationsDir, sql, desc);
            } catch (err) {
              console.error("[MCP Migrations] Failed to record:", err);
            }
          }
        : undefined;

      log("info", "connection.open", { database: name, dbType: config.dbType });
      driver = createDriver(config.dbType, config.connectionString, { migrationRecorder, databaseName: name });
      this.connections.set(name, driver);
    }

    return driver;
  }

  assertWritable(name: string): void {
    const config = this.configs.get(name);
    if (!config) throw new Error(`Database "${name}" not found in databases.json`);
    if (config.readonly === true) throw new Error(`Database "${name}" is read-only`);
  }

  listDatabases(): DatabaseInfo[] {
    const result: DatabaseInfo[] = [];
    for (const [name, config] of this.configs) {
      result.push({
        name,
        description: config.description,
        dbType: config.dbType,
        enabled: config.enabled !== false,
        readonly: config.readonly === true,
      });
    }
    return result;
  }

  getDatabaseInfo(name: string): DatabaseInfo | null {
    const config = this.configs.get(name);
    if (!config) return null;
    return {
      name: config.name,
      description: config.description,
      dbType: config.dbType,
      enabled: config.enabled !== false,
      readonly: config.readonly === true,
    };
  }

  async closeAll(): Promise<void> {
    log("info", "connection.close_all", { count: this.connections.size });
    for (const driver of this.connections.values()) {
      await driver.close();
    }
    this.connections.clear();
  }
}