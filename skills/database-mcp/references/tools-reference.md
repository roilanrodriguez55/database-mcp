# Tools Quick Reference

Read tool schemas in `mcps/<server>/tools/*.json` for exact parameters.

## Common Parameters

| Tool | Key params |
|------|-----------|
| db_create_table | schema, name, columns (name, type, nullable?, default?), primaryKey?, constraints? |
| db_insert | schema, table, rows (array of objects) |
| db_update | schema, table, set, where? |
| db_delete | schema, table, where? (omit = delete all) |
| db_query | query (SELECT), params? |
| db_execute_sql | sql, params? |
| db_create_trigger | schema, table, name, timing (BEFORE/AFTER), event (INSERT/UPDATE/DELETE), function |
| db_grant_table | schema, table, role, privileges (SELECT, INSERT, UPDATE, DELETE, ALL) |
| db_create_extension | name, schema? |

## Schema Parameter by Engine

| Engine | Value to pass | Notes |
|--------|--------------|-------|
| PostgreSQL | `"public"` or custom | Real schema namespace |
| MySQL | database name (e.g. `"mydb"`) | Schema = database in MySQL |
| SQLite | `"main"` or attached db name | `"main"` for primary file |
| Access | `"default"` | Ignored internally; Access has no schemas |

## Migration Recording

When `MIGRATIONS_ENABLED=true`, these tools auto-record idempotent SQL:

- create_table → `CREATE TABLE IF NOT EXISTS` (Postgres, MySQL, SQLite) / `CREATE TABLE` (Access)
- create_trigger → `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`
- create_view → `CREATE OR REPLACE VIEW` (Postgres, MySQL) / drop+create (SQLite, Access)
- execute_sql + CREATE RULE → prepends `DROP RULE IF EXISTS`

## Engine-Specific Tool Behavior

### db_alter_table — renameTo

| Engine | Supported | Method |
|--------|-----------|--------|
| PostgreSQL | ✅ | `ALTER TABLE ... RENAME TO` |
| MySQL | ✅ | `RENAME TABLE` |
| SQLite | ✅ | `ALTER TABLE ... RENAME TO` |
| Access | ❌ | Throws — use copy+drop workaround |

### db_create_view — replace option

| Engine | OR REPLACE | Method |
|--------|-----------|--------|
| PostgreSQL | ✅ | `CREATE OR REPLACE VIEW` |
| MySQL | ✅ | `CREATE OR REPLACE VIEW` |
| SQLite | Simulated | DROP IF EXISTS + CREATE |
| Access | Simulated | DROP + CREATE |

### db_drop_index — schema param

| Engine | Schema param usage |
|--------|-------------------|
| PostgreSQL | Used as schema namespace |
| MySQL | Used to look up table from `information_schema.STATISTICS` |
| SQLite | Ignored (indexes are global in SQLite) |
| Access | Ignored — driver searches all tables to find the index |

### db_create_trigger — function param

| Engine | What to pass in `function` |
|--------|--------------------------|
| PostgreSQL | Name of an existing PL/pgSQL function (e.g. `"public.fn_updated_at()"`) |
| MySQL | Full `BEGIN ... END` body |
| SQLite | Full `BEGIN ... END` body |
| Access | Not supported |
