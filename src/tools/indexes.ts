import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConnectionManager } from "../connection-manager.js";
import { z } from "zod";

export function registerIndexTools(
  server: McpServer,
  connectionManager: ConnectionManager
): void {
  server.registerTool(
    "db_list_indexes",
    {
      description: "List indexes",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().optional().describe("Filter by schema"),
        table: z.string().optional().describe("Filter by table"),
      },
    },
    async (params: { database: string; schema?: string; table?: string }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        const indexes = await driver.listIndexes(params.schema, params.table);
        return { content: [{ type: "text", text: JSON.stringify(indexes, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_create_index",
    {
      description: "Create an index",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().describe("Schema name"),
        table: z.string().describe("Table name"),
        columns: z.array(z.string()).describe("Index columns"),
        name: z.string().optional().describe("Index name"),
        unique: z.boolean().optional().describe("Unique index"),
      },
    },
    async (params: { database: string; schema: string; table: string; columns: string[]; name?: string; unique?: boolean }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        await driver.createIndex(params.schema, params.table, params.columns, { name: params.name, unique: params.unique });
        return { content: [{ type: "text", text: `Index created on "${params.schema}"."${params.table}"` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_drop_index",
    {
      description: "Drop an index",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().describe("Schema name"),
        name: z.string().describe("Index name"),
      },
    },
    async (params: { database: string; schema: string; name: string }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        await driver.dropIndex(params.schema, params.name);
        return { content: [{ type: "text", text: `Index "${params.schema}"."${params.name}" dropped` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );
}
