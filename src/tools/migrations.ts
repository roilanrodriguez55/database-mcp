import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConnectionManager } from "../connection-manager.js";
import { z } from "zod";
import { listMigrationFiles, getAppliedMigrations, applyMigration, applyAllMigrations } from "../migrations/runner.js";

export function registerMigrationTools(
  server: McpServer,
  connectionManager: ConnectionManager,
  migrationsDir: string
): void {
  server.registerTool(
    "db_list_migrations",
    {
      description: "List migrations: applied (in DB) and pending (files not yet applied). Use to sync database.",
      inputSchema: { database: z.string().describe("Database name from databases.json") },
    },
    async (params: { database: string }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        const applied = await getAppliedMigrations(driver);
        const all = await listMigrationFiles(migrationsDir);
        const pending = all.filter((f) => !applied.includes(f));
        return { content: [{ type: "text", text: JSON.stringify({ applied, pending, totalFiles: all.length }, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_apply_migration",
    {
      description: "Apply a single migration by filename",
      inputSchema: { database: z.string().describe("Database name from databases.json"), name: z.string().describe("Migration filename") },
    },
    async (params: { database: string; name: string }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        const result = await applyMigration(driver, migrationsDir, params.name);
        if (result.applied) return { content: [{ type: "text", text: `Migration "${params.name}" applied` }] };
        return { content: [{ type: "text", text: result.error ?? "Migration failed" }], isError: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_apply_all_migrations",
    {
      description: "Apply all pending migrations to sync the database. Runs migrations in order.",
      inputSchema: { database: z.string().describe("Database name from databases.json") },
    },
    async (params: { database: string }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        const result = await applyAllMigrations(driver, migrationsDir);
        const output = { applied: result.applied, failed: result.failed, summary: `${result.applied.length} applied, ${result.failed.length} failed` };
        return { content: [{ type: "text", text: JSON.stringify(output, null, 2) }], isError: result.failed.length > 0 };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );
}
