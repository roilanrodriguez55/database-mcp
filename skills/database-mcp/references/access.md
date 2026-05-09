# Microsoft Access Reference (Skill Engine)

Engine-specific details for the database MCP when `DB_TYPE=access`. Uses the `odbc` package via the Microsoft Access ODBC driver.

---

## 1. Prerequisites

**Windows only.** The Access ODBC driver is part of the Microsoft ACE/JET engine:

- If Microsoft Office is installed: driver is already available
- Without Office: install **Microsoft Access Database Engine 2016 Redistributable** (free, from Microsoft)

**Note:** 32-bit vs 64-bit matters. Your Node.js process and the ODBC driver must match bitness.

---

## 2. Connection String

The `connection` field in `databases.json` accepts:

**File path (shorthand):**
```json
{ "type": "access", "connection": "C:\\path\\to\\file.accdb" }
```
The driver auto-constructs: `Driver={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=<path>;`

**Full ODBC string:**
```json
{ "type": "access", "connection": "Driver={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=C:\\data\\mydb.accdb;" }
```

**DSN (pre-configured in ODBC Data Source Administrator):**
```json
{ "type": "access", "connection": "DSN=MyAccessDSN;" }
```

Both `.mdb` (Access 97–2003) and `.accdb` (Access 2007+) files are supported.

---

## 3. Schemas

Access has **no schema concept**. All tools accept a `schema` parameter (required by the interface) — pass `"default"` and it will be ignored:

```
db_list_tables   → schema: "default"
db_create_table  → schema: "default", name: "Customers"
db_insert        → schema: "default", table: "Customers"
```

`db_list_schemas` always returns `[{ name: "default" }]`.
`db_create_schema`, `db_drop_schema`, `db_alter_schema` throw `"not supported"`.

---

## 4. Data Types (JET SQL)

| Category | Type | Notes |
|----------|------|-------|
| **Integer** | `LONG` | 4-byte integer (equivalent to INT) |
| **Integer** | `INTEGER` | 2-byte integer (SMALLINT) |
| **Integer** | `BYTE` | 0–255 |
| **Auto-increment** | `AUTOINCREMENT` or `COUNTER` | Identity/serial column |
| **Float** | `SINGLE`, `DOUBLE` | 4 / 8-byte float |
| **Decimal** | `CURRENCY` | Fixed-point, 4 decimal places; for money |
| **String** | `TEXT(n)` | Up to 255 chars (VARCHAR equivalent) |
| **Long text** | `MEMO` | Up to 65,535 chars (TEXT equivalent) |
| **Date/Time** | `DATETIME` | Date and time combined |
| **Boolean** | `YESNO` or `BIT` | 0/−1 (Access uses −1 for true) |
| **Binary** | `BINARY(n)`, `LONGBINARY` (OLE Object) | Raw bytes |

**Common table template:**
```sql
CREATE TABLE [Customers] (
  [Id] AUTOINCREMENT,
  [Name] TEXT(100) NOT NULL,
  [Email] TEXT(255),
  [CreatedAt] DATETIME DEFAULT NOW(),
  CONSTRAINT [PK_Customers] PRIMARY KEY ([Id])
)
```

---

## 5. Identifier Quoting

Access uses **square brackets** `[name]` for quoting identifiers. The driver handles this automatically. When writing raw SQL in `db_execute_sql`, use brackets for names with spaces or reserved words:

```sql
SELECT [First Name], [Order Date] FROM [Order Details];
```

---

## 6. Supported Operations

| Operation | Supported | Notes |
|-----------|-----------|-------|
| `db_list_tables` | ✅ | Via ODBC catalog |
| `db_create_table` | ✅ | JET DDL |
| `db_get_table` | ✅ | Columns, PK, FKs via ODBC catalog |
| `db_alter_table` (add/drop col) | ✅ | JET DDL |
| `db_alter_table` (rename) | ❌ | Not supported in JET SQL |
| `db_drop_table` | ✅ | |
| `db_list_indexes` | ✅ | Via ODBC statistics catalog |
| `db_create_index` | ✅ | UNIQUE supported |
| `db_drop_index` | ✅ | Searches all tables to find the index |
| `db_list_views` | ✅ | Access "queries" = views |
| `db_create_view` | ✅ | Drops and recreates (no OR REPLACE) |
| `db_get_view` | ✅ | |
| `db_drop_view` | ✅ | |
| `db_query` | ✅ | Full SELECT support |
| `db_insert` | ✅ | Row-by-row (ODBC limitation) |
| `db_update` | ✅ | |
| `db_delete` | ✅ | |
| `db_execute_sql` | ✅ | For complex DDL or JET-specific SQL |

---

## 7. Not Supported

These tools throw `"Microsoft Access does not support X"`:

- `db_create_schema`, `db_drop_schema`, `db_alter_schema`
- `db_list_triggers`, `db_create_trigger`, `db_drop_trigger` — use VBA macros/event procedures
- `db_list_functions`, `db_create_function`, `db_drop_function` — use VBA modules
- `db_list_extensions`, `db_create_extension`, `db_drop_extension`
- `db_create_sequence`, `db_drop_sequence` — use `AUTOINCREMENT` type
- All auth tools (`db_create_role`, `db_grant_*`, etc.) — workgroup security is deprecated in `.accdb`

---

## 8. Access SQL Quirks

### No `IF NOT EXISTS` / `IF EXISTS`

JET SQL does not support these clauses. The driver wraps drops in try/catch silently. For creates via `db_execute_sql`, handle errors in the calling code.

### Date literals

Access uses `#` delimiters for dates (not quotes):

```sql
SELECT * FROM [Orders] WHERE [OrderDate] > #2024-01-01#;
```

### TOP instead of LIMIT

```sql
SELECT TOP 10 * FROM [Customers] ORDER BY [Id];
-- No LIMIT/OFFSET — use subqueries for pagination
```

### String concatenation

Use `&` not `||`:

```sql
SELECT [FirstName] & ' ' & [LastName] AS FullName FROM [Contacts];
```

### DISTINCT aggregate

```sql
SELECT COUNT([Status]) FROM [Orders] WHERE [Status] = 'Active';
-- No COUNT(DISTINCT col) in older JET — use subquery
```

---

## 9. Rename Table Workaround

`db_alter_table` with `renameTo` is not supported. Use `db_execute_sql` with a copy approach:

```sql
-- 1. Create new table with new name (same structure)
-- 2. INSERT INTO [NewName] SELECT * FROM [OldName]
-- 3. DROP TABLE [OldName]
```

Or use the Access UI / ADOX for a direct rename.

---

## 10. Soft Delete Pattern

Since Access has no SQL triggers, implement soft delete at the application layer:

- Never call `db_delete`
- Use `db_update` to set a `DeletedAt` field:
  ```
  db_update → schema: "default", table: "Customers", set: { DeletedAt: "NOW()" }, where: { Id: 42 }
  ```
- Filter with `db_query`: `SELECT * FROM [Customers] WHERE [DeletedAt] IS NULL`
