import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConnectionManager } from "../connection-manager.js";
import type { ColumnDef } from "../drivers/types.js";
import { z } from "zod";

const columnDefSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean().optional(),
  default: z.string().optional(),
});

export function registerTableTools(
  server: McpServer,
  connectionManager: ConnectionManager
): void {
  server.registerTool(
    "db_list_tables",
    {
      description: "List tables in a schema",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().optional().describe("Schema name (default: public)"),
        verbose: z.boolean().optional().describe("Include columns, PK, FK"),
      },
    },
    async (params: { database: string; schema?: string; verbose?: boolean }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        const tables = await driver.listTables(params.schema ?? "public", params.verbose ?? false);
        return { content: [{ type: "text", text: JSON.stringify(tables, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_create_table",
    {
      description: "Create a new table",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().describe("Schema name"),
        name: z.string().describe("Table name"),
        columns: z.array(columnDefSchema).describe("Column definitions"),
        primaryKey: z.array(z.string()).optional().describe("Primary key columns"),
        constraints: z.array(z.string()).optional().describe("Additional constraints"),
      },
    },
    async (params: { database: string; schema: string; name: string; columns: { name: string; type: string; nullable?: boolean; default?: string }[]; primaryKey?: string[]; constraints?: string[] }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        const colDefs: ColumnDef[] = params.columns.map((c) => ({
          name: c.name,
          type: c.type,
          nullable: c.nullable,
          default: c.default,
        }));
        await driver.createTable(params.schema, params.name, colDefs, { primaryKey: params.primaryKey, constraints: params.constraints });
        return { content: [{ type: "text", text: `Table "${params.schema}"."${params.name}" created` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_get_table",
    {
      description: "Get table details (columns, PK, FK)",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().describe("Schema name"),
        name: z.string().describe("Table name"),
      },
    },
    async (params: { database: string; schema: string; name: string }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        const table = await driver.getTable(params.schema, params.name);
        if (!table) return { content: [{ type: "text", text: `Table "${params.schema}"."${params.name}" not found` }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(table, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_alter_table",
    {
      description: "Alter table (add/drop columns, rename)",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().describe("Schema name"),
        name: z.string().describe("Table name"),
        addColumns: z.array(columnDefSchema).optional().describe("Columns to add"),
        dropColumns: z.array(z.string()).optional().describe("Columns to drop"),
        renameTo: z.string().optional().describe("New table name"),
      },
    },
    async (params: { database: string; schema: string; name: string; addColumns?: { name: string; type: string; nullable?: boolean; default?: string }[]; dropColumns?: string[]; renameTo?: string }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.alterTable(params.schema, params.name, {
          addColumns: params.addColumns?.map((c) => ({ name: c.name, type: c.type, nullable: c.nullable, default: c.default })),
          dropColumns: params.dropColumns,
          renameTo: params.renameTo,
        });
        return { content: [{ type: "text", text: `Table "${params.schema}"."${params.name}" altered` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_drop_table",
    {
      description: "Drop a table",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().describe("Schema name"),
        name: z.string().describe("Table name"),
        cascade: z.boolean().optional().describe("Drop dependent objects"),
      },
    },
    async (params: { database: string; schema: string; name: string; cascade?: boolean }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.dropTable(params.schema, params.name, params.cascade ?? false);
        return { content: [{ type: "text", text: `Table "${params.schema}"."${params.name}" dropped` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );
}
