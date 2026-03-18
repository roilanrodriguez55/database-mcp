# Database MCP Server

MCP server for database operations. Supports PostgreSQL initially, with an extensible architecture for other engines (MySQL, SQLite, etc.).

## Requirements

- Node.js >= 18
- PostgreSQL (or compatible database)

## Installation

```bash
npm install
```

## Configuration

Set environment variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Connection string (e.g. `postgresql://user:pass@host:5432/db`) |
| `DB_TYPE` | Database type: `postgres` (default) |
| `MIGRATIONS_ENABLED` | Auto-record DDL changes to migration files (default: `true`) |
| `MIGRATIONS_DIR` | Migrations directory (default: `./migrations`) |

Copy `.env.example` to `.env` and edit:

```bash
cp .env.example .env
```

## Usage

### Run the server

```bash
npm start
# or
npx tsx src/index.ts
```

### MCP configuration by editor

Replace `PATH_TO_PROJECT` with the absolute path to this project (e.g. `/home/user/postgresql-mcp`). When the project is your current workspace, VS Code supports `${workspaceFolder}`.

#### Cursor

Add to Cursor MCP settings (`.cursor/mcp.json` or Settings → MCP):

```json
{
  "mcpServers": {
    "database": {
      "command": "npx",
      "args": ["tsx", "PATH_TO_PROJECT/src/index.ts"],
      "env": {
        "DATABASE_URL": "postgresql://user:password@localhost:5432/mydb"
      }
    }
  }
}
```

#### Claude Code

Add a local stdio server via CLI:

```bash
claude mcp add --transport stdio --env DATABASE_URL=postgresql://user:password@localhost:5432/mydb database -- npx tsx PATH_TO_PROJECT/src/index.ts
```

Or add to `.mcp.json` in the project root (for project scope):

```json
{
  "mcpServers": {
    "database": {
      "command": "npx",
      "args": ["tsx", "PATH_TO_PROJECT/src/index.ts"],
      "env": {
        "DATABASE_URL": "postgresql://user:password@localhost:5432/mydb"
      }
    }
  }
}
```

#### VS Code

Add to `.vscode/mcp.json` (workspace) or user `mcp.json` (Command Palette → MCP: Open User Configuration):

```json
{
  "servers": {
    "database": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "PATH_TO_PROJECT/src/index.ts"],
      "env": {
        "DATABASE_URL": "postgresql://user:password@localhost:5432/mydb"
      }
    }
  }
}
```

Optional: use `envFile` to load from `.env` and `${workspaceFolder}` when this project is the workspace:

```json
{
  "servers": {
    "database": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "${workspaceFolder}/src/index.ts"],
      "envFile": "${workspaceFolder}/.env"
    }
  }
}
```

#### Zed

Add to `settings.json` (Command Palette → Preferences: Open User Settings):

```json
{
  "context_servers": {
    "database": {
      "source": "custom",
      "command": "npx",
      "args": ["tsx", "PATH_TO_PROJECT/src/index.ts"],
      "env": {
        "DATABASE_URL": "postgresql://user:password@localhost:5432/mydb"
      }
    }
  }
}
```

#### OpenCode

Add to `opencode.json` or `opencode.jsonc` in the project root:

```json
{
  "mcp": {
    "database": {
      "type": "local",
      "command": ["npx", "tsx", "PATH_TO_PROJECT/src/index.ts"],
      "enabled": true,
      "environment": {
        "DATABASE_URL": "postgresql://user:password@localhost:5432/mydb"
      }
    }
  }
}
```

## Tools

### Schemas
- `db_list_schemas` - List schemas
- `db_create_schema` - Create schema
- `db_get_schema` - Get schema details
- `db_alter_schema` - Rename schema
- `db_drop_schema` - Drop schema

### Tables
- `db_list_tables` - List tables
- `db_create_table` - Create table
- `db_get_table` - Get table details
- `db_alter_table` - Alter table
- `db_drop_table` - Drop table

### Indexes, Views, Sequences, Triggers, Functions, Extensions
- `db_list_*` / `db_create_*` / `db_drop_*` for each type

### Data
- `db_query` - Execute SELECT
- `db_insert` - Insert rows
- `db_update` - Update rows
- `db_delete` - Delete rows
- `db_execute_sql` - Execute arbitrary SQL

### Auth (roles and permissions)
- `db_list_roles` - List roles
- `db_create_role` - Create role
- `db_create_user` - Create user (role with LOGIN)
- `db_alter_role` - Alter role
- `db_drop_role` - Drop role
- `db_grant_role_membership` - Grant role to role
- `db_revoke_role_membership` - Revoke role membership
- `db_grant_schema` - Grant USAGE/CREATE on schema
- `db_revoke_schema` - Revoke schema privileges
- `db_grant_table` - Grant SELECT/INSERT/UPDATE/DELETE on table
- `db_revoke_table` - Revoke table privileges
- `db_grant_all_tables_in_schema` - Grant on all tables in schema
- `db_revoke_all_tables_in_schema` - Revoke on all tables in schema
- `db_list_grants` - List grants for a role

### Migrations
- `db_list_migrations` - List applied and pending migrations
- `db_apply_migration` - Apply a single migration by filename
- `db_apply_all_migrations` - Apply all pending migrations (sync DB)

Each DDL change (create schema, table, index, etc.) is automatically recorded to `migrations/` when `MIGRATIONS_ENABLED=true`.

## Agent Skill (multi-platform)

The `database-mcp` skill helps AI models use this MCP correctly. It works in **Cursor**, **Claude Code**, **OpenCode**, **Antigravity**, and **Gemini CLI**.

```bash
npm run setup:skills
```

This creates symlinks so the skill is discoverable in each platform's expected path. Canonical source: `skills/database-mcp/`.

## Build

```bash
npm run build
```
