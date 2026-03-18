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

export function registerTriggerTools(
  server: McpServer,
  driver: IDatabaseDriver
): void {
  server.registerTool(
    "db_list_triggers",
    {
      description: "List triggers",
      inputSchema: {
        schema: z.string().optional().describe("Filter by schema"),
        table: z.string().optional().describe("Filter by table"),
      },
    },
    wrapHandler(async ({ schema, table }) => {
      const triggers = await driver.listTriggers(schema, table);
      return {
        content: [{ type: "text", text: JSON.stringify(triggers, null, 2) }],
      };
    })
  );

  server.registerTool(
    "db_create_trigger",
    {
      description: "Create a trigger",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        table: z.string().describe("Table name"),
        name: z.string().describe("Trigger name"),
        timing: z.enum(["BEFORE", "AFTER", "INSTEAD OF"]).describe("When to fire"),
        event: z.enum(["INSERT", "UPDATE", "DELETE"]).describe("Event type"),
        function: z.string().describe("Trigger function (schema.name or name)"),
      },
    },
    wrapHandler(async ({ schema, table, name, timing, event, function: fn }) => {
      await driver.createTrigger(schema, table, name, { timing, event, function: fn });
      return {
        content: [{ type: "text", text: `Trigger "${name}" created on "${schema}"."${table}"` }],
      };
    })
  );

  server.registerTool(
    "db_drop_trigger",
    {
      description: "Drop a trigger",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        table: z.string().describe("Table name"),
        name: z.string().describe("Trigger name"),
      },
    },
    wrapHandler(async ({ schema, table, name }) => {
      await driver.dropTrigger(schema, table, name);
      return {
        content: [{ type: "text", text: `Trigger "${name}" dropped` }],
      };
    })
  );
}
