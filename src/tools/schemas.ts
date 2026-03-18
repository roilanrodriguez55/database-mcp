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

export function registerSchemaTools(
  server: McpServer,
  driver: IDatabaseDriver
): void {
  server.registerTool(
    "db_list_schemas",
    {
      description: "List all database schemas",
      inputSchema: {
        includeSystem: z.boolean().optional().describe("Include system schemas"),
      },
    },
    wrapHandler(async ({ includeSystem }) => {
      const schemas = await driver.listSchemas(includeSystem ?? false);
      return {
        content: [{ type: "text", text: JSON.stringify(schemas, null, 2) }],
      };
    })
  );

  server.registerTool(
    "db_create_schema",
    {
      description: "Create a new schema",
      inputSchema: {
        name: z.string().describe("Schema name"),
        owner: z.string().optional().describe("Schema owner"),
      },
    },
    wrapHandler(async ({ name, owner }) => {
      await driver.createSchema(name, { owner });
      return {
        content: [{ type: "text", text: `Schema "${name}" created` }],
      };
    })
  );

  server.registerTool(
    "db_get_schema",
    {
      description: "Get schema details",
      inputSchema: {
        name: z.string().describe("Schema name"),
      },
    },
    wrapHandler(async ({ name }) => {
      const schema = await driver.getSchema(name);
      if (!schema) {
        return {
          content: [{ type: "text", text: `Schema "${name}" not found` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(schema, null, 2) }],
      };
    })
  );

  server.registerTool(
    "db_alter_schema",
    {
      description: "Rename a schema",
      inputSchema: {
        name: z.string().describe("Current schema name"),
        newName: z.string().describe("New schema name"),
      },
    },
    wrapHandler(async ({ name, newName }) => {
      await driver.alterSchema(name, { newName });
      return {
        content: [{ type: "text", text: `Schema "${name}" renamed to "${newName}"` }],
      };
    })
  );

  server.registerTool(
    "db_drop_schema",
    {
      description: "Drop a schema",
      inputSchema: {
        name: z.string().describe("Schema name"),
        cascade: z.boolean().optional().describe("Drop dependent objects"),
      },
    },
    wrapHandler(async ({ name, cascade }) => {
      await driver.dropSchema(name, cascade ?? false);
      return {
        content: [{ type: "text", text: `Schema "${name}" dropped` }],
      };
    })
  );
}
