import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IDatabaseDriver } from "../drivers/types.js";
import { z } from "zod";
import {
  listMigrationFiles,
  getAppliedMigrations,
  applyMigration,
  applyAllMigrations,
} from "../migrations/runner.js";

function wrapHandler<T>(
  handler: (params: T) => Promise<{ content: { type: "text"; text: string }[] }>
) {
  return async (params: T) => {
    try {
      return await handler(params);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: msg }],
        isError: true,
      };
    }
  };
}

export function registerMigrationTools(
  server: McpServer,
  driver: IDatabaseDriver,
  migrationsDir: string
): void {
  server.registerTool(
    "db_list_migrations",
    {
      description:
        "List migrations: applied (in DB) and pending (files not yet applied). Use to sync database.",
      inputSchema: {},
    },
    wrapHandler(async () => {
      const applied = await getAppliedMigrations(driver);
      const all = await listMigrationFiles(migrationsDir);
      const pending = all.filter((f) => !applied.includes(f));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { applied, pending, totalFiles: all.length },
              null,
              2
            ),
          },
        ],
      };
    })
  );

  server.registerTool(
    "db_apply_migration",
    {
      description: "Apply a single migration by filename",
      inputSchema: {
        name: z.string().describe("Migration filename (e.g. 20250117120530_create_schema_foo.sql)"),
      },
    },
    wrapHandler(async ({ name }) => {
      const result = await applyMigration(driver, migrationsDir, name);
      if (result.applied) {
        return {
          content: [{ type: "text", text: `Migration "${name}" applied` }],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: result.error ?? "Migration failed",
          },
        ],
        isError: true,
      };
    })
  );

  server.registerTool(
    "db_apply_all_migrations",
    {
      description:
        "Apply all pending migrations to sync the database. Runs migrations in order.",
      inputSchema: {},
    },
    wrapHandler(async () => {
      const result = await applyAllMigrations(driver, migrationsDir);
      const output = {
        applied: result.applied,
        failed: result.failed,
        summary: `${result.applied.length} applied, ${result.failed.length} failed`,
      };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(output, null, 2),
          },
        ],
        isError: result.failed.length > 0,
      };
    })
  );
}
