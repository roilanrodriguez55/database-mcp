# PostgreSQL Ultimate Reference (Skill Engine)

Engine-specific details for the database MCP when `DB_TYPE=postgres`. Based on official docs (v15/v16/v17).

---

## 1. Data Types & Specialized Storage

| Category | Type | Storage | Usage & Official Recommendation |
| :--- | :--- | :--- | :--- |
| **Numeric** | `numeric` | Variable | Use for monetary amounts and exact decimals. |
| **Numeric** | `double precision` | 8 bytes | Inexact, variable precision (IEEE 754). Use for scientific data. |
| **JSON** | `jsonb` | Variable | **Preferred.** Binary format, supports indexing and containment operators. |
| **Geometric** | `point`, `polygon` | Variable | Native types for basic 2D geometry. |
| **Network** | `inet`, `cidr` | 7/19 bytes | Validates IP addresses and handles subnet logic. |
| **Bit String** | `bit(n)`, `bit varying` | n bits | Useful for compact flag storage or bitmasking. |
| **Date/Time** | `timestamp(p)` | 8 bytes | `p` is precision (0-6). Always use `timestamptz`. |
| **UUID** | `uuid` | 16 bytes | Primary keys (use `gen_random_uuid()` or pgcrypto). |

---

## 2. Advanced JSONB Operations

PostgreSQL treats JSONB as a first-class citizen. The agent must know these operators:

- **Extraction:** `->` (returns JSON), `->>` (returns text).
- **Pathing:** `#>` (extracts at path), `#>>` (extracts text at path).
- **Containment:** `@>` (does left contain right?), `<@` (is left contained by right?).
- **Existence:** `?` (does key exist?), `?|` (any of these keys exist?), `?&` (all keys exist?).
- **Modification:** `jsonb_set(target, path, new_value, create_missing)`.

```sql
-- Example: Search in nested array
SELECT * FROM orders WHERE data->'items' @> '[{"id": 101}]';
```

---

## 3. Window Functions & Analytics

Essential for reporting without `GROUP BY` collapses.

- **Syntax:** `function() OVER (PARTITION BY col ORDER BY col ROWS BETWEEN ...)`
- **Key Functions:**
  - `ROW_NUMBER()`: Unique ID per partition.
  - `RANK()` / `DENSE_RANK()`: Rankings with/without gaps.
  - `LAG()` / `LEAD()`: Access previous/next row values.
  - `FIRST_VALUE()` / `LAST_VALUE()`: Boundary values in window.

---

## 4. Indexing (The Performance Core)

### Index Types

1. **B-Tree:** Default. Multi-column, unique, and range scans.
2. **GIN (Generalized Inverted Index):** For "composite" values (arrays, jsonb, text).
3. **GiST:** For spatial data, nearest neighbor search, and range types.
4. **BRIN:** For massive, naturally ordered tables (e.g., logs by `created_at`).

### Index Features

- **Partial Index:** `CREATE INDEX ... WHERE (status = 'active');`
- **Expression Index:** `CREATE INDEX ... ON table (lower(email));`
- **Covering Index:** `CREATE INDEX ... INCLUDE (extra_col);` (Enables Index-Only Scans).

---

## 5. Full-Text Search (FTS)

Don't use `LIKE` for search; use the engine's FTS capabilities.

```sql
-- Vectorize text and query
SELECT title FROM posts
WHERE to_tsvector('spanish', body) @@ to_tsquery('spanish', 'base & datos');

-- Ranking results
SELECT title, ts_rank(vector, query) as rank
FROM posts, to_tsquery('query') query
ORDER BY rank DESC;
```

---

## 6. Table Partitioning (Declarative)

For handling tables with millions/billions of rows.

```sql
CREATE TABLE measurement (
    city_id int not null,
    logdate date not null,
    peaktemp int
) PARTITION BY RANGE (logdate);

CREATE TABLE measurement_y2026m03 PARTITION OF measurement
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
```

---

## 7. PostGIS & Geospatial (Critical Extensions)

If `postgis` is enabled, the agent should prioritize these over native geometric types.

- **Types:** `GEOMETRY` (Planar), `GEOGRAPHY` (Spherical/Earth).
- **Functions:**
  - `ST_Distance(a, b)`: Distance between objects.
  - `ST_Contains(a, b)`: True if geometry A contains B.
  - `ST_AsGeoJSON(geom)`: Exports to standard JSON format.
  - `ST_Transform(geom, srid)`: Changes coordinate reference systems (e.g., to 4326).

---

## 8. Transaction Isolation Levels

The agent must choose the right isolation for consistency:

1. **Read Committed:** (Default) Can see concurrent commits.
2. **Repeatable Read:** Guarantees same data within the transaction.
3. **Serializable:** Highest isolation; acts as if transactions were sequential.

