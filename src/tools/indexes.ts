import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IDatabaseDriver } from "../drivers/types.js";
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

export function registerIndexTools(
  server: McpServer,
  driver: IDatabaseDriver
): void {
  server.registerTool(
    "db_list_indexes",
    {
      description: "List indexes",
      inputSchema: {
        schema: z.string().optional().describe("Filter by schema"),
        table: z.string().optional().describe("Filter by table"),
      },
    },
    wrapHandler(async ({ schema, table }) => {
      const indexes = await driver.listIndexes(schema, table);
      return {
        content: [{ type: "text", text: JSON.stringify(indexes, null, 2) }],
      };
    })
  );

  server.registerTool(
    "db_create_index",
    {
      description: "Create an index",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        table: z.string().describe("Table name"),
        columns: z.array(z.string()).describe("Index columns"),
        name: z.string().optional().describe("Index name"),
        unique: z.boolean().optional().describe("Unique index"),
      },
    },
    wrapHandler(async ({ schema, table, columns, name, unique }) => {
      await driver.createIndex(schema, table, columns, { name, unique });
      return {
        content: [{ type: "text", text: `Index created on "${schema}"."${table}"` }],
      };
    })
  );

  server.registerTool(
    "db_drop_index",
    {
      description: "Drop an index",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        name: z.string().describe("Index name"),
      },
    },
    wrapHandler(async ({ schema, name }) => {
      await driver.dropIndex(schema, name);
      return {
        content: [{ type: "text", text: `Index "${schema}"."${name}" dropped` }],
      };
    })
  );
}
