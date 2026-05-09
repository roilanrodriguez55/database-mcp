import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConnectionManager } from "../connection-manager.js";
import { z } from "zod";

export function registerFunctionTools(
  server: McpServer,
  connectionManager: ConnectionManager
): void {
  server.registerTool(
    "db_list_functions",
    {
      description: "List functions",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().optional().describe("Filter by schema"),
      },
    },
    async (params: { database: string; schema?: string }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        const functions = await driver.listFunctions(params.schema);
        return { content: [{ type: "text", text: JSON.stringify(functions, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_create_function",
    {
      description: "Create a function",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().describe("Schema name"),
        name: z.string().describe("Function name"),
        body: z.string().describe("Function body (PL/pgSQL)"),
        args: z.string().optional().describe("Arguments, e.g. 'a int, b int'"),
        returns: z.string().optional().describe("Return type (default: void)"),
        language: z.string().optional().describe("Language (default: plpgsql)"),
      },
    },
    async (params: { database: string; schema: string; name: string; body: string; args?: string; returns?: string; language?: string }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.createFunction(params.schema, params.name, params.body, { args: params.args, returns: params.returns, language: params.language });
        return { content: [{ type: "text", text: `Function "${params.schema}"."${params.name}" created` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_drop_function",
    {
      description: "Drop a function",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().describe("Schema name"),
        name: z.string().describe("Function name"),
        args: z.string().optional().describe("Argument types for overload resolution"),
      },
    },
    async (params: { database: string; schema: string; name: string; args?: string }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.dropFunction(params.schema, params.name, params.args);
        return { content: [{ type: "text", text: `Function "${params.schema}"."${params.name}" dropped` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );
}
