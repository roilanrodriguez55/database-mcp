import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConnectionManager } from "../connection-manager.js";
import { z } from "zod";

export function registerDataTools(
  server: McpServer,
  connectionManager: ConnectionManager
): void {
  server.registerTool(
    "db_query",
    {
      description: "Execute a SELECT query",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        query: z.string().describe("SQL SELECT query"),
        params: z.array(z.unknown()).optional().describe("Query parameters"),
      },
    },
    async (params: { database: string; query: string; params?: unknown[] }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        const result = await driver.execute(params.query, params.params);
        return { content: [{ type: "text", text: JSON.stringify({ rows: result.rows, rowCount: result.rowCount }, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_insert",
    {
      description: "Insert rows into a table",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().describe("Schema name"),
        table: z.string().describe("Table name"),
        rows: z.array(z.record(z.unknown())).describe("Rows to insert"),
      },
    },
    async (params: { database: string; schema: string; table: string; rows: Record<string, unknown>[] }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        const { rowCount } = await driver.insertRows(params.schema, params.table, params.rows);
        return { content: [{ type: "text", text: JSON.stringify({ rowCount }) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_update",
    {
      description: "Update rows in a table",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().describe("Schema name"),
        table: z.string().describe("Table name"),
        set: z.record(z.unknown()).describe("Column values to set"),
        where: z.record(z.unknown()).describe("WHERE conditions (required, prevents accidental mass updates)"),
      },
    },
    async (params: { database: string; schema: string; table: string; set: Record<string, unknown>; where: Record<string, unknown> }) => {
      try {
        if (Object.keys(params.where).length === 0) {
          return { content: [{ type: "text", text: "db_update requires at least one WHERE condition to prevent accidental mass updates" }], isError: true };
        }
        const driver = connectionManager.getDatabase(params.database);
        const { rowCount } = await driver.updateRows(params.schema, params.table, params.set, params.where);
        return { content: [{ type: "text", text: JSON.stringify({ rowCount }) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_delete",
    {
      description: "Delete rows from a table",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        schema: z.string().describe("Schema name"),
        table: z.string().describe("Table name"),
        where: z.record(z.unknown()).describe("WHERE conditions (required, prevents accidental mass deletes)"),
      },
    },
    async (params: { database: string; schema: string; table: string; where: Record<string, unknown> }) => {
      try {
        if (Object.keys(params.where).length === 0) {
          return { content: [{ type: "text", text: "db_delete requires at least one WHERE condition to prevent accidental mass deletes" }], isError: true };
        }
        const driver = connectionManager.getDatabase(params.database);
        const { rowCount } = await driver.deleteRows(params.schema, params.table, params.where);
        return { content: [{ type: "text", text: JSON.stringify({ rowCount }) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_execute_sql",
    {
      description: "Execute arbitrary SQL (DDL/DML). Use for advanced operations. Prefer specific tools when possible.",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        sql: z.string().describe("SQL statement(s)"),
        params: z.array(z.unknown()).optional().describe("Query parameters"),
      },
    },
    async (params: { database: string; sql: string; params?: unknown[] }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        const result = await driver.execute(params.sql, params.params);
        return { content: [{ type: "text", text: JSON.stringify({ rows: result.rows, rowCount: result.rowCount }, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );
}
