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

export function registerAuthTools(
  server: McpServer,
  driver: IDatabaseDriver
): void {
  // Roles
  server.registerTool(
    "db_list_roles",
    {
      description: "List all database roles",
      inputSchema: {},
    },
    wrapHandler(async () => {
      const roles = await driver.listRoles();
      return {
        content: [{ type: "text", text: JSON.stringify(roles, null, 2) }],
      };
    })
  );

  server.registerTool(
    "db_create_role",
    {
      description: "Create a database role",
      inputSchema: {
        name: z.string().describe("Role name"),
        login: z.boolean().optional().describe("Can login (default: false)"),
        password: z.string().optional().describe("Password for login roles"),
        superuser: z.boolean().optional().describe("Superuser privileges"),
        createdb: z.boolean().optional().describe("Can create databases"),
        createrole: z.boolean().optional().describe("Can create roles"),
      },
    },
    wrapHandler(async ({ name, login, password, superuser, createdb, createrole }) => {
      await driver.createRole(name, {
        login,
        password,
        superuser,
        createdb,
        createrole,
      });
      return {
        content: [{ type: "text", text: `Role "${name}" created` }],
      };
    })
  );

  server.registerTool(
    "db_create_user",
    {
      description: "Create a database user (role with LOGIN)",
      inputSchema: {
        name: z.string().describe("User/role name"),
        password: z.string().describe("Password"),
        createdb: z.boolean().optional().describe("Can create databases"),
        createrole: z.boolean().optional().describe("Can create roles"),
      },
    },
    wrapHandler(async ({ name, password, createdb, createrole }) => {
      await driver.createRole(name, {
        login: true,
        password,
        createdb,
        createrole,
      });
      return {
        content: [{ type: "text", text: `User "${name}" created` }],
      };
    })
  );

  server.registerTool(
    "db_alter_role",
    {
      description: "Alter a role",
      inputSchema: {
        name: z.string().describe("Role name"),
        password: z.string().optional().describe("New password"),
        login: z.boolean().optional().describe("Can login"),
        createdb: z.boolean().optional().describe("Can create databases"),
        createrole: z.boolean().optional().describe("Can create roles"),
      },
    },
    wrapHandler(async ({ name, password, login, createdb, createrole }) => {
      await driver.alterRole(name, { password, login, createdb, createrole });
      return {
        content: [{ type: "text", text: `Role "${name}" altered` }],
      };
    })
  );

  server.registerTool(
    "db_drop_role",
    {
      description: "Drop a role",
      inputSchema: {
        name: z.string().describe("Role name"),
      },
    },
    wrapHandler(async ({ name }) => {
      await driver.dropRole(name);
      return {
        content: [{ type: "text", text: `Role "${name}" dropped` }],
      };
    })
  );

  server.registerTool(
    "db_grant_role_membership",
    {
      description: "Grant a role to another role (membership)",
      inputSchema: {
        roleToGrant: z.string().describe("Role to grant"),
        granteeRole: z.string().describe("Role that receives the grant"),
      },
    },
    wrapHandler(async ({ roleToGrant, granteeRole }) => {
      await driver.grantRoleMembership(roleToGrant, granteeRole);
      return {
        content: [{ type: "text", text: `Role "${roleToGrant}" granted to "${granteeRole}"` }],
      };
    })
  );

  server.registerTool(
    "db_revoke_role_membership",
    {
      description: "Revoke role membership",
      inputSchema: {
        roleToRevoke: z.string().describe("Role to revoke"),
        revokeeRole: z.string().describe("Role to revoke from"),
      },
    },
    wrapHandler(async ({ roleToRevoke, revokeeRole }) => {
      await driver.revokeRoleMembership(roleToRevoke, revokeeRole);
      return {
        content: [{ type: "text", text: `Role "${roleToRevoke}" revoked from "${revokeeRole}"` }],
      };
    })
  );

  // Schema permissions
  server.registerTool(
    "db_grant_schema",
    {
      description: "Grant schema privileges (USAGE, CREATE) to a role",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        role: z.string().describe("Role name"),
        privileges: z
          .array(z.enum(["USAGE", "CREATE"]))
          .describe("Privileges: USAGE (access), CREATE (create objects)"),
      },
    },
    wrapHandler(async ({ schema, role, privileges }) => {
      await driver.grantSchema(schema, role, privileges);
      return {
        content: [{ type: "text", text: `Schema "${schema}" privileges granted to "${role}"` }],
      };
    })
  );

  server.registerTool(
    "db_revoke_schema",
    {
      description: "Revoke schema privileges from a role",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        role: z.string().describe("Role name"),
        privileges: z
          .array(z.enum(["USAGE", "CREATE"]))
          .optional()
          .describe("Privileges to revoke (omit for ALL)"),
      },
    },
    wrapHandler(async ({ schema, role, privileges }) => {
      await driver.revokeSchema(schema, role, privileges);
      return {
        content: [{ type: "text", text: `Schema "${schema}" privileges revoked from "${role}"` }],
      };
    })
  );

  // Table permissions (CRUD)
  server.registerTool(
    "db_grant_table",
    {
      description: "Grant table privileges (SELECT, INSERT, UPDATE, DELETE) to a role",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        table: z.string().describe("Table name"),
        role: z.string().describe("Role name"),
        privileges: z
          .array(z.enum(["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"]))
          .describe("Privileges: SELECT (read), INSERT (create), UPDATE, DELETE, or ALL"),
      },
    },
    wrapHandler(async ({ schema, table, role, privileges }) => {
      await driver.grantTable(schema, table, role, privileges);
      return {
        content: [
          {
            type: "text",
            text: `Table "${schema}"."${table}" privileges granted to "${role}"`,
          },
        ],
      };
    })
  );

  server.registerTool(
    "db_revoke_table",
    {
      description: "Revoke table privileges from a role",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        table: z.string().describe("Table name"),
        role: z.string().describe("Role name"),
        privileges: z
          .array(z.enum(["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"]))
          .optional()
          .describe("Privileges to revoke (omit for ALL)"),
      },
    },
    wrapHandler(async ({ schema, table, role, privileges }) => {
      await driver.revokeTable(schema, table, role, privileges);
      return {
        content: [
          {
            type: "text",
            text: `Table "${schema}"."${table}" privileges revoked from "${role}"`,
          },
        ],
      };
    })
  );

  server.registerTool(
    "db_grant_all_tables_in_schema",
    {
      description: "Grant privileges on all tables in a schema to a role",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        role: z.string().describe("Role name"),
        privileges: z
          .array(z.enum(["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"]))
          .describe("Privileges: SELECT, INSERT, UPDATE, DELETE, or ALL"),
      },
    },
    wrapHandler(async ({ schema, role, privileges }) => {
      await driver.grantAllTablesInSchema(schema, role, privileges);
      return {
        content: [
          {
            type: "text",
            text: `All tables in schema "${schema}" granted to "${role}"`,
          },
        ],
      };
    })
  );

  server.registerTool(
    "db_revoke_all_tables_in_schema",
    {
      description: "Revoke privileges on all tables in a schema from a role",
      inputSchema: {
        schema: z.string().describe("Schema name"),
        role: z.string().describe("Role name"),
        privileges: z
          .array(z.enum(["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"]))
          .optional()
          .describe("Privileges to revoke (omit for ALL)"),
      },
    },
    wrapHandler(async ({ schema, role, privileges }) => {
      await driver.revokeAllTablesInSchema(schema, role, privileges);
      return {
        content: [
          {
            type: "text",
            text: `All tables in schema "${schema}" revoked from "${role}"`,
          },
        ],
      };
    })
  );

  server.registerTool(
    "db_list_grants",
    {
      description: "List all grants for a role (table privileges)",
      inputSchema: {
        role: z.string().describe("Role name"),
      },
    },
    wrapHandler(async ({ role }) => {
      const grants = await driver.listGrantsForRole(role);
      return {
        content: [{ type: "text", text: JSON.stringify(grants, null, 2) }],
      };
    })
  );
}
