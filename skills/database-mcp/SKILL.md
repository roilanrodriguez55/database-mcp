---
name: database-mcp
description: Guides AI models to correctly use the database MCP server for schema design, CRUD, migrations, and auth. Use when working with databases via MCP, creating tables/schemas, running migrations, managing roles, or when the user mentions database operations, PostgreSQL, or future engines (MySQL, SQLite).
compatibility: cursor, claude-code, opencode, antigravity, gemini-cli
---

# Database MCP Usage

MCP server for database operations. Currently supports **PostgreSQL**; architecture is extensible for MySQL, SQLite, and other engines.

## Before Using Tools

**Always check the tool schema** in `mcps/<server>/tools/*.json` before calling. Required parameters and types vary per tool.

The MCP server name may be `user-database`, `database`, or similar depending on configuration. Discover available tools via the MCP tool descriptors.

## Tool Groups

| Group | Tools | Use for |
|-------|-------|---------|
| **Schemas** | db_list_schemas, db_create_schema, db_get_schema, db_alter_schema, db_drop_schema | Namespaces (e.g. `api`, `public`) |
| **Tables** | db_list_tables, db_create_table, db_get_table, db_alter_table, db_drop_table | DDL |
| **Data** | db_query, db_insert, db_update, db_delete | CRUD |
| **Raw SQL** | db_execute_sql | DDL/DML when no specific tool exists |
| **Indexes** | db_list_indexes, db_create_index, db_drop_index | Performance |
| **Views** | db_list_views, db_create_view, db_get_view, db_drop_view | Virtual tables |
| **Triggers** | db_list_triggers, db_create_trigger, db_drop_trigger | Automation |
| **Functions** | db_list_functions, db_create_function, db_drop_function | Stored logic |
| **Extensions** | db_list_extensions, db_create_extension, db_drop_extension | e.g. pgcrypto, uuid-ossp |
| **Auth** | db_list_roles, db_create_role, db_grant_schema, db_grant_table, etc. | Permissions |
| **Migrations** | db_list_migrations, db_apply_migration, db_apply_all_migrations | Schema versioning |

## Workflows

### Create table with full CRUD support

1. `db_create_schema` (if needed, e.g. `api`)
2. `db_create_table` with columns, primaryKey, constraints
3. For timestamps: use `DEFAULT now()` and create trigger for `updatedAt`
4. For soft delete: use `db_execute_sql` with `CREATE RULE ... DO INSTEAD (UPDATE ... SET deletedAt = now())`

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
- **Future engines**: When MySQL, SQLite, etc. are added, see `references/mysql.md`, `references/sqlite.md`
- **Tool parameters**: See [references/tools-reference.md](references/tools-reference.md) for common params

## Environment

- `DATABASE_URL` required (e.g. `postgresql://user:pass@host:5432/db`)
- `DB_TYPE` defaults from URL (postgres for postgresql://)
- `MIGRATIONS_ENABLED` (default true) toggles auto-recording

## Multi-Platform

This skill follows the [Agent Skills](https://agentskills.io/) standard. It is available in:

| Platform | Location |
|----------|----------|
| **Cursor** | `.cursor/skills/database-mcp/` |
| **Claude Code** | `.claude/skills/database-mcp/` |
| **OpenCode** | `.opencode/skills/` or `.agents/skills/` or `.claude/skills/` |
| **Antigravity / Gemini CLI** | `.agent/skills/database-mcp/` |

Canonical source: `skills/database-mcp/`. Symlinks point from each platform path to the canonical folder. Run `npm run setup:skills` to create links (Unix/macOS).
