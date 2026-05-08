import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConnectionManager } from "../connection-manager.js";
import { z } from "zod";

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

export function registerDatabaseTools(
  server: McpServer,
  connectionManager: ConnectionManager
): void {
  server.registerTool(
    "db_list_databases",
    {
      description: "List all configured databases",
      inputSchema: {},
    },
    wrapHandler(async () => {
      const databases = connectionManager.listDatabases();
      return {
        content: [{ type: "text", text: JSON.stringify(databases, null, 2) }],
      };
    })
  );

  server.registerTool(
    "db_get_database",
    {
      description: "Get details of a specific database",
      inputSchema: {
        name: z.string().describe("Database name"),
      },
    },
    wrapHandler(async ({ name }) => {
      const db = connectionManager.getDatabaseInfo(name);
      if (!db) {
        return {
          content: [{ type: "text", text: `Database "${name}" not found` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(db, null, 2) }],
      };
    })
  );
}