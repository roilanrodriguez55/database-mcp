import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IDatabaseDriver, ColumnDef } from "../drivers/types.js";
import { z } from "zod";

const columnDefSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean().optional(),
  default: z.string().optional(),
});

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

export function registerTableTools(
  server: McpServer,
  driver: IDatabaseDriver
): void {
  server.registerTool(
    "db_list_tables",
    {
      description: "List tables in a schema",
      inputSchema: {
        schema: z.string().optional().describe("Schema name (default: public)"),
        verbose: z.boolean().optional().describe("Include columns, PK, FK"),
      },
    },
    wrapHandler(async ({ schema, verbose }) => {
      const tables = await driver.listTables(schema ?? "public", verbose ?? false);
      return {
        content: [{ type: "text", text: JSON.stringify(tables, null, 2) }],
      };
    })
  );

  server.registerTool(
    "db_create_table",
    {
      description: "Create a new table",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        name: z.string().describe("Table name"),
        columns: z.array(columnDefSchema).describe("Column definitions"),
        primaryKey: z.array(z.string()).optional().describe("Primary key columns"),
        constraints: z.array(z.string()).optional().describe("Additional constraints"),
      },
    },
    wrapHandler(async ({ schema, name, columns, primaryKey, constraints }) => {
      const colDefs: ColumnDef[] = columns.map((c) => ({
        name: c.name,
        type: c.type,
        nullable: c.nullable,
        default: c.default,
      }));
      await driver.createTable(schema, name, colDefs, {
        primaryKey,
        constraints,
      });
      return {
        content: [{ type: "text", text: `Table "${schema}"."${name}" created` }],
      };
    })
  );

  server.registerTool(
    "db_get_table",
    {
      description: "Get table details (columns, PK, FK)",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        name: z.string().describe("Table name"),
      },
    },
    wrapHandler(async ({ schema, name }) => {
      const table = await driver.getTable(schema, name);
      if (!table) {
        return {
          content: [{ type: "text", text: `Table "${schema}"."${name}" not found` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(table, null, 2) }],
      };
    })
  );

  server.registerTool(
    "db_alter_table",
    {
      description: "Alter table (add/drop columns, rename)",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        name: z.string().describe("Table name"),
        addColumns: z.array(columnDefSchema).optional().describe("Columns to add"),
        dropColumns: z.array(z.string()).optional().describe("Columns to drop"),
        renameTo: z.string().optional().describe("New table name"),
      },
    },
    wrapHandler(async ({ schema, name, addColumns, dropColumns, renameTo }) => {
      await driver.alterTable(schema, name, {
        addColumns: addColumns?.map((c) => ({
          name: c.name,
          type: c.type,
          nullable: c.nullable,
          default: c.default,
        })),
        dropColumns,
        renameTo,
      });
      return {
        content: [{ type: "text", text: `Table "${schema}"."${name}" altered` }],
      };
    })
  );

  server.registerTool(
    "db_drop_table",
    {
      description: "Drop a table",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        name: z.string().describe("Table name"),
        cascade: z.boolean().optional().describe("Drop dependent objects"),
      },
    },
    wrapHandler(async ({ schema, name, cascade }) => {
      await driver.dropTable(schema, name, cascade ?? false);
      return {
        content: [{ type: "text", text: `Table "${schema}"."${name}" dropped` }],
      };
    })
  );
}
