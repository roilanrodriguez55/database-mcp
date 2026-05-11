---
name: database-mcp
description: Guides AI models to correctly use the database MCP server for schema design, CRUD, migrations, and auth. Use when working with databases via MCP, creating tables/schemas, running migrations, managing roles, or when the user mentions database operations, PostgreSQL, MySQL, SQLite, or Microsoft Access.
compatibility: cursor, claude-code, opencode, antigravity, gemini-cli
---

# Database MCP Usage

MCP server for database operations. Supports **PostgreSQL**, **MySQL**, **SQLite**, and **Microsoft Access**.

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
| **Triggers** | db_list_triggers, db_create_trigger, db_drop_trigger | Automation (Postgres, MySQL, SQLite only) |
| **Functions** | db_list_functions, db_create_function, db_drop_function | Stored logic (Postgres, MySQL only) |
| **Extensions** | db_list_extensions, db_create_extension, db_drop_extension | e.g. pgcrypto, uuid-ossp (Postgres only) |
| **Auth** | db_list_roles, db_create_role, db_grant_schema, db_grant_table, etc. | Permissions (Postgres, MySQL only) |
| **Migrations** | db_list_migrations, db_apply_migration, db_apply_all_migrations | Schema versioning |

## Workflows

### Create table with full CRUD support

1. `db_create_schema` (if needed — not applicable to SQLite or Access)
2. `db_create_table` with columns, primaryKey, constraints
3. For timestamps: use `DEFAULT now()` and create trigger for `updatedAt` (Postgres/MySQL/SQLite only)
4. For soft delete: use `db_execute_sql` with a RULE or UPDATE trigger

### Migrations

- DDL changes are auto-recorded to `migrations/` when `MIGRATIONS_ENABLED=true`
- Recorded SQL is **idempotent** (IF NOT EXISTS, DROP IF EXISTS before CREATE)
- Before applying: `db_list_migrations` to see pending
- Apply: `db_apply_all_migrations` or `db_apply_migration` with filename

### Roles and permissions (Postgres / MySQL only)

1. `db_create_role` (name, login if needed)
2. `db_grant_schema` (USAGE on schema)
3. `db_grant_table` (SELECT, INSERT, UPDATE, DELETE, or ALL)

## Best Practices

- **Prefer specific tools** over `db_execute_sql` when available (better migration recording)
- **db_execute_sql** for CREATE RULE, custom functions, or engine-specific DDL
- **Identifiers**: use valid names (letters, digits, underscore); camelCase supported
- **Schema**: default is `public` for Postgres; `main` for SQLite; `default` (virtual) for Access
- **Soft delete**: use RULE (Postgres) or trigger (MySQL/SQLite); Access has no SQL triggers

## Engine Support Matrix

| Feature | PostgreSQL | MySQL | SQLite | Access |
|---------|:---:|:---:|:---:|:---:|
| Schemas | ✅ | ✅ (databases) | ✅ (attached) | ❌ (virtual `default`) |
| Tables / DDL | ✅ | ✅ | ✅ | ✅ |
| Indexes | ✅ | ✅ | ✅ | ✅ |
| Views | ✅ | ✅ | ✅ | ✅ |
| Triggers | ✅ | ✅ | ✅ | ❌ |
| Functions | ✅ | ✅ | ❌ | ❌ |
| Extensions | ✅ | ❌ | ❌ | ❌ |
| Sequences | ✅ | ❌ | ❌ | ❌ |
| Roles / Grants | ✅ | ✅ | ❌ | ❌ |

## Engine-Specific Notes

- **PostgreSQL**: See [references/postgres.md](references/postgres.md) for types, extensions, triggers, best practices
- **MySQL**: See [references/mysql.md](references/mysql.md) for types, syntax differences, auth
- **SQLite**: See [references/sqlite.md](references/sqlite.md) for type affinity, limitations, file-based usage
- **Microsoft Access**: See [references/access.md](references/access.md) for JET types, ODBC setup, limitations
- **Tool parameters**: See [references/tools-reference.md](references/tools-reference.md) for common params

## Environment

- `DATABASE_URL` or `DB_CONNECTION` required (connection string for the target engine)
- `DB_TYPE` must be one of: `postgres`, `mysql`, `sqlite`, `access`
- `MIGRATIONS_ENABLED` (default true) toggles auto-recording

### Connection string examples

| Engine | Example |
|--------|---------|
| PostgreSQL | `postgresql://user:pass@host:5432/db` |
| MySQL | `mysql://user:pass@host:3306/db` |
| SQLite | `/path/to/file.db` |
| Access | `C:\path\to\file.accdb` or full ODBC string |

## Multi-Platform

This skill follows the [Agent Skills](https://agentskills.io/) standard. It is available in:

| Platform | Location |
|----------|----------|
| **Cursor** | `.cursor/skills/database-mcp/` |
| **Claude Code** | `.claude/skills/database-mcp/` |
| **OpenCode** | `.opencode/skills/` or `.agents/skills/` or `.claude/skills/` |
| **Antigravity / Gemini CLI** | `.agent/skills/database-mcp/` |

Canonical source: `skills/database-mcp/`. Symlinks point from each platform path to the canonical folder. Run `npm run setup:skills` to create links (Unix/macOS).
