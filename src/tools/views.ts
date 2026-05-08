import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConnectionManager } from "../connection-manager.js";
import { z } from "zod";

export function registerViewTools(
  server: McpServer,
  connectionManager: ConnectionManager
): void {
  server.registerTool(
    "db_list_views",
    {
      description: "List views",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().optional().describe("Filter by schema"),
      },
    },
    async (params: { database: string; schema?: string }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        const views = await driver.listViews(params.schema);
        return { content: [{ type: "text", text: JSON.stringify(views, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_create_view",
    {
      description: "Create a view",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().describe("Schema name"),
        name: z.string().describe("View name"),
        query: z.string().describe("SELECT query defining the view"),
        replace: z.boolean().optional().describe("Replace if exists"),
      },
    },
    async (params: { database: string; schema: string; name: string; query: string; replace?: boolean }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        await driver.createView(params.schema, params.name, params.query, { replace: params.replace });
        return { content: [{ type: "text", text: `View "${params.schema}"."${params.name}" created` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_get_view",
    {
      description: "Get view definition",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().describe("Schema name"),
        name: z.string().describe("View name"),
      },
    },
    async (params: { database: string; schema: string; name: string }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        const view = await driver.getView(params.schema, params.name);
        if (!view) return { content: [{ type: "text", text: `View "${params.schema}"."${params.name}" not found` }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(view, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_drop_view",
    {
      description: "Drop a view",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().describe("Schema name"),
        name: z.string().describe("View name"),
        cascade: z.boolean().optional().describe("Drop dependent objects"),
      },
    },
    async (params: { database: string; schema: string; name: string; cascade?: boolean }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        await driver.dropView(params.schema, params.name, params.cascade ?? false);
        return { content: [{ type: "text", text: `View "${params.schema}"."${params.name}" dropped` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );
}
