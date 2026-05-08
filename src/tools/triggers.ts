import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConnectionManager } from "../connection-manager.js";
import { z } from "zod";

export function registerTriggerTools(
  server: McpServer,
  connectionManager: ConnectionManager
): void {
  server.registerTool(
    "db_list_triggers",
    {
      description: "List triggers",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().optional().describe("Filter by schema"),
        table: z.string().optional().describe("Filter by table"),
      },
    },
    async (params: { database: string; schema?: string; table?: string }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        const triggers = await driver.listTriggers(params.schema, params.table);
        return { content: [{ type: "text", text: JSON.stringify(triggers, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_create_trigger",
    {
      description: "Create a trigger",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().describe("Schema name"),
        table: z.string().describe("Table name"),
        name: z.string().describe("Trigger name"),
        timing: z.enum(["BEFORE", "AFTER", "INSTEAD OF"]).describe("When to fire"),
        event: z.enum(["INSERT", "UPDATE", "DELETE"]).describe("Event type"),
        function: z.string().describe("Trigger function (schema.name or name)"),
      },
    },
    async (params: { database: string; schema: string; table: string; name: string; timing: "BEFORE" | "AFTER" | "INSTEAD OF"; event: "INSERT" | "UPDATE" | "DELETE"; function: string }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        await driver.createTrigger(params.schema, params.table, params.name, { timing: params.timing, event: params.event, function: params.function });
        return { content: [{ type: "text", text: `Trigger "${params.name}" created on "${params.schema}"."${params.table}"` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_drop_trigger",
    {
      description: "Drop a trigger",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().describe("Schema name"),
        table: z.string().describe("Table name"),
        name: z.string().describe("Trigger name"),
      },
    },
    async (params: { database: string; schema: string; table: string; name: string }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        await driver.dropTrigger(params.schema, params.table, params.name);
        return { content: [{ type: "text", text: `Trigger "${params.name}" dropped` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );
}
