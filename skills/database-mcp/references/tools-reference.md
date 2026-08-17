# Tools Quick Reference

Read tool schemas in `mcps/<server>/tools/*.json` for exact parameters.

## Universal Parameter

**`database`** (required on every tool) — the `name` field from `databases.json`.

```json
{ "database": "my_pg", "schema": "public", "name": "users" }
```

Always call `db_list_databases` first if you don't know the available names.

## Common Parameters

| Tool                | Key params                                                                          |
| ------------------- | ----------------------------------------------------------------------------------- |
| db_create_table     | database, schema, name, columns (name, type, nullable?, default?), primaryKey?, constraints? |
| db_insert           | database, schema, table, rows (array of objects)                                    |
| db_update           | database, schema, table, set, where?                                                |
| db_delete           | database, schema, table, where? (omit = delete all)                                 |
| db_query            | database, query (SELECT), params?                                                   |
| db_execute_sql      | database, sql, params?                                                              |
| db_create_trigger   | database, schema, table, name, timing (BEFORE/AFTER), event (INSERT/UPDATE/DELETE), function |
| db_grant_table      | database, schema, table, role, privileges (SELECT, INSERT, UPDATE, DELETE, ALL)     |
| db_create_extension | database, name, schema?                                                             |

## Engine Support Matrix

| Tool group      | PostgreSQL | MySQL | SQLite |
|----------------|:---:|:---:|:---:|
| Tables / Data / Indexes | ✓ | ✓ | ✓ |
| Schemas         | ✓ | ✓ (= databases) | ✓ (attached DBs) |
| Views           | ✓ | ✓ | — |
| Triggers        | ✓ | — | — |
| Functions       | ✓ | — | — |
| Sequences       | ✓ | — | — |
| Extensions      | ✓ | — | — |
| Auth / Roles    | ✓ | ✓ | — |
| Migrations      | ✓ | ✓ | ✓ |

For unsupported operations on MySQL/SQLite, fall back to `db_execute_sql`.

## Migration Recording

When `MIGRATIONS_ENABLED=true`, these tools auto-record idempotent SQL:

- create_table → `CREATE TABLE IF NOT EXISTS`
- create_trigger → `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`
- create_view → `CREATE OR REPLACE VIEW`
- execute_sql + CREATE RULE → prepends `DROP RULE IF EXISTS`

