import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConnectionManager } from "../connection-manager.js";
import { z } from "zod";

export function registerSchemaTools(
  server: McpServer,
  connectionManager: ConnectionManager
): void {
  server.registerTool(
    "db_list_schemas",
    {
      description: "List all database schemas",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        includeSystem: z.boolean().optional().describe("Include system schemas"),
      },
    },
    async (params: { database: string; includeSystem?: boolean }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        const schemas = await driver.listSchemas(params.includeSystem ?? false);
        return { content: [{ type: "text", text: JSON.stringify(schemas, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_create_schema",
    {
      description: "Create a new schema",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        name: z.string().describe("Schema name"),
        owner: z.string().optional().describe("Schema owner"),
      },
    },
    async (params: { database: string; name: string; owner?: string }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.createSchema(params.name, { owner: params.owner });
        return { content: [{ type: "text", text: `Schema "${params.name}" created` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_get_schema",
    {
      description: "Get schema details",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        name: z.string().describe("Schema name"),
      },
    },
    async (params: { database: string; name: string }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        const schema = await driver.getSchema(params.name);
        if (!schema) {
          return { content: [{ type: "text", text: `Schema "${params.name}" not found` }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify(schema, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_alter_schema",
    {
      description: "Rename a schema",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        name: z.string().describe("Current schema name"),
        newName: z.string().describe("New schema name"),
      },
    },
    async (params: { database: string; name: string; newName: string }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.alterSchema(params.name, { newName: params.newName });
        return { content: [{ type: "text", text: `Schema "${params.name}" renamed to "${params.newName}"` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_drop_schema",
    {
      description: "Drop a schema",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        name: z.string().describe("Schema name"),
        cascade: z.boolean().optional().describe("Drop dependent objects"),
      },
    },
    async (params: { database: string; name: string; cascade?: boolean }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.dropSchema(params.name, params.cascade ?? false);
        return { content: [{ type: "text", text: `Schema "${params.name}" dropped` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );
}
