# SQLite Reference (Skill Engine)

Engine-specific details for the database MCP when `DB_TYPE=sqlite`. Based on SQLite 3.x (via `better-sqlite3`).

---

## 1. Key Characteristics

- **File-based**: connection string = path to `.db` / `.sqlite` file
- **Serverless**: no separate process, no auth, no roles
- **Single-writer**: concurrent writes are serialized via file lock
- **Schema**: maps to attached databases; `main` is always the primary file
- **Synchronous API**: `better-sqlite3` is sync; the driver wraps in async interface

---

## 2. Type Affinity (Not Strict Types)

SQLite uses **type affinity** — declared types are hints, not enforcement:

| Affinity | Column Types | Behavior |
|----------|-------------|---------|
| `INTEGER` | INT, INTEGER, BIGINT, TINYINT, SMALLINT | Stores as integer |
| `REAL` | REAL, DOUBLE, FLOAT | Stores as 8-byte float |
| `TEXT` | TEXT, CHAR, VARCHAR, CLOB | Stores as UTF-8 string |
| `BLOB` | BLOB | Stores as raw bytes |
| `NUMERIC` | NUMERIC, DECIMAL, BOOLEAN, DATE, DATETIME | Tries INTEGER or REAL, fallback TEXT |

**Practical tip**: Use `TEXT` for dates (ISO 8601 strings), `INTEGER` for unix timestamps, `REAL` for Julian day values.

---

## 3. Auto-Increment

SQLite uses `INTEGER PRIMARY KEY` which auto-assigns `rowid`. Add `AUTOINCREMENT` only if you need guaranteed-never-reused IDs (slower):

```sql
-- Recommended (rowid alias, reuses gaps):
CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);

-- Strict no-reuse (slower):
CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
```

---

## 4. Schemas (Attached Databases)

SQLite "schemas" = attached database files. `main` is always present:

```sql
ATTACH DATABASE '/path/to/other.db' AS other;
SELECT * FROM other.users;
```

`db_list_schemas` returns attached databases. `db_create_schema` is **not supported** — use `db_execute_sql` with `ATTACH DATABASE`.

---

## 5. Triggers

SQLite triggers use inline SQL bodies (`BEGIN ... END`). Pass the full body in `options.function`:

```sql
CREATE TRIGGER trg_updated_at
AFTER UPDATE ON users FOR EACH ROW
BEGIN
  UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
END
```

Timing options: `BEFORE`, `AFTER`, `INSTEAD OF` (for views).
Event options: `INSERT`, `UPDATE`, `DELETE`.

---

## 6. Views

Standard `CREATE VIEW` and `DROP VIEW`. No `CREATE OR REPLACE` — driver drops then recreates:

```sql
CREATE VIEW active_users AS
SELECT * FROM users WHERE deleted_at IS NULL;
```

---

## 7. Indexes

Full index support including `UNIQUE`:

```sql
CREATE INDEX idx_users_email ON users (email);
CREATE UNIQUE INDEX idx_users_email_unique ON users (email);
DROP INDEX idx_users_email;  -- no ON table needed (global namespace)
```

SQLite does **not** support partial indexes via the MCP tool — use `db_execute_sql` for `WHERE` clause indexes:

```sql
CREATE INDEX idx_active ON users (email) WHERE deleted_at IS NULL;
```

---

## 8. Soft Delete Pattern

Use a trigger to intercept DELETE and convert to UPDATE:

```sql
CREATE TRIGGER trg_soft_delete_users
BEFORE DELETE ON users FOR EACH ROW
BEGIN
  UPDATE users SET deleted_at = datetime('now') WHERE id = OLD.id;
  SELECT RAISE(IGNORE);
END
```

`RAISE(IGNORE)` aborts the DELETE without error.

---

## 9. Full-Text Search (FTS5)

SQLite has native FTS support via virtual tables:

```sql
CREATE VIRTUAL TABLE docs_fts USING fts5(title, body, content='docs', content_rowid='id');

-- Search
SELECT * FROM docs_fts WHERE docs_fts MATCH 'search term';
```

Use `db_execute_sql` for virtual table DDL.

---

## 10. JSON Support (SQLite 3.38+)

```sql
-- Extract
SELECT json_extract(col, '$.key') FROM t;

-- Object operators (3.38+)
SELECT col->>'$.key' FROM t;

-- Array
SELECT json_each.value FROM t, json_each(t.tags);
```

---

## 11. Limitations

- No `CREATE SCHEMA` / `DROP SCHEMA` (use ATTACH/DETACH)
- No `ALTER TABLE RENAME COLUMN` in very old SQLite (3.25+ supports it)
- No stored functions (use application-layer UDFs registered with `better-sqlite3`)
- No extensions via MCP (extensions loaded at application layer)
- No roles, users, or grants (file-level permissions only)
- No sequences (use `INTEGER PRIMARY KEY`)
- No `IF NOT EXISTS` on `DROP TABLE` for some operations (driver handles gracefully)
- WAL mode recommended for concurrent reads: `PRAGMA journal_mode=WAL`

---

## 12. Pragmas (via db_execute_sql)

```sql
PRAGMA foreign_keys = ON;          -- enable FK enforcement (driver does this by default)
PRAGMA journal_mode = WAL;         -- better concurrency
PRAGMA synchronous = NORMAL;       -- faster writes, safe
PRAGMA cache_size = -64000;        -- 64 MB cache
PRAGMA temp_store = MEMORY;        -- temp tables in RAM
PRAGMA integrity_check;            -- verify database health
```
