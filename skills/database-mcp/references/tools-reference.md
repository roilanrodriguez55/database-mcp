# Tools Quick Reference

Read tool schemas in `mcps/<server>/tools/*.json` for exact parameters.

## Common Parameters

| Tool | Key params |
|------|------------|
| db_create_table | schema, name, columns (name, type, nullable?, default?), primaryKey?, constraints? |
| db_insert | schema, table, rows (array of objects) |
| db_update | schema, table, set, where? |
| db_delete | schema, table, where? (omit = delete all) |
| db_query | query (SELECT), params? |
| db_execute_sql | sql, params? |
| db_create_trigger | schema, table, name, timing (BEFORE/AFTER), event (INSERT/UPDATE/DELETE), function |
| db_grant_table | schema, table, role, privileges (SELECT, INSERT, UPDATE, DELETE, ALL) |
| db_create_extension | name, schema? |

## Migration Recording

When `MIGRATIONS_ENABLED=true`, these tools auto-record idempotent SQL:

- create_table → `CREATE TABLE IF NOT EXISTS`
- create_trigger → `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`
- create_view → `CREATE OR REPLACE VIEW`
- execute_sql + CREATE RULE → prepends `DROP RULE IF EXISTS`
