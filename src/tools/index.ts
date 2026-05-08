import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConnectionManager } from "../connection-manager.js";
import { registerSchemaTools } from "./schemas.js";
import { registerTableTools } from "./tables.js";
import { registerIndexTools } from "./indexes.js";
import { registerViewTools } from "./views.js";
import { registerSequenceTools } from "./sequences.js";
import { registerTriggerTools } from "./triggers.js";
import { registerFunctionTools } from "./functions.js";
import { registerExtensionTools } from "./extensions.js";
import { registerDataTools } from "./data.js";
import { registerAuthTools } from "./auth.js";
import { registerMigrationTools } from "./migrations.js";
import { registerDatabaseTools } from "./databases.js";

export function registerAllTools(
  server: McpServer,
  connectionManager: ConnectionManager,
  migrationsDir: string
): void {
  registerDatabaseTools(server, connectionManager);
  registerSchemaTools(server, connectionManager);
  registerTableTools(server, connectionManager);
  registerIndexTools(server, connectionManager);
  registerViewTools(server, connectionManager);
  registerSequenceTools(server, connectionManager);
  registerTriggerTools(server, connectionManager);
  registerFunctionTools(server, connectionManager);
  registerExtensionTools(server, connectionManager);
  registerDataTools(server, connectionManager);
  registerAuthTools(server, connectionManager);
  registerMigrationTools(server, connectionManager, migrationsDir);
}
