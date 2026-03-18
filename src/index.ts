import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createDriver } from "./drivers/factory.js";
import { recordMigration } from "./migrations/recorder.js";
import { registerAllTools } from "./tools/index.js";

async function main() {
  const { databaseUrl, dbType, migrationsDir, migrationsEnabled } = loadConfig();
  const migrationRecorder = migrationsEnabled
    ? async (sql: string, desc: string) => {
        try {
          await recordMigration(migrationsDir, sql, desc);
        } catch (err) {
          console.error("[MCP Migrations] Failed to record:", err);
        }
      }
    : undefined;
  const driver = createDriver(dbType, databaseUrl, { migrationRecorder });

  const server = new McpServer({
    name: "database-mcp",
    version: "1.0.0",
  });

  registerAllTools(server, driver, migrationsDir);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server error:", err);
  process.exit(1);
});
