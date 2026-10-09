# MySQL Reference (Skill Engine)

Engine-specific details for the database MCP when `DB_TYPE=mysql`. Based on MySQL 8.x.

---

## 1. Key Differences from PostgreSQL

| Topic | PostgreSQL | MySQL |
|-------|-----------|-------|
| Identifier quoting | `"name"` | `` `name` `` |
| Schema concept | Schema within a database | Schema = Database |
| String type | `text` (no length limit) | `VARCHAR(n)` / `TEXT` |
| Auto-increment | `SERIAL` / `GENERATED` | `AUTO_INCREMENT` |
| Booleans | `boolean` | `TINYINT(1)` (no native bool) |
| JSON | `jsonb` (binary, indexable) | `JSON` (text-based, limited indexing) |
| Case sensitivity | Identifiers lowercase by default | Table names: OS-dependent |
| Rename schema | Supported | Not supported (removed in 5.1.7) |

---

## 2. Data Types

| Category | Type | Notes |
|----------|------|-------|
| **Integer** | `INT`, `BIGINT`, `TINYINT`, `SMALLINT` | `TINYINT(1)` used as boolean |
| **Decimal** | `DECIMAL(p,s)`, `NUMERIC(p,s)` | Use for money |
| **Float** | `FLOAT`, `DOUBLE` | Inexact |
| **String** | `VARCHAR(n)`, `CHAR(n)`, `TEXT`, `MEDIUMTEXT`, `LONGTEXT` | Prefer `TEXT` for long strings |
| **Date/Time** | `DATE`, `TIME`, `DATETIME`, `TIMESTAMP` | `TIMESTAMP` auto-converts to UTC |
| **JSON** | `JSON` | Supports path extraction: `col->>'$.key'` |
| **Binary** | `BINARY(n)`, `VARBINARY(n)`, `BLOB` | For raw bytes |
| **Enum** | `ENUM('a','b','c')` | MySQL-specific; prefer lookup tables |

---

## 3. Auto-Increment

MySQL uses `AUTO_INCREMENT` on a column — not a separate SEQUENCE object:

```sql
CREATE TABLE users (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL
);
```

`db_create_table` with type `BIGINT AUTO_INCREMENT` and `primaryKey: ["id"]` generates this correctly.

---

## 4. Triggers

MySQL triggers use an inline `BEGIN ... END` body (no external function needed). Pass the full body in `options.function`:

```sql
-- Example: updated_at trigger
CREATE TRIGGER trg_users_updated
BEFORE UPDATE ON mydb.users FOR EACH ROW
BEGIN
  SET NEW.updated_at = NOW();
END
```

Via `db_create_trigger`:
- `timing`: `BEFORE` or `AFTER`
- `event`: `INSERT`, `UPDATE`, or `DELETE`
- `function`: full `BEGIN ... END` block

---

## 5. Stored Functions

```sql
CREATE FUNCTION mydb.fn_full_name(first VARCHAR(100), last VARCHAR(100))
RETURNS VARCHAR(200)
DETERMINISTIC
BEGIN
  RETURN CONCAT(first, ' ', last);
END
```

Via `db_create_function`:
- `args`: `"first VARCHAR(100), last VARCHAR(100)"`
- `returns`: `"VARCHAR(200)"`
- `body`: SQL statements inside BEGIN...END (without the BEGIN/END wrapper)

---

## 6. Auth (MySQL 8+)

MySQL 8 has proper role-based access control:

```sql
CREATE ROLE 'app_read';
GRANT SELECT ON mydb.* TO 'app_read';
CREATE USER 'api'@'%' IDENTIFIED BY 'pass';
GRANT 'app_read' TO 'api'@'%';
```

Via MCP tools:
1. `db_create_role` → name only (MySQL roles have no login by default)
2. `db_grant_schema` → `privileges: ["SELECT"]`, `schema: "mydb"`
3. `db_create_role` with `login: true` → creates a user account
4. `db_grant_role_membership` → grants role to user

Valid schema privileges: `CREATE`, `ALTER`, `DROP`, `INDEX`, `CREATE ROUTINE`, `ALTER ROUTINE`, `LOCK TABLES`, `ALL`.
Valid table privileges: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `REFERENCES`, `ALL`.

---

## 7. JSON Operations (MySQL)

```sql
-- Extract value
SELECT col->>'$.key' FROM t;          -- returns text
SELECT JSON_EXTRACT(col, '$.key') FROM t;

-- Check if key exists
SELECT JSON_CONTAINS_PATH(col, 'one', '$.key') FROM t;

-- Modify
UPDATE t SET col = JSON_SET(col, '$.key', 'value');
```

---

## 8. Performance Notes

- **No partial indexes**: MySQL does not support `WHERE` clauses on indexes.
- **Foreign key indexes**: MySQL does auto-index FK columns (unlike Postgres).
- **EXPLAIN**: Use `EXPLAIN FORMAT=JSON SELECT ...` for full query plan.
- **Connection pooling**: Use `mysql2`'s built-in pool; avoid creating connections per request.

---

## 9. Soft Delete Pattern

MySQL has no `RULE` system. Use a trigger instead:

```sql
CREATE TRIGGER trg_users_soft_delete
BEFORE DELETE ON mydb.users FOR EACH ROW
BEGIN
  INSERT INTO mydb.users (id, name, deleted_at)
  VALUES (OLD.id, OLD.name, NOW())
  ON DUPLICATE KEY UPDATE deleted_at = NOW();
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Soft delete: row marked as deleted';
END
```

Or simply: don't use `db_delete`, use `db_update` to set `deleted_at = NOW()`.

---

## 10. Limitations vs PostgreSQL

- No `IF NOT EXISTS` on indexes (use try/catch or check first)
- No `CREATE OR REPLACE VIEW` → driver drops and recreates
- No `RENAME DATABASE` — use export/import
- No `SEQUENCE` objects — use `AUTO_INCREMENT`
- No partial indexes
- No `RETURNING` clause on INSERT/UPDATE/DELETE
- `TEXT` columns cannot have `DEFAULT` values in older MySQL versions
