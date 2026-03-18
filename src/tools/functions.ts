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

export function registerFunctionTools(
  server: McpServer,
  driver: IDatabaseDriver
): void {
  server.registerTool(
    "db_list_functions",
    {
      description: "List functions",
      inputSchema: {
        schema: z.string().optional().describe("Filter by schema"),
      },
    },
    wrapHandler(async ({ schema }) => {
      const functions = await driver.listFunctions(schema);
      return {
        content: [{ type: "text", text: JSON.stringify(functions, null, 2) }],
      };
    })
  );

  server.registerTool(
    "db_create_function",
    {
      description: "Create a function",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        name: z.string().describe("Function name"),
        body: z.string().describe("Function body (PL/pgSQL)"),
        args: z.string().optional().describe("Arguments, e.g. 'a int, b int'"),
        returns: z.string().optional().describe("Return type (default: void)"),
        language: z.string().optional().describe("Language (default: plpgsql)"),
      },
    },
    wrapHandler(async ({ schema, name, body, args, returns, language }) => {
      await driver.createFunction(schema, name, body, {
        args,
        returns,
        language,
      });
      return {
        content: [{ type: "text", text: `Function "${schema}"."${name}" created` }],
      };
    })
  );

  server.registerTool(
    "db_drop_function",
    {
      description: "Drop a function",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        name: z.string().describe("Function name"),
        args: z.string().optional().describe("Argument types for overload resolution"),
      },
    },
    wrapHandler(async ({ schema, name, args }) => {
      await driver.dropFunction(schema, name, args);
      return {
        content: [{ type: "text", text: `Function "${schema}"."${name}" dropped` }],
      };
    })
  );
}
