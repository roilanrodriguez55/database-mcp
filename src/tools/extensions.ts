import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConnectionManager } from "../connection-manager.js";
import { z } from "zod";

export function registerExtensionTools(
  server: McpServer,
  connectionManager: ConnectionManager
): void {
  server.registerTool(
    "db_list_extensions",
    {
      description: "List installed extensions",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
      },
    },
    async (params: { database: string }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        const extensions = await driver.listExtensions();
        return { content: [{ type: "text", text: JSON.stringify(extensions, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_create_extension",
    {
      description: "Install an extension",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        name: z.string().describe("Extension name"),
        schema: z.string().optional().describe("Schema to install into"),
      },
    },
    async (params: { database: string; name: string; schema?: string }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.createExtension(params.name, params.schema);
        return { content: [{ type: "text", text: `Extension "${params.name}" installed` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_drop_extension",
    {
      description: "Remove an extension",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        name: z.string().describe("Extension name"),
      },
    },
    async (params: { database: string; name: string }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.dropExtension(params.name);
        return { content: [{ type: "text", text: `Extension "${params.name}" removed` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );
}
