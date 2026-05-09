import Database from "better-sqlite3";
import type {
  IDatabaseDriver,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  ForeignKeyInfo,
  IndexInfo,
  ViewInfo,
  SequenceInfo,
  TriggerInfo,
  FunctionInfo,
  ExtensionInfo,
  RoleInfo,
  GrantInfo,
  QueryResult,
  ColumnDef,
} from "./types.js";
import type { MigrationRecorder } from "./postgres.js";

const IDENT_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function validateIdentifier(name: string, label: string): void {
  if (!IDENT_REGEX.test(name)) {
    throw new Error(`Invalid ${label}: ${name}`);
  }
}

function notSupported(feature: string): never {
  throw new Error(`SQLite does not support ${feature}`);
}

export class SQLiteDriver implements IDatabaseDriver {
  private db: Database.Database;
  private migrationRecorder?: MigrationRecorder;

  constructor(
    connectionString: string,
    options?: { migrationRecorder?: MigrationRecorder }
  ) {
    this.db = new Database(connectionString);
    this.db.pragma("foreign_keys = ON");
    this.migrationRecorder = options?.migrationRecorder;
  }

  private async recordMigrationInternal(sql: string, description: string): Promise<void> {
    if (this.migrationRecorder) await this.migrationRecorder(sql, description);
  }

  async recordMigration(sql: string, description: string): Promise<void> {
    await this.recordMigrationInternal(sql, description);
  }

  private isSelectLike(sql: string): boolean {
    const kw = sql.trim().split(/\s+/)[0].toUpperCase();
    return ["SELECT", "WITH", "PRAGMA", "EXPLAIN", "VALUES"].includes(kw);
  }

  private tableRef(schema: string, name: string): string {
    return schema && schema !== "main" ? `"${schema}"."${name}"` : `"${name}"`;
  }

  private masterTable(schema: string): string {
    return schema === "main" ? "sqlite_master" : `"${schema}".sqlite_master`;
  }

  async execute(sql: string, params?: unknown[]): Promise<QueryResult> {
    const p = (params ?? []) as unknown[];
    if (this.isSelectLike(sql)) {
      const rows = this.db.prepare(sql).all(...p) as Record<string, unknown>[];
      return { rows, rowCount: rows.length };
    }
    const result = this.db.prepare(sql).run(...p);
    return { rows: [], rowCount: result.changes };
  }

  // ── Schemas ─────────────────────────────────────────────────────────────────
  // SQLite "schemas" map to attached databases; "main" always exists.

  async listSchemas(_includeSystem = false): Promise<SchemaInfo[]> {
    const rows = this.db.prepare("PRAGMA database_list").all() as {
      seq: number;
      name: string;
      file: string;
    }[];
    return rows
      .filter((d) => d.name !== "temp")
      .map((d) => ({ name: d.name }));
  }

  async createSchema(_name: string, _options?: { owner?: string }): Promise<void> {
    notSupported("CREATE SCHEMA (attach a new SQLite file with ATTACH DATABASE instead)");
  }

  async getSchema(name: string): Promise<SchemaInfo | null> {
    const schemas = await this.listSchemas();
    return schemas.find((s) => s.name === name) ?? null;
  }

  async alterSchema(_name: string, _options: { newName?: string }): Promise<void> {
    notSupported("ALTER SCHEMA");
  }

  async dropSchema(_name: string, _cascade = false): Promise<void> {
    notSupported("DROP SCHEMA (use DETACH DATABASE)");
  }

  // ── Tables ───────────────────────────────────────────────────────────────────

