---
name: database-mcp
description: Guides AI models to correctly use the database MCP server for schema design, CRUD, migrations, and auth. Use when working with databases via MCP, creating tables/schemas, running migrations, managing roles, or when the user mentions database operations, PostgreSQL, MySQL, or SQLite.
compatibility: cursor, claude-code, opencode, antigravity, gemini-cli
---

# Database MCP Usage

MCP server for database operations. Supports **PostgreSQL**, **MySQL 8+**, and **SQLite 3**. Manages multiple databases simultaneously via `databases.json`.

## Before Using Tools

**Every tool requires a `database` parameter** — the `name` field from `databases.json`. Always pass it.

The MCP server name may be `user-database`, `database`, or similar depending on configuration. Discover available tools via the MCP tool descriptors.

## Tool Groups

| Group | Tools | PostgreSQL | MySQL | SQLite |
|-------|-------|:---:|:---:|:---:|
| **Databases** | db_list_databases, db_get_database | ✓ | ✓ | ✓ |
| **Schemas** | db_list_schemas, db_create_schema, db_get_schema, db_alter_schema, db_drop_schema | ✓ | ✓ | ✓ |
| **Tables** | db_list_tables, db_create_table, db_get_table, db_alter_table, db_drop_table | ✓ | ✓ | ✓ |
| **Data** | db_query, db_insert, db_update, db_delete | ✓ | ✓ | ✓ |
| **Raw SQL** | db_execute_sql | ✓ | ✓ | ✓ |
| **Indexes** | db_list_indexes, db_create_index, db_drop_index | ✓ | ✓ | ✓ |
| **Views** | db_list_views, db_create_view, db_get_view, db_drop_view | ✓ | ✓ | — |
| **Triggers** | db_list_triggers, db_create_trigger, db_drop_trigger | ✓ | — | — |
| **Functions** | db_list_functions, db_create_function, db_drop_function | ✓ | — | — |
| **Sequences** | db_list_sequences, db_create_sequence, db_drop_sequence | ✓ | — | — |
| **Extensions** | db_list_extensions, db_create_extension, db_drop_extension | ✓ | — | — |
| **Auth** | db_list_roles, db_create_role, db_grant_schema, db_grant_table, etc. | ✓ | ✓ | — |
| **Migrations** | db_list_migrations, db_apply_migration, db_apply_all_migrations | ✓ | ✓ | ✓ |

## Workflows

### Discover configured databases

Always start by checking what databases are available:
```
db_list_databases → pick a name → pass it as `database` in every subsequent call
```

### Create table with full CRUD support

1. `db_create_schema` (if needed, e.g. `api`) — PostgreSQL/MySQL only
2. `db_create_table` with columns, primaryKey, constraints
3. For timestamps (PostgreSQL): use `DEFAULT now()` and create trigger for `updatedAt`
4. For soft delete (PostgreSQL): use `db_execute_sql` with `CREATE RULE ... DO INSTEAD (UPDATE ... SET deletedAt = now())`

### Migrations

- DDL changes are auto-recorded to `migrations/` when `MIGRATIONS_ENABLED=true`
- Recorded SQL is **idempotent** (IF NOT EXISTS, DROP IF EXISTS before CREATE)
- Before applying: `db_list_migrations` to see pending
- Apply: `db_apply_all_migrations` or `db_apply_migration` with filename

### Roles and permissions

1. `db_create_role` (name, login if needed)
2. `db_grant_schema` (USAGE on schema)
3. `db_grant_table` (SELECT, INSERT, UPDATE, DELETE, or ALL)

## Best Practices

- **Prefer specific tools** over `db_execute_sql` when available (better migration recording)
- **db_execute_sql** for CREATE RULE, custom functions, or engine-specific DDL
- **Identifiers**: use valid names (letters, digits, underscore); camelCase supported
- **Schema**: default is `public`; use `api` or custom for API-exposed tables
- **Soft delete**: RULE converts DELETE to UPDATE; filter with `WHERE deletedAt IS NULL`

## Engine-Specific Notes

- **PostgreSQL**: See [references/postgres.md](references/postgres.md) for types, extensions, triggers
- **MySQL**: Use backtick identifiers in raw SQL; no triggers/functions/sequences via MCP tools — use `db_execute_sql`
- **SQLite**: Single-file model; no roles, sequences, triggers, extensions; use absolute path in `connectionString`
- **Tool parameters**: See [references/tools-reference.md](references/tools-reference.md) for common params

## Configuration (`databases.json`)

All databases are declared in `databases.json` at the project root:

```json
[
  {
    "name": "my_pg",
    "connectionString": "postgresql://user:pass@host:5432/db",
    "dbType": "postgres"
  },
  {
    "name": "my_mysql",
    "connectionString": "mysql://user:pass@host:3306/db",
    "dbType": "mysql"
  },
  {
    "name": "my_sqlite",
    "connectionString": "/absolute/path/to/app.db",
    "dbType": "sqlite"
  }
]
```

Optional fields: `description`, `enabled` (default `true`), `readonly` (default `false`).

Environment variables (still supported):
- `MIGRATIONS_ENABLED` (default `true`) — toggles auto-recording of DDL
- `MIGRATIONS_DIR` (default `./migrations`) — where migration files are saved

## Docker

See [references/docker.md](references/docker.md) for full setup. Quick reference:

```json
{
  "mcpServers": {
    "database": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-v", "/absolute/path/to/databases.json:/app/databases.json",
        "database-mcp"
      ]
    }
  }
}
```

- Replace `localhost` with `host.docker.internal` in connection strings when the DB runs on the host machine
- For SQLite: add `-v /path/to/app.db:/data/app.db` and set `connectionString` to `/data/app.db`

## Multi-Platform

This skill follows the [Agent Skills](https://agentskills.io/) standard. It is available in:

| Platform | Location |
|----------|----------|
| **Cursor** | `.cursor/skills/database-mcp/` |
| **Claude Code** | `.claude/skills/database-mcp/` |
| **OpenCode** | `.opencode/skills/` or `.agents/skills/` or `.claude/skills/` |
| **Antigravity / Gemini CLI** | `.agent/skills/database-mcp/` |

Canonical source: `skills/database-mcp/`. Symlinks point from each platform path to the canonical folder. Run `npm run setup:skills` to create links (Unix/macOS).
