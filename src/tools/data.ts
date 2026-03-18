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

export function registerDataTools(
  server: McpServer,
  driver: IDatabaseDriver
): void {
  server.registerTool(
    "db_query",
    {
      description: "Execute a SELECT query",
      inputSchema: {
        query: z.string().describe("SQL SELECT query"),
        params: z.array(z.unknown()).optional().describe("Query parameters"),
      },
    },
    wrapHandler(async ({ query, params }) => {
      const result = await driver.execute(query, params);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ rows: result.rows, rowCount: result.rowCount }, null, 2),
          },
        ],
      };
    })
  );

  server.registerTool(
    "db_insert",
    {
      description: "Insert rows into a table",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        table: z.string().describe("Table name"),
        rows: z.array(z.record(z.unknown())).describe("Rows to insert"),
      },
    },
    wrapHandler(async ({ schema, table, rows }) => {
      const { rowCount } = await driver.insertRows(schema, table, rows);
      return {
        content: [{ type: "text", text: JSON.stringify({ rowCount }) }],
      };
    })
  );

  server.registerTool(
    "db_update",
    {
      description: "Update rows in a table",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        table: z.string().describe("Table name"),
        set: z.record(z.unknown()).describe("Column values to set"),
        where: z.record(z.unknown()).optional().describe("WHERE conditions"),
      },
    },
    wrapHandler(async ({ schema, table, set, where }) => {
      const { rowCount } = await driver.updateRows(schema, table, set, where);
      return {
        content: [{ type: "text", text: JSON.stringify({ rowCount }) }],
      };
    })
  );

  server.registerTool(
    "db_delete",
    {
      description: "Delete rows from a table",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        table: z.string().describe("Table name"),
        where: z.record(z.unknown()).optional().describe("WHERE conditions"),
      },
    },
    wrapHandler(async ({ schema, table, where }) => {
      const { rowCount } = await driver.deleteRows(schema, table, where);
      return {
        content: [{ type: "text", text: JSON.stringify({ rowCount }) }],
      };
    })
  );

  server.registerTool(
    "db_execute_sql",
    {
      description:
        "Execute arbitrary SQL (DDL/DML). Use for advanced operations. Prefer specific tools when possible.",
      inputSchema: {
        sql: z.string().describe("SQL statement(s)"),
        params: z.array(z.unknown()).optional().describe("Query parameters"),
      },
    },
    wrapHandler(async ({ sql, params }) => {
      const result = await driver.execute(sql, params);
      if (driver.recordMigration) {
        await driver.recordMigration(sql, "execute_sql");
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ rows: result.rows, rowCount: result.rowCount }, null, 2),
          },
        ],
      };
    })
  );
}
