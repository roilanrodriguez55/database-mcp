import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { ConnectionManager } from "./connection-manager.js";
import { registerAllTools } from "./tools/index.js";
import { log } from "./logger.js";

let connectionManager: ConnectionManager;

async function main() {
  const { migrationsDir, migrationsEnabled } = loadConfig();
  connectionManager = new ConnectionManager(migrationsDir, migrationsEnabled);

  const server = new McpServer({
    name: "database-mcp",
    version: "1.0.0",
  });

  registerAllTools(server, connectionManager, migrationsDir);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("info", "server.start", { version: "1.0.0" });
}

main().catch((err) => {
  log("error", "server.error", { message: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});

process.on("SIGINT", async () => {
  log("info", "server.shutdown", {});
  if (connectionManager) {
    await connectionManager.closeAll();
  }
  process.exit(0);
});
