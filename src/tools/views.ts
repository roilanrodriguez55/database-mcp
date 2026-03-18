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

export function registerViewTools(
  server: McpServer,
  driver: IDatabaseDriver
): void {
  server.registerTool(
    "db_list_views",
    {
      description: "List views",
      inputSchema: {
        schema: z.string().optional().describe("Filter by schema"),
      },
    },
    wrapHandler(async ({ schema }) => {
      const views = await driver.listViews(schema);
      return {
        content: [{ type: "text", text: JSON.stringify(views, null, 2) }],
      };
    })
  );

  server.registerTool(
    "db_create_view",
    {
      description: "Create a view",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        name: z.string().describe("View name"),
        query: z.string().describe("SELECT query defining the view"),
        replace: z.boolean().optional().describe("Replace if exists"),
      },
    },
    wrapHandler(async ({ schema, name, query, replace }) => {
      await driver.createView(schema, name, query, { replace });
      return {
        content: [{ type: "text", text: `View "${schema}"."${name}" created` }],
      };
    })
  );

  server.registerTool(
    "db_get_view",
    {
      description: "Get view definition",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        name: z.string().describe("View name"),
      },
    },
    wrapHandler(async ({ schema, name }) => {
      const view = await driver.getView(schema, name);
      if (!view) {
        return {
          content: [{ type: "text", text: `View "${schema}"."${name}" not found` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(view, null, 2) }],
      };
    })
  );

  server.registerTool(
    "db_drop_view",
    {
      description: "Drop a view",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        name: z.string().describe("View name"),
        cascade: z.boolean().optional().describe("Drop dependent objects"),
      },
    },
    wrapHandler(async ({ schema, name, cascade }) => {
      await driver.dropView(schema, name, cascade ?? false);
      return {
        content: [{ type: "text", text: `View "${schema}"."${name}" dropped` }],
      };
    })
  );
}