  async listTables(schema?: string, verbose = false): Promise<TableInfo[]> {
    const db = schema ?? "main";
    const master = this.masterTable(db);
    const rows = this.db
      .prepare(
        `SELECT name FROM ${master} WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      )
      .all() as { name: string }[];

    const tables: TableInfo[] = rows.map((r) => ({ schema: db, name: r.name }));

    if (verbose) {
      for (const t of tables) {
        const detail = await this.getTable(t.schema, t.name);
        if (detail) {
          t.columns = detail.columns;
          t.primaryKey = detail.primaryKey;
          t.foreignKeys = detail.foreignKeys;
        }
      }
    }
    return tables;
  }

  async createTable(
    schema: string,
    name: string,
    columns: ColumnDef[],
    options?: { primaryKey?: string[]; constraints?: string[] }
  ): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "table name");
    const colDefs = columns.map((c) => {
      validateIdentifier(c.name, "column name");
      let def = `"${c.name}" ${c.type}`;
      if (c.nullable === false) def += " NOT NULL";
      if (c.default) def += ` DEFAULT ${c.default}`;
      return def;
    });
    if (options?.primaryKey?.length) {
      colDefs.push(
        `PRIMARY KEY (${options.primaryKey.map((c) => `"${c}"`).join(", ")})`
      );
    }
    if (options?.constraints?.length) {
      colDefs.push(...options.constraints);
    }
    const ref = this.tableRef(schema, name);
    const sql = `CREATE TABLE IF NOT EXISTS ${ref} (${colDefs.join(", ")})`;
    await this.recordMigrationInternal(sql, `create_table_${schema}_${name}`);
    this.db.prepare(sql).run();
  }

  async getTable(schema: string, name: string): Promise<TableInfo | null> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "table name");

    const master = this.masterTable(schema);
    const exists = this.db
      .prepare(`SELECT name FROM ${master} WHERE type='table' AND name=?`)
      .get(name);
    if (!exists) return null;

    const pragmaPrefix = schema !== "main" ? `"${schema}".` : "";

    const colRows = this.db
      .prepare(`PRAGMA ${pragmaPrefix}table_info("${name}")`)
      .all() as {
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }[];

    const columns: ColumnInfo[] = colRows.map((c) => ({
      name: c.name,
      type: c.type,
      nullable: c.notnull === 0,
      default: c.dflt_value ?? undefined,
    }));

    const primaryKey = colRows
      .filter((c) => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((c) => c.name);

    const fkRows = this.db
      .prepare(`PRAGMA ${pragmaPrefix}foreign_key_list("${name}")`)
      .all() as {
      id: number;
      seq: number;
      table: string;
      from: string;
      to: string;
    }[];

    const foreignKeys: ForeignKeyInfo[] = fkRows.map((r) => ({
      column: r.from,
      refSchema: schema,
      refTable: r.table,
      refColumn: r.to,
    }));

    return { schema, name, columns, primaryKey, foreignKeys };
  }

  async alterTable(
    schema: string,
    name: string,
    options: {
      addColumns?: ColumnDef[];
      dropColumns?: string[];
      renameTo?: string;
    }
  ): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "table name");
    const ref = this.tableRef(schema, name);
    const stmts: string[] = [];

    if (options.addColumns?.length) {
      for (const c of options.addColumns) {
        validateIdentifier(c.name, "column name");
        let def = `ADD COLUMN "${c.name}" ${c.type}`;
        if (c.nullable === false) def += " NOT NULL";
        if (c.default) def += ` DEFAULT ${c.default}`;
        stmts.push(`ALTER TABLE ${ref} ${def}`);
      }
    }
    if (options.dropColumns?.length) {
      for (const col of options.dropColumns) {
        validateIdentifier(col, "column name");
        stmts.push(`ALTER TABLE ${ref} DROP COLUMN "${col}"`);
      }
    }
    if (options.renameTo) {
      validateIdentifier(options.renameTo, "new table name");
      stmts.push(`ALTER TABLE ${ref} RENAME TO "${options.renameTo}"`);
    }
    if (stmts.length > 0) {
      const sql = stmts.join(";\n") + ";";
      await this.recordMigrationInternal(sql, `alter_table_${schema}_${name}`);
      for (const s of stmts) this.db.prepare(s).run();
    }
  }

  async dropTable(schema: string, name: string, _cascade = false): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "table name");
    const ref = this.tableRef(schema, name);
    const sql = `DROP TABLE IF EXISTS ${ref}`;
    await this.recordMigrationInternal(sql, `drop_table_${schema}_${name}`);
    this.db.prepare(sql).run();
  }

  // ── Indexes ──────────────────────────────────────────────────────────────────

  async listIndexes(schema?: string, table?: string): Promise<IndexInfo[]> {
    const db = schema ?? "main";
    const master = this.masterTable(db);
    let query = `SELECT name, tbl_name as tbl, sql FROM ${master} WHERE type='index' AND name NOT LIKE 'sqlite_%'`;
    const params: unknown[] = [];
    if (table) {
      params.push(table);
      query += ` AND tbl_name = ?`;
    }
    query += ` ORDER BY tbl, name`;

    const rows = this.db.prepare(query).all(...params) as {
      name: string;
      tbl: string;
      sql: string | null;
    }[];

    return rows.map((r) => {
      const unique = r.sql ? /^\s*CREATE\s+UNIQUE\s+INDEX/i.test(r.sql) : false;
      const colMatch = r.sql?.match(/\(([^)]+)\)/);
      const columns = colMatch
        ? colMatch[1].split(",").map((c) => c.trim().replace(/^"|"$/g, ""))
        : [];
      return { schema: db, name: r.name, table: r.tbl, columns, unique };
    });
  }

  async createIndex(
    schema: string,
    table: string,
    columns: string[],
    options?: { name?: string; unique?: boolean }
  ): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(table, "table name");
    const indexName = options?.name ?? `${table}_${columns.join("_")}_idx`;
    validateIdentifier(indexName, "index name");
    columns.forEach((c) => validateIdentifier(c, "column"));
    const unique = options?.unique ? "UNIQUE " : "";
    const colList = columns.map((c) => `"${c}"`).join(", ");
    const ref = this.tableRef(schema, table);
    const sql = `CREATE ${unique}INDEX IF NOT EXISTS "${indexName}" ON ${ref} (${colList})`;
    await this.recordMigrationInternal(sql, `create_index_${indexName}`);
    this.db.prepare(sql).run();
  }

  async dropIndex(_schema: string, name: string): Promise<void> {
    validateIdentifier(name, "index name");
    // SQLite indexes are global — schema prefix not supported in DROP INDEX
    const sql = `DROP INDEX IF EXISTS "${name}"`;
    await this.recordMigrationInternal(sql, `drop_index_${name}`);
    this.db.prepare(sql).run();
  }

  // ── Views ────────────────────────────────────────────────────────────────────

  async listViews(schema?: string): Promise<ViewInfo[]> {
    const db = schema ?? "main";
    const master = this.masterTable(db);
    const rows = this.db
      .prepare(
        `SELECT name, sql as definition FROM ${master} WHERE type='view' ORDER BY name`
      )
      .all() as { name: string; definition: string }[];
    return rows.map((r) => ({ schema: db, name: r.name, definition: r.definition }));
  }

  async createView(
    schema: string,
    name: string,
    query: string,
    options?: { replace?: boolean }
  ): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "view name");
    const ref = this.tableRef(schema, name);
    if (options?.replace) {
      this.db.prepare(`DROP VIEW IF EXISTS ${ref}`).run();
    }
    const sql = `CREATE VIEW ${ref} AS ${query}`;
    await this.recordMigrationInternal(sql, `create_view_${schema}_${name}`);
    this.db.prepare(sql).run();
  }

  async getView(schema: string, name: string): Promise<ViewInfo | null> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "view name");
    const master = this.masterTable(schema);
    const row = this.db
      .prepare(
        `SELECT name, sql as definition FROM ${master} WHERE type='view' AND name=?`
      )
      .get(name) as { name: string; definition: string } | undefined;
    return row ? { schema, name: row.name, definition: row.definition } : null;
  }

  async dropView(schema: string, name: string, _cascade = false): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "view name");
    const ref = this.tableRef(schema, name);
    const sql = `DROP VIEW IF EXISTS ${ref}`;
    await this.recordMigrationInternal(sql, `drop_view_${schema}_${name}`);
    this.db.prepare(sql).run();
  }

  // ── Sequences ────────────────────────────────────────────────────────────────
  // SQLite uses INTEGER PRIMARY KEY AUTOINCREMENT — no SEQUENCE objects.

  async listSequences(_schema?: string): Promise<SequenceInfo[]> {
    return [];
  }

  async createSequence(_schema: string, _name: string, _options?: { start?: number; increment?: number }): Promise<void> {
    notSupported("SEQUENCE (use INTEGER PRIMARY KEY AUTOINCREMENT instead)");
  }

  async dropSequence(_schema: string, _name: string): Promise<void> {
    notSupported("SEQUENCE");
  }

  // ── Triggers ─────────────────────────────────────────────────────────────────
  // SQLite triggers use inline SQL bodies, not EXECUTE FUNCTION.
  // When creating: pass the full trigger body (BEGIN ... END) in options.function.

  async listTriggers(schema?: string, table?: string): Promise<TriggerInfo[]> {
    const db = schema ?? "main";
    const master = this.masterTable(db);
    let query = `SELECT tbl_name as tbl, name, sql FROM ${master} WHERE type='trigger'`;
    const params: unknown[] = [];
    if (table) {
      params.push(table);
      query += ` AND tbl_name = ?`;
    }
    query += ` ORDER BY name`;

    const rows = this.db.prepare(query).all(...params) as {
      tbl: string;
      name: string;
      sql: string;
    }[];

    return rows.map((r) => {
      const timingMatch = r.sql.match(/CREATE\s+TRIGGER\s+\S+\s+(BEFORE|AFTER|INSTEAD\s+OF)/i);
      const eventMatch = r.sql.match(/\s(INSERT|UPDATE|DELETE)\s+ON/i);
      return {
        schema: db,
        table: r.tbl,
        name: r.name,
        timing: timingMatch ? timingMatch[1].toUpperCase() : "AFTER",
        event: eventMatch ? eventMatch[1].toUpperCase() : "INSERT",
        function: r.sql,
      };
    });
  }

  async createTrigger(
    schema: string,
    table: string,
    name: string,
    options: { timing: string; event: string; function: string }
  ): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(table, "table name");
    validateIdentifier(name, "trigger name");
    const ref = this.tableRef(schema, table);
    // options.function must be the full trigger body: BEGIN ... END
    const sql = `CREATE TRIGGER "${name}" ${options.timing} ${options.event} ON ${ref}\nFOR EACH ROW\n${options.function}`;
    await this.recordMigrationInternal(sql, `create_trigger_${name}`);
    this.db.prepare(`DROP TRIGGER IF EXISTS "${name}"`).run();
    this.db.prepare(sql).run();
  }

  async dropTrigger(_schema: string, _table: string, name: string): Promise<void> {
    validateIdentifier(name, "trigger name");
    const sql = `DROP TRIGGER IF EXISTS "${name}"`;
    await this.recordMigrationInternal(sql, `drop_trigger_${name}`);
    this.db.prepare(sql).run();
  }

  // ── Functions ────────────────────────────────────────────────────────────────
  // SQLite user-defined functions must be registered via the application layer.

  async listFunctions(_schema?: string): Promise<FunctionInfo[]> {
    return [];
  }

  async createFunction(_schema: string, _name: string, _body: string, _options?: { args?: string; returns?: string; language?: string }): Promise<void> {
    notSupported("CREATE FUNCTION (SQLite user-defined functions must be registered via the application layer)");
  }

  async dropFunction(_schema: string, _name: string, _args?: string): Promise<void> {
    notSupported("DROP FUNCTION");
  }

  // ── Extensions ───────────────────────────────────────────────────────────────

  async listExtensions(): Promise<ExtensionInfo[]> {
    return [];
  }

  async createExtension(_name: string, _schema?: string): Promise<void> {
    notSupported("EXTENSION (SQLite extensions are loaded at the application layer)");
  }

  async dropExtension(_name: string): Promise<void> {
    notSupported("EXTENSION");
  }

  // ── Data operations ──────────────────────────────────────────────────────────

  async insertRows(
    schema: string,
    table: string,
    rows: Record<string, unknown>[]
  ): Promise<{ rowCount: number }> {
    validateIdentifier(schema, "schema");
    validateIdentifier(table, "table name");
    if (rows.length === 0) return { rowCount: 0 };

    const cols = Object.keys(rows[0]);
    cols.forEach((c) => validateIdentifier(c, "column"));
    const colList = cols.map((c) => `"${c}"`).join(", ");
    const placeholders = `(${cols.map(() => "?").join(", ")})`;
    const ref = this.tableRef(schema, table);
    const stmt = this.db.prepare(`INSERT INTO ${ref} (${colList}) VALUES ${placeholders}`);

    let total = 0;
    const insertAll = this.db.transaction(() => {
      for (const row of rows) {
        const values = cols.map((c) => row[c]);
        total += stmt.run(...values).changes;
      }
    });
    insertAll();
    return { rowCount: total };
  }

  async updateRows(
    schema: string,
    table: string,
    set: Record<string, unknown>,
    where?: Record<string, unknown>
  ): Promise<{ rowCount: number }> {
    validateIdentifier(schema, "schema");
    validateIdentifier(table, "table name");
    Object.keys(set).forEach((k) => validateIdentifier(k, "column"));
    const setParts = Object.keys(set).map((k) => `"${k}" = ?`);
    const params: unknown[] = Object.values(set);
    const ref = this.tableRef(schema, table);
    let sql = `UPDATE ${ref} SET ${setParts.join(", ")}`;
    if (where && Object.keys(where).length > 0) {
      Object.keys(where).forEach((k) => validateIdentifier(k, "column"));
      const whereParts = Object.keys(where).map((k) => `"${k}" = ?`);
      params.push(...Object.values(where));
      sql += ` WHERE ${whereParts.join(" AND ")}`;
    }
    const result = this.db.prepare(sql).run(...params);
    return { rowCount: result.changes };
  }

  async deleteRows(
    schema: string,
    table: string,
    where?: Record<string, unknown>
  ): Promise<{ rowCount: number }> {
    validateIdentifier(schema, "schema");
    validateIdentifier(table, "table name");
    const ref = this.tableRef(schema, table);
    let sql = `DELETE FROM ${ref}`;
    const params: unknown[] = [];
    if (where && Object.keys(where).length > 0) {
      Object.keys(where).forEach((k) => validateIdentifier(k, "column"));
      const whereParts = Object.keys(where).map((k) => `"${k}" = ?`);
      params.push(...Object.values(where));
      sql += ` WHERE ${whereParts.join(" AND ")}`;
    }
    const result = this.db.prepare(sql).run(...params);
    return { rowCount: result.changes };
  }

  // ── Roles / Auth ─────────────────────────────────────────────────────────────
  // SQLite has no user/role management.

  async listRoles(): Promise<RoleInfo[]> {
    return [];
  }
  async createRole(_name: string, _options?: { login?: boolean; password?: string; superuser?: boolean; createdb?: boolean; createrole?: boolean }): Promise<void> {
    notSupported("CREATE ROLE");
  }
  async alterRole(_name: string, _options: { password?: string; login?: boolean; createdb?: boolean; createrole?: boolean }): Promise<void> {
    notSupported("ALTER ROLE");
  }
  async dropRole(_name: string): Promise<void> {
    notSupported("DROP ROLE");
  }
  async grantRoleMembership(_roleToGrant: string, _granteeRole: string): Promise<void> {
    notSupported("GRANT ROLE");
  }
  async revokeRoleMembership(_roleToRevoke: string, _revokeeRole: string): Promise<void> {
    notSupported("REVOKE ROLE");
  }
  async grantSchema(_schema: string, _role: string, _privileges: string[]): Promise<void> {
    notSupported("GRANT SCHEMA");
  }
  async revokeSchema(_schema: string, _role: string, _privileges?: string[]): Promise<void> {
    notSupported("REVOKE SCHEMA");
  }
  async grantTable(_schema: string, _table: string, _role: string, _privileges: string[]): Promise<void> {
    notSupported("GRANT TABLE");
  }
  async revokeTable(_schema: string, _table: string, _role: string, _privileges?: string[]): Promise<void> {
    notSupported("REVOKE TABLE");
  }
  async grantAllTablesInSchema(_schema: string, _role: string, _privileges: string[]): Promise<void> {
    notSupported("GRANT ALL TABLES IN SCHEMA");
  }
  async revokeAllTablesInSchema(_schema: string, _role: string, _privileges?: string[]): Promise<void> {
    notSupported("REVOKE ALL TABLES IN SCHEMA");
  }
  async listGrantsForRole(_role: string): Promise<GrantInfo[]> {
    return [];
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