---

## 9. Introspection & Maintenance

Commands for the agent to diagnose the system:

- **Check Bloat/Stats:** `ANALYZE table_name;`
- **Check Execution Plan:** `EXPLAIN (ANALYZE, BUFFERS, VERBOSE) SELECT ...;`
- **Find Locks:** `SELECT * FROM pg_locks l JOIN pg_stat_activity a ON l.pid = a.pid;`
- **Size on Disk:** `pg_total_relation_size('table_name')` vs `pg_relation_size`.

---

## 10. Rules vs Triggers

- **Triggers:** Best for complex logic, auditing, and multi-table updates. (Executes for each row or statement).
- **Rules:** Rewrite the query itself. Most common use: **Soft Delete** or **Redirecting** writes on views.

### Trigger Example (updatedAt)

```sql
CREATE OR REPLACE FUNCTION schema.fn_name() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_name BEFORE UPDATE ON schema.table
FOR EACH ROW EXECUTE FUNCTION schema.fn_name();
```

### Soft Delete (RULE)

```sql
CREATE RULE rule_name AS ON DELETE TO schema.table
DO INSTEAD (UPDATE schema.table SET deleted_at = now(), updated_at = now()
WHERE id = OLD.id AND deleted_at IS NULL);
```

---

## 11. Best Practices for Professional Engineering

### A. Naming Conventions & Identifiers

- **Snake_case by Default:** PostgreSQL converts identifiers to lowercase. Use `snake_case` to avoid constant double quotes.
  - *Bad:* `SELECT "FirstName" FROM "Users";`
  - *Good:* `SELECT first_name FROM users;`
- **Plural vs Singular:** Use plural table names (`users`, `orders`). Standard in modern ORMs (Prisma, TypeORM).
- **Primary Keys:** Prefer `id` as the PK name. `user_id` can help readability in massive joins, but `id` is more consistent.

**Driver validation:** `^[a-zA-Z_][a-zA-Z0-9_]*$`. Hyphens not allowed (e.g. `uuid-ossp` extension name fails via `db_create_extension`; use `db_execute_sql`).

**Quoted identifiers:** Use double quotes for camelCase when needed: `"createdAt"`, `"updatedAt"`, `"deletedAt"`.

### B. Schema Design & Data Integrity

- **Never use `timestamp` without Timezone:** Always use `timestamptz`. PostgreSQL stores in UTC and converts to client timezone.
- **`text` over `varchar(n)`:** No performance difference in Postgres. Use `text` unless a strict business rule requires a limit (e.g. 2-char country code).
- **Avoid `NULL` for Arrays/Booleans:** Define `NOT NULL DEFAULT '[]'` for arrays and `NOT NULL DEFAULT false` for booleans. Simplifies backend logic.
- **Normalization vs JSONB:** Don't overuse `jsonb`. Use relational columns for fixed schema and clear relations. Reserve `jsonb` for dynamic metadata or third-party integrations.

### C. Query Optimization & Performance

- **Sargability (Search Argumentable):** Avoid wrapping columns in functions inside `WHERE`.
  - *Bad:* `WHERE DATE(created_at) = '2026-03-18'` (Invalidates index).
  - *Good:* `WHERE created_at >= '2026-03-18' AND created_at < '2026-03-19'`.
- **`EXISTS` vs `COUNT`:** For existence checks, `EXISTS` is faster (stops at first match).
  - *Good:* `SELECT EXISTS(SELECT 1 FROM users WHERE email = '...');`
- **Index Foreign Keys:** PostgreSQL does not auto-index foreign keys. Do it manually for faster JOINs and cascade DELETE/UPDATE.
- **Partial Indexes for Soft Deletes:** If using `deleted_at`, create partial indexes to ignore deleted rows:
  - `CREATE INDEX idx_active_users ON users(email) WHERE deleted_at IS NULL;`
- **Avoid `NOT IN`:** Prefer `NOT EXISTS` or `LEFT JOIN / IS NULL` for better null handling and performance.

### D. Concurrency & Locking

- **Avoid Long-Running Transactions:** Keep transactions short. An open transaction can block `VACUUM` and cause table bloat.
- **FOR UPDATE / SKIP LOCKED:** For queue or task systems, use `SKIP LOCKED` to avoid multiple processes processing the same row:

```sql
SELECT * FROM tasks WHERE status = 'pending'
LIMIT 1 FOR UPDATE SKIP LOCKED;
```

### E. Security & Access Control

- **Principle of Least Privilege:** Application user should not be DB owner. Grant only `SELECT, INSERT, UPDATE, DELETE`.
- **Row Level Security (RLS):** For multi-tenant systems, RLS ensures users cannot see other tenants' data at the engine level.
- **Prepared Statements:** Always use parameterized queries to prevent **SQL Injection**.

