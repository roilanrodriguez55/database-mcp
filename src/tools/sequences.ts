import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConnectionManager } from "../connection-manager.js";
import { z } from "zod";

export function registerSequenceTools(
  server: McpServer,
  connectionManager: ConnectionManager
): void {
  server.registerTool(
    "db_list_sequences",
    {
      description: "List sequences",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().optional().describe("Filter by schema"),
      },
    },
    async (params: { database: string; schema?: string }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        const sequences = await driver.listSequences(params.schema);
        return { content: [{ type: "text", text: JSON.stringify(sequences, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_create_sequence",
    {
      description: "Create a sequence",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().describe("Schema name"),
        name: z.string().describe("Sequence name"),
        start: z.number().optional().describe("Start value"),
        increment: z.number().optional().describe("Increment value"),
      },
    },
    async (params: { database: string; schema: string; name: string; start?: number; increment?: number }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        await driver.createSequence(params.schema, params.name, { start: params.start, increment: params.increment });
        return { content: [{ type: "text", text: `Sequence "${params.schema}"."${params.name}" created` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_drop_sequence",
    {
      description: "Drop a sequence",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().describe("Schema name"),
        name: z.string().describe("Sequence name"),
      },
    },
    async (params: { database: string; schema: string; name: string }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        await driver.dropSequence(params.schema, params.name);
        return { content: [{ type: "text", text: `Sequence "${params.schema}"."${params.name}" dropped` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );
}
