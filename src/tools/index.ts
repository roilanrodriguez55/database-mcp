import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IDatabaseDriver } from "../drivers/types.js";
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

export function registerAllTools(
  server: McpServer,
  driver: IDatabaseDriver,
  migrationsDir: string
): void {
  registerSchemaTools(server, driver);
  registerTableTools(server, driver);
  registerIndexTools(server, driver);
  registerViewTools(server, driver);
  registerSequenceTools(server, driver);
  registerTriggerTools(server, driver);
  registerFunctionTools(server, driver);
  registerExtensionTools(server, driver);
  registerDataTools(server, driver);
  registerAuthTools(server, driver);
  registerMigrationTools(server, driver, migrationsDir);
}