### F. Connection Management

- **Connection Pooling:** Postgres uses one process per connection. In serverless or high-concurrency (Next.js, FastAPI), use **PgBouncer** or the pool from `pg`/Prisma.
- **Idle Timeout:** Configure timeouts to close idle connections and free server resources.

### G. Maintenance (Operational Excellence)

- **Vacuum & Analyze:** Although `autovacuum` is efficient, for tables with massive daily inserts, schedule manual `VACUUM ANALYZE` during low-traffic hours.
- **Migrations:** Never alter the database manually. Use migration tools (Prisma Migrate, Flyway, Alembic) for version-controlled schema.

### H. Additional Best Practices

- **Explicit Casting:** Use `::` to avoid ambiguity (`'2026-01-01'::date`).
- **CTE Materialization:** In v12+, CTEs are not materialized by default. Use `WITH name AS MATERIALIZED (...)` if you need a temp table.

---

## 12. Extensions (50+ Most Used)

Extensions must be installed with `CREATE EXTENSION name;` (or `db_create_extension`). Some require `shared_preload_libraries` and a restart. Name with hyphen (e.g. `uuid-ossp`) may fail via `db_create_extension`; use `db_execute_sql` instead.

### UUID & Identifiers

| Extension | Purpose | Key Functions/Types |
|-----------|---------|---------------------|
| **pgcrypto** | Cryptographic functions, UUID | `gen_random_uuid()`, `crypt()`, `digest()` |
| **uuid-ossp** | UUID generation (legacy) | `uuid_generate_v4()`, `uuid_generate_v1()` |

### Text & Search

| Extension | Purpose | Key Functions/Types |
|-----------|---------|---------------------|
| **pg_trgm** | Trigram similarity, fuzzy search | `similarity()`, `%` operator, `gist_trgm_ops`, `gin_trgm_ops` for LIKE/ILIKE |
| **citext** | Case-insensitive text type | `citext` column type (emails, usernames) |
| **unaccent** | Remove accents for search | `unaccent(text)` |
| **fuzzystrmatch** | Fuzzy string matching | `levenshtein()`, `soundex()`, `metaphone()` |
| **dict_int** | Integer dictionary for FTS | Custom text search dictionary |
| **dict_xsyn** | Synonym dictionary for FTS | Word synonyms in full-text search |

### Indexing & Performance

| Extension | Purpose | Key Functions/Types |
|-----------|---------|---------------------|
| **btree_gin** | GIN indexes for B-tree types | GIN opclasses for int, text, uuid, timestamp, etc. |
| **btree_gist** | GiST indexes for B-tree types | GiST opclasses for range types, exclusion constraints |
| **pg_stat_statements** | Query performance tracking | `pg_stat_statements` view; requires `shared_preload_libraries` |
| **auto_explain** | Auto EXPLAIN for slow queries | Requires `shared_preload_libraries` |
| **pg_buffercache** | Inspect shared buffer cache | `pg_buffercache` view |
| **pg_prewarm** | Preload relations into cache | `pg_prewarm(regclass)` |
| **pg_freespacemap** | Free space map inspection | Debug bloat |
| **pgstattuple** | Tuple-level statistics | `pgstattuple()`, `pgstatindex()` |
| **pg_visibility** | Visibility map inspection | Debug VACUUM |
| **hypopg** | Hypothetical indexes | Test index impact without creating |
| **pg_qualstats** | Predicate statistics | Find missing indexes |

### JSON & Key-Value

| Extension | Purpose | Key Functions/Types |
|-----------|---------|---------------------|
| **hstore** | Key-value store type | `hstore` type, `->`, `@>`, `?` operators |
| **jsquery** | JSON query language | Advanced JSONB queries |
| **is_jsonb_valid** | JSON Schema validation | Validate JSONB against schema |

### Arrays & Collections

| Extension | Purpose | Key Functions/Types |
|-----------|---------|---------------------|
| **intarray** | Integer array operators | `&&`, `@>`, `@@`, GIN support |
| **cube** | Multidimensional cubes | `cube` type for earthdistance, analytics |

### Hierarchical & Trees

| Extension | Purpose | Key Functions/Types |
|-----------|---------|---------------------|
| **ltree** | Hierarchical labels (paths) | `ltree` type, `@>`, `nlevel()`, `lquery` |

### Geospatial

| Extension | Purpose | Key Functions/Types |
|-----------|---------|---------------------|
| **postgis** | Full geospatial (see §7) | `GEOMETRY`, `GEOGRAPHY`, `ST_*` functions |
| **earthdistance** | Great-circle distances | `earth_distance()`, requires `cube` |

