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

export function registerExtensionTools(
  server: McpServer,
  driver: IDatabaseDriver
): void {
  server.registerTool(
    "db_list_extensions",
    {
      description: "List installed extensions",
      inputSchema: {},
    },
    wrapHandler(async () => {
      const extensions = await driver.listExtensions();
      return {
        content: [{ type: "text", text: JSON.stringify(extensions, null, 2) }],
      };
    })
  );

  server.registerTool(
    "db_create_extension",
    {
      description: "Install an extension",
      inputSchema: {
        name: z.string().describe("Extension name"),
        schema: z.string().optional().describe("Schema to install into"),
      },
    },
    wrapHandler(async ({ name, schema }) => {
      await driver.createExtension(name, schema);
      return {
        content: [{ type: "text", text: `Extension "${name}" installed` }],
      };
    })
  );

  server.registerTool(
    "db_drop_extension",
    {
      description: "Remove an extension",
      inputSchema: {
        name: z.string().describe("Extension name"),
      },
    },
    wrapHandler(async ({ name }) => {
      await driver.dropExtension(name);
      return {
        content: [{ type: "text", text: `Extension "${name}" removed` }],
      };
    })
  );
}
