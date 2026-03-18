# PostgreSQL Reference

Engine-specific details for the database MCP when `DB_TYPE=postgres`.

## Column Types

| Type | Use for |
|------|---------|
| uuid | Primary keys (use `gen_random_uuid()` or pgcrypto) |
| varchar(n), text | Strings |
| int, bigint | Integers |
| timestamptz | Timestamps with timezone |
| boolean | true/false |
| json, jsonb | JSON data |

## Extensions

- **pgcrypto**: `gen_random_uuid()` for UUID defaults
- **uuid-ossp**: `uuid_generate_v4()` (requires extension; name has hyphen, use `db_execute_sql` if driver rejects)

## Triggers

```sql
-- Function (no args for trigger)
CREATE OR REPLACE FUNCTION schema.fn_name() RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
CREATE TRIGGER trigger_name BEFORE UPDATE ON schema.table
FOR EACH ROW EXECUTE FUNCTION schema.fn_name();
```

## Soft Delete (RULE)

```sql
CREATE RULE rule_name AS ON DELETE TO schema.table
DO INSTEAD (UPDATE schema.table SET "deletedAt" = now(), "updatedAt" = now()
WHERE id = OLD.id AND "deletedAt" IS NULL);
```

## Identifier Validation

Driver validates: `^[a-zA-Z_][a-zA-Z0-9_]*$`. Hyphens not allowed (e.g. `uuid-ossp` extension name fails via `db_create_extension`; use `db_execute_sql`).

## Quoted Identifiers

Use double quotes for camelCase: `"createdAt"`, `"updatedAt"`, `"deletedAt"`.