### FDW (Foreign Data Wrappers)

| Extension | Purpose | Key Functions/Types |
|-----------|---------|---------------------|
| **postgres_fdw** | Connect to remote Postgres | `CREATE SERVER`, `IMPORT FOREIGN SCHEMA` |
| **file_fdw** | Read flat files as tables | `CREATE FOREIGN TABLE` from CSV/text |
| **dblink** | Ad-hoc connections to other DBs | `dblink()`; prefer postgres_fdw for persistent |

### Sampling & Testing

| Extension | Purpose | Key Functions/Types |
|-----------|---------|---------------------|
| **tsm_system_rows** | TABLESAMPLE by row count | `TABLESAMPLE system_rows(n)` |
| **tsm_system_time** | TABLESAMPLE by time | `TABLESAMPLE system_time(n)` |

### Maintenance & Debugging

| Extension | Purpose | Key Functions/Types |
|-----------|---------|---------------------|
| **amcheck** | Verify B-tree consistency | `bt_index_check()`, `bt_index_parent_check()` |
| **pageinspect** | Low-level page inspection | `get_raw_page()`, `page_header()` (superuser) |
| **pg_walinspect** | WAL inspection | Read WAL records |
| **pg_surgery** | Fix corrupted rows | Low-level row repair (superuser) |

### Partitioning & Scale

| Extension | Purpose | Key Functions/Types |
|-----------|---------|---------------------|
| **pg_partman** | Automated partition management | Time/ID-based partition creation/dropping |
| **timescaledb** | Time-series optimization | Hypertables, compression, continuous aggregates |
| **citus** | Distributed PostgreSQL | Sharding, columnar storage, multi-tenant |

### Scheduling & Jobs

| Extension | Purpose | Key Functions/Types |
|-----------|---------|---------------------|
| **pg_cron** | Cron jobs inside Postgres | `cron.schedule()`, `cron.job`; requires `shared_preload_libraries` |

### AI & Vectors

| Extension | Purpose | Key Functions/Types |
|-----------|---------|---------------------|
| **vector** (pgvector) | Vector embeddings, similarity | `vector` type, `<->` L2, `<=>` cosine, HNSW/IVFFlat indexes |

### Full-Text (Advanced)

| Extension | Purpose | Key Functions/Types |
|-----------|---------|---------------------|
| **rum** | RUM index for FTS | Position-aware ranking, `rum` index type |
| **pg_bigm** | 2-gram FTS (Japanese) | Bigram-based full-text search |

### Replication & CDC

| Extension | Purpose | Key Functions/Types |
|-----------|---------|---------------------|
| **pglogical** | Logical replication | Multi-master, selective replication |
| **wal2json** | WAL to JSON | Logical decoding output plugin |
| **decoderbufs** | Protobuf WAL decoding | CDC to Kafka/streaming |
| **test_decoding** | Test logical decoding | Built-in output plugin |

### Security & Audit

| Extension | Purpose | Key Functions/Types |
|-----------|---------|---------------------|
| **pgaudit** | Audit logging | Log DDL, DML, roles |
| **pgjwt** | JWT in Postgres | `sign()`, `verify()` for JWTs |
| **sslinfo** | SSL connection info | Client certificate details |

### Utilities & Misc

| Extension | Purpose | Key Functions/Types |
|-----------|---------|---------------------|
| **tablefunc** | Crosstab, etc. | `crosstab()`, `normal_rand()` |
| **seg** | Segment ranges | `seg` type for scientific ranges |
| **isn** | ISBN/ISMN/EAN | `isbn`, `ismn` types |
| **lo** | Large object maintenance | `lo_manage` trigger |
| **tcn** | Triggered change notifications | `triggered_change_notification()` |
| **orafce** | Oracle compatibility | `nvl()`, `decode()`, `listagg()` |
| **pg_repack** | Online table rebuild | Reclaim bloat without locks |
| **postgresql_anonymizer** | Data anonymization | Mask PII for dev/test |

### Procedural Languages & Validation

| Extension | Purpose | Key Functions/Types |
|-----------|---------|---------------------|
| **plpgsql_check** | Static analysis for PL/pgSQL | Validate functions without execution |
| **plv8** | JavaScript in Postgres | `plv8` language |
| **plrust** | Rust in Postgres | `plrust` language |

### Installation Notes

- **shared_preload_libraries:** Required for `pg_stat_statements`, `auto_explain`, `pg_cron` — add to `postgresql.conf` and restart.
- **Hyphenated names:** `uuid-ossp` may fail via `db_create_extension`; use `db_execute_sql` with `CREATE EXTENSION "uuid-ossp";`
- **External extensions:** PostGIS, TimescaleDB, Citus, pgvector require separate installation (apt, yum, or from source).
