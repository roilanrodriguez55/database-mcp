import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ConnectionManager } from "../connection-manager.js";
import { z } from "zod";

export function registerAuthTools(
  server: McpServer,
  connectionManager: ConnectionManager
): void {
  server.registerTool(
    "db_list_roles",
    {
      description: "List all database roles",
      inputSchema: { database: z.string().describe("Database name from databases.json") },
    },
    async (params: { database: string }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        const roles = await driver.listRoles();
        return { content: [{ type: "text", text: JSON.stringify(roles, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_create_role",
    {
      description: "Create a database role",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        name: z.string().describe("Role name"),
        login: z.boolean().optional().describe("Can login (default: false)"),
        password: z.string().optional().describe("Password for login roles"),
        superuser: z.boolean().optional().describe("Superuser privileges"),
        createdb: z.boolean().optional().describe("Can create databases"),
        createrole: z.boolean().optional().describe("Can create roles"),
      },
    },
    async (params: { database: string; name: string; login?: boolean; password?: string; superuser?: boolean; createdb?: boolean; createrole?: boolean }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.createRole(params.name, { login: params.login, password: params.password, superuser: params.superuser, createdb: params.createdb, createrole: params.createrole });
        return { content: [{ type: "text", text: `Role "${params.name}" created` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_create_user",
    {
      description: "Create a database user (role with LOGIN)",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        name: z.string().describe("User/role name"),
        password: z.string().describe("Password"),
        createdb: z.boolean().optional().describe("Can create databases"),
        createrole: z.boolean().optional().describe("Can create roles"),
      },
    },
    async (params: { database: string; name: string; password: string; createdb?: boolean; createrole?: boolean }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.createRole(params.name, { login: true, password: params.password, createdb: params.createdb, createrole: params.createrole });
        return { content: [{ type: "text", text: `User "${params.name}" created` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_alter_role",
    {
      description: "Alter a role",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        name: z.string().describe("Role name"),
        password: z.string().optional().describe("New password"),
        login: z.boolean().optional().describe("Can login"),
        createdb: z.boolean().optional().describe("Can create databases"),
        createrole: z.boolean().optional().describe("Can create roles"),
      },
    },
    async (params: { database: string; name: string; password?: string; login?: boolean; createdb?: boolean; createrole?: boolean }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.alterRole(params.name, { password: params.password, login: params.login, createdb: params.createdb, createrole: params.createrole });
        return { content: [{ type: "text", text: `Role "${params.name}" altered` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_drop_role",
    {
      description: "Drop a role",
      inputSchema: { database: z.string().describe("Database name from databases.json"), name: z.string().describe("Role name") },
    },
    async (params: { database: string; name: string }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.dropRole(params.name);
        return { content: [{ type: "text", text: `Role "${params.name}" dropped` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_grant_role_membership",
    {
      description: "Grant a role to another role (membership)",
      inputSchema: {
        database: z.string().describe("Database name from databases.json"),
        roleToGrant: z.string().describe("Role to grant"),
        granteeRole: z.string().describe("Role that receives the grant"),
      },
    },
    async (params: { database: string; roleToGrant: string; granteeRole: string }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.grantRoleMembership(params.roleToGrant, params.granteeRole);
        return { content: [{ type: "text", text: `Role "${params.roleToGrant}" granted to "${params.granteeRole}"` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_revoke_role_membership",
    {
      description: "Revoke role membership",
      inputSchema: { database: z.string().describe("Database name from databases.json"), roleToRevoke: z.string().describe("Role to revoke"), revokeeRole: z.string().describe("Role to revoke from") },
    },
    async (params: { database: string; roleToRevoke: string; revokeeRole: string }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.revokeRoleMembership(params.roleToRevoke, params.revokeeRole);
        return { content: [{ type: "text", text: `Role "${params.roleToRevoke}" revoked from "${params.revokeeRole}"` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_grant_schema",
    {
      description: "Grant schema privileges (USAGE, CREATE) to a role",
      inputSchema: { database: z.string().describe("Database name from databases.json"), schema: z.string().describe("Schema name"), role: z.string().describe("Role name"), privileges: z.array(z.enum(["USAGE", "CREATE"])).describe("Privileges") },
    },
    async (params: { database: string; schema: string; role: string; privileges: string[] }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.grantSchema(params.schema, params.role, params.privileges);
        return { content: [{ type: "text", text: `Schema "${params.schema}" privileges granted to "${params.role}"` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_revoke_schema",
    {
      description: "Revoke schema privileges from a role",
      inputSchema: { database: z.string().describe("Database name from databases.json"), schema: z.string().describe("Schema name"), role: z.string().describe("Role name"), privileges: z.array(z.enum(["USAGE", "CREATE"])).optional().describe("Privileges to revoke") },
    },
    async (params: { database: string; schema: string; role: string; privileges?: string[] }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.revokeSchema(params.schema, params.role, params.privileges);
        return { content: [{ type: "text", text: `Schema "${params.schema}" privileges revoked from "${params.role}"` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_grant_table",
    {
      description: "Grant table privileges to a role",
      inputSchema: { database: z.string().describe("Database name from databases.json"), schema: z.string().describe("Schema name"), table: z.string().describe("Table name"), role: z.string().describe("Role name"), privileges: z.array(z.enum(["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"])).describe("Privileges") },
    },
    async (params: { database: string; schema: string; table: string; role: string; privileges: string[] }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.grantTable(params.schema, params.table, params.role, params.privileges);
        return { content: [{ type: "text", text: `Table "${params.schema}"."${params.table}" privileges granted to "${params.role}"` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_revoke_table",
    {
      description: "Revoke table privileges from a role",
      inputSchema: { database: z.string().describe("Database name from databases.json"), schema: z.string().describe("Schema name"), table: z.string().describe("Table name"), role: z.string().describe("Role name"), privileges: z.array(z.enum(["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"])).optional().describe("Privileges") },
    },
    async (params: { database: string; schema: string; table: string; role: string; privileges?: string[] }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.revokeTable(params.schema, params.table, params.role, params.privileges);
        return { content: [{ type: "text", text: `Table "${params.schema}"."${params.table}" privileges revoked from "${params.role}"` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_grant_all_tables_in_schema",
    {
      description: "Grant privileges on all tables in a schema to a role",
      inputSchema: { database: z.string().describe("Database name from databases.json"), schema: z.string().describe("Schema name"), role: z.string().describe("Role name"), privileges: z.array(z.enum(["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"])).describe("Privileges") },
    },
    async (params: { database: string; schema: string; role: string; privileges: string[] }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.grantAllTablesInSchema(params.schema, params.role, params.privileges);
        return { content: [{ type: "text", text: `All tables in schema "${params.schema}" granted to "${params.role}"` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_revoke_all_tables_in_schema",
    {
      description: "Revoke privileges on all tables in a schema from a role",
      inputSchema: { database: z.string().describe("Database name from databases.json"), schema: z.string().describe("Schema name"), role: z.string().describe("Role name"), privileges: z.array(z.enum(["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"])).optional().describe("Privileges") },
    },
    async (params: { database: string; schema: string; role: string; privileges?: string[] }) => {
      try {
        connectionManager.assertWritable(params.database);
        const driver = connectionManager.getDatabase(params.database);
        await driver.revokeAllTablesInSchema(params.schema, params.role, params.privileges);
        return { content: [{ type: "text", text: `All tables in schema "${params.schema}" revoked from "${params.role}"` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );

  server.registerTool(
    "db_list_grants",
    {
      description: "List all grants for a role (table privileges)",
      inputSchema: { database: z.string().describe("Database name from databases.json"), role: z.string().describe("Role name") },
    },
    async (params: { database: string; role: string }) => {
      try {
        const driver = connectionManager.getDatabase(params.database);
        const grants = await driver.listGrantsForRole(params.role);
        return { content: [{ type: "text", text: JSON.stringify(grants, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: msg }], isError: true };
      }
    }
  );
}
