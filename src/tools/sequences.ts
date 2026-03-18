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

export function registerSequenceTools(
  server: McpServer,
  driver: IDatabaseDriver
): void {
  server.registerTool(
    "db_list_sequences",
    {
      description: "List sequences",
      inputSchema: {
        schema: z.string().optional().describe("Filter by schema"),
      },
    },
    wrapHandler(async ({ schema }) => {
      const sequences = await driver.listSequences(schema);
      return {
        content: [{ type: "text", text: JSON.stringify(sequences, null, 2) }],
      };
    })
  );

  server.registerTool(
    "db_create_sequence",
    {
      description: "Create a sequence",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        name: z.string().describe("Sequence name"),
        start: z.number().optional().describe("Start value"),
        increment: z.number().optional().describe("Increment value"),
      },
    },
    wrapHandler(async ({ schema, name, start, increment }) => {
      await driver.createSequence(schema, name, { start, increment });
      return {
        content: [{ type: "text", text: `Sequence "${schema}"."${name}" created` }],
      };
    })
  );

  server.registerTool(
    "db_drop_sequence",
    {
      description: "Drop a sequence",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        name: z.string().describe("Sequence name"),
      },
    },
    wrapHandler(async ({ schema, name }) => {
      await driver.dropSequence(schema, name);
      return {
        content: [{ type: "text", text: `Sequence "${schema}"."${name}" dropped` }],
      };
    })
  );
}
