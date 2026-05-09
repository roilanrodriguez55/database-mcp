import odbc from "odbc";
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

type OdbcParams = Array<number | string>;

function validateIdentifier(name: string, label: string): void {
  if (!name || name.includes("]") || name.includes("\0")) {
    throw new Error(`Invalid ${label}: ${name}`);
  }
}

function notSupported(feature: string): never {
  throw new Error(`Microsoft Access does not support ${feature}`);
}

function q(name: string): string {
  return `[${name}]`;
}

function buildConnectionString(input: string): string {
  const lower = input.toLowerCase();
  if (lower.startsWith("driver=") || lower.startsWith("dsn=")) return input;
  return `Driver={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=${input};`;
}

interface AccessTableRow {
  TABLE_NAME: string;
}

interface AccessColumnRow {
  COLUMN_NAME: string;
  TYPE_NAME: string;
  NULLABLE: number;
  COLUMN_DEF: string | null;
}

interface AccessPkRow {
  KEY_SEQ: number;
  COLUMN_NAME: string;
}

interface AccessFkRow {
  PKTABLE_NAME: string;
  PKCOLUMN_NAME: string;
  FKCOLUMN_NAME: string;
}

interface AccessStatRow {
  INDEX_NAME: string | null;
  COLUMN_NAME: string | null;
  TABLE_NAME: string;
  ORDINAL_POSITION: number;
  NON_UNIQUE: number;
}

export class AccessDriver implements IDatabaseDriver {
  private conn: odbc.Connection | null = null;
  private readonly connectionString: string;
  private migrationRecorder?: MigrationRecorder;

  constructor(
    connectionString: string,
    options?: { migrationRecorder?: MigrationRecorder }
  ) {
    this.connectionString = buildConnectionString(connectionString);
    this.migrationRecorder = options?.migrationRecorder;
  }

  private async getConn(): Promise<odbc.Connection> {
    if (!this.conn) this.conn = await odbc.connect(this.connectionString);
    return this.conn;
  }

  private async record(sql: string, description: string): Promise<void> {
    if (this.migrationRecorder) await this.migrationRecorder(sql, description);
  }

  async recordMigration(sql: string, description: string): Promise<void> {
    await this.record(sql, description);
  }

  async execute(sql: string, params?: unknown[]): Promise<QueryResult> {
    const conn = await this.getConn();
    const result = await conn.query<Record<string, unknown>>(
      sql,
      (params ?? []) as OdbcParams
    );
    const isSelect = /^\s*(SELECT|WITH)\s/i.test(sql);
    return {
      rows: isSelect ? [...result] : [],
      rowCount: isSelect ? result.length : result.count,
    };
  }

  // ── Schemas ──────────────────────────────────────────────────────────────────
  // Access has no schema concept; always return a single virtual "default" schema.

  async listSchemas(_includeSystem = false): Promise<SchemaInfo[]> {
    return [{ name: "default" }];
  }

  async createSchema(_name: string, _options?: { owner?: string }): Promise<void> {
    notSupported("schemas");
  }

  async getSchema(name: string): Promise<SchemaInfo | null> {
    return name === "default" ? { name: "default" } : null;
  }

  async alterSchema(_name: string, _options: { newName?: string }): Promise<void> {
    notSupported("schemas");
  }

  async dropSchema(_name: string, _cascade = false): Promise<void> {
    notSupported("schemas");
  }

  // ── Tables ───────────────────────────────────────────────────────────────────

  async listTables(_schema?: string, verbose = false): Promise<TableInfo[]> {
    const conn = await this.getConn();
    const rows = await conn.tables<AccessTableRow>(null, null, null, "TABLE");
    const tables: TableInfo[] = rows.map((r) => ({
      schema: "default",
      name: r.TABLE_NAME,
    }));
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
    _schema: string,
    name: string,
    columns: ColumnDef[],
    options?: { primaryKey?: string[]; constraints?: string[] }
  ): Promise<void> {
    validateIdentifier(name, "table name");
    const colDefs = columns.map((c) => {
      validateIdentifier(c.name, "column name");
      let def = `${q(c.name)} ${c.type}`;
      if (c.nullable === false) def += " NOT NULL";
      if (c.default) def += ` DEFAULT ${c.default}`;
      return def;
    });
    if (options?.primaryKey?.length) {
      colDefs.push(
        `CONSTRAINT [PK_${name}] PRIMARY KEY (${options.primaryKey.map((c) => q(c)).join(", ")})`
      );
    }
    if (options?.constraints?.length) colDefs.push(...options.constraints);
    const sql = `CREATE TABLE ${q(name)} (${colDefs.join(", ")})`;
    await this.record(sql, `create_table_${name}`);
    const conn = await this.getConn();
    await conn.query(sql);
  }

  async getTable(_schema: string, name: string): Promise<TableInfo | null> {
    validateIdentifier(name, "table name");
    const conn = await this.getConn();

    const tableRows = await conn.tables<AccessTableRow>(null, null, name, "TABLE");
    if (tableRows.length === 0) return null;

    const colRows = await conn.columns<AccessColumnRow>(null, null, name, null);
    const columns: ColumnInfo[] = colRows.map((c) => ({
      name: c.COLUMN_NAME,
      type: c.TYPE_NAME,
      nullable: c.NULLABLE === 1,
      default: c.COLUMN_DEF ?? undefined,
    }));

    const pkRows = await conn.primaryKeys<AccessPkRow>(null, null, name);
    const primaryKey = [...pkRows]
      .sort((a, b) => a.KEY_SEQ - b.KEY_SEQ)
      .map((r) => r.COLUMN_NAME);

    const fkRows = await conn.foreignKeys<AccessFkRow>(null, null, null, null, null, name);
    const foreignKeys: ForeignKeyInfo[] = fkRows.map((r) => ({
      column: r.FKCOLUMN_NAME,
      refSchema: "default",
      refTable: r.PKTABLE_NAME,
      refColumn: r.PKCOLUMN_NAME,
    }));

    return { schema: "default", name, columns, primaryKey, foreignKeys };
  }

  async alterTable(
    _schema: string,
    name: string,
    options: { addColumns?: ColumnDef[]; dropColumns?: string[]; renameTo?: string }
  ): Promise<void> {
    validateIdentifier(name, "table name");
    if (options.renameTo) notSupported("RENAME TABLE via SQL (use Access UI)");

    const conn = await this.getConn();
    const stmts: string[] = [];

    if (options.addColumns?.length) {
      for (const c of options.addColumns) {
        validateIdentifier(c.name, "column name");
        let def = `ADD COLUMN ${q(c.name)} ${c.type}`;
        if (c.nullable === false) def += " NOT NULL";
        if (c.default) def += ` DEFAULT ${c.default}`;
        stmts.push(`ALTER TABLE ${q(name)} ${def}`);
      }
    }
    if (options.dropColumns?.length) {
      for (const col of options.dropColumns) {
        validateIdentifier(col, "column name");
        stmts.push(`ALTER TABLE ${q(name)} DROP COLUMN ${q(col)}`);
      }
    }
    if (stmts.length > 0) {
      const sql = stmts.join(";\n");
      await this.record(sql, `alter_table_${name}`);
      for (const s of stmts) await conn.query(s);
    }
  }

  async dropTable(_schema: string, name: string, _cascade = false): Promise<void> {
    validateIdentifier(name, "table name");
    const sql = `DROP TABLE ${q(name)}`;
    await this.record(sql, `drop_table_${name}`);
    const conn = await this.getConn();
    try { await conn.query(sql); } catch { /* ignore if not exists */ }
  }

  // ── Indexes ──────────────────────────────────────────────────────────────────
  // statistics() is part of the ODBC spec but not exposed in the package types.
  // We cast to access it at runtime.

  private async getStatistics(conn: odbc.Connection, table: string): Promise<AccessStatRow[]> {
    type ConnWithStats = odbc.Connection & {
      statistics<T>(c: null, s: null, t: string, u: number, r: number): Promise<odbc.Result<T>>;
    };
    try {
      return await (conn as ConnWithStats).statistics<AccessStatRow>(null, null, table, 0, 0);
    } catch {
      return [];
    }
  }

  async listIndexes(_schema?: string, table?: string): Promise<IndexInfo[]> {
    const conn = await this.getConn();
    const tablesToScan = table
      ? [table]
      : (await conn.tables<AccessTableRow>(null, null, null, "TABLE")).map((r) => r.TABLE_NAME);

    const grouped = new Map<string, { table: string; name: string; cols: { seq: number; col: string }[]; unique: boolean }>();
    for (const tbl of tablesToScan) {
      const rows = await this.getStatistics(conn, tbl);
      for (const r of rows) {
        if (!r.INDEX_NAME || !r.COLUMN_NAME) continue;
        if (!grouped.has(r.INDEX_NAME)) {
          grouped.set(r.INDEX_NAME, {
            table: r.TABLE_NAME,
            name: r.INDEX_NAME,
            cols: [],
            unique: r.NON_UNIQUE === 0,
          });
        }
        grouped.get(r.INDEX_NAME)!.cols.push({ seq: r.ORDINAL_POSITION, col: r.COLUMN_NAME });
      }
    }
    return [...grouped.values()].map(({ table: tbl, name, cols, unique }) => ({
      schema: "default",
      name,
      table: tbl,
      columns: cols.sort((a, b) => a.seq - b.seq).map((c) => c.col),
      unique,
    }));
  }

  async createIndex(
    _schema: string,
    table: string,
    columns: string[],
    options?: { name?: string; unique?: boolean }
  ): Promise<void> {
    validateIdentifier(table, "table name");
    const indexName = options?.name ?? `${table}_${columns.join("_")}_idx`;
    validateIdentifier(indexName, "index name");
    columns.forEach((c) => validateIdentifier(c, "column"));
    const unique = options?.unique ? "UNIQUE " : "";
    const colList = columns.map((c) => q(c)).join(", ");
    const sql = `CREATE ${unique}INDEX ${q(indexName)} ON ${q(table)} (${colList})`;
    await this.record(sql, `create_index_${indexName}`);
    const conn = await this.getConn();
    await conn.query(sql);
  }

  async dropIndex(_schema: string, name: string): Promise<void> {
    validateIdentifier(name, "index name");
    const conn = await this.getConn();
    const allTables = await conn.tables<AccessTableRow>(null, null, null, "TABLE");
    for (const tbl of allTables) {
      try {
        const sql = `DROP INDEX ${q(name)} ON ${q(tbl.TABLE_NAME)}`;
        await this.record(sql, `drop_index_${name}`);
        await conn.query(sql);
        return;
      } catch {
        // Not on this table, continue searching
      }
    }
    throw new Error(`Index [${name}] not found in any table`);
  }

  // ── Views ────────────────────────────────────────────────────────────────────
  // Access calls views "queries"; CREATE/DROP VIEW work over ODBC.

  async listViews(_schema?: string): Promise<ViewInfo[]> {
    const conn = await this.getConn();
    const rows = await conn.tables<AccessTableRow>(null, null, null, "VIEW");
    return rows.map((r) => ({
      schema: "default",
      name: r.TABLE_NAME,
    }));
  }

  async createView(
    _schema: string,
    name: string,
    query: string,
    _options?: { replace?: boolean }
  ): Promise<void> {
    validateIdentifier(name, "view name");
    const conn = await this.getConn();
    try { await conn.query(`DROP VIEW ${q(name)}`); } catch { /* doesn't exist */ }
    const sql = `CREATE VIEW ${q(name)} AS ${query}`;
    await this.record(sql, `create_view_${name}`);
    await conn.query(sql);
  }

  async getView(_schema: string, name: string): Promise<ViewInfo | null> {
    validateIdentifier(name, "view name");
    const conn = await this.getConn();
    const rows = await conn.tables<AccessTableRow>(null, null, name, "VIEW");
    return rows.length > 0 ? { schema: "default", name } : null;
  }

  async dropView(_schema: string, name: string, _cascade = false): Promise<void> {
    validateIdentifier(name, "view name");
    const sql = `DROP VIEW ${q(name)}`;
    await this.record(sql, `drop_view_${name}`);
    const conn = await this.getConn();
    try { await conn.query(sql); } catch { /* ignore if not exists */ }
  }

  // ── Sequences ────────────────────────────────────────────────────────────────
  // Access uses AUTOINCREMENT/COUNTER — no SEQUENCE objects.

  async listSequences(_schema?: string): Promise<SequenceInfo[]> { return []; }

  async createSequence(_schema: string, _name: string, _options?: { start?: number; increment?: number }): Promise<void> {
    notSupported("SEQUENCE (use AUTOINCREMENT or COUNTER column type instead)");
  }

  async dropSequence(_schema: string, _name: string): Promise<void> {
    notSupported("SEQUENCE");
  }

  // ── Triggers ─────────────────────────────────────────────────────────────────
  // Access has no SQL-level triggers; automation is done via VBA/macros.

  async listTriggers(_schema?: string, _table?: string): Promise<TriggerInfo[]> { return []; }

  async createTrigger(_schema: string, _table: string, _name: string, _options: { timing: string; event: string; function: string }): Promise<void> {
    notSupported("SQL triggers (use VBA event procedures or Access macros)");
  }

  async dropTrigger(_schema: string, _table: string, _name: string): Promise<void> {
    notSupported("SQL triggers");
  }

  // ── Functions ────────────────────────────────────────────────────────────────

  async listFunctions(_schema?: string): Promise<FunctionInfo[]> { return []; }

  async createFunction(_schema: string, _name: string, _body: string, _options?: { args?: string; returns?: string; language?: string }): Promise<void> {
    notSupported("SQL functions (use VBA modules in Access)");
  }

  async dropFunction(_schema: string, _name: string, _args?: string): Promise<void> {
    notSupported("SQL functions");
  }

  // ── Extensions ───────────────────────────────────────────────────────────────

  async listExtensions(): Promise<ExtensionInfo[]> { return []; }
  async createExtension(_name: string, _schema?: string): Promise<void> { notSupported("extensions"); }
  async dropExtension(_name: string): Promise<void> { notSupported("extensions"); }

  // ── Data operations ──────────────────────────────────────────────────────────

  async insertRows(
    _schema: string,
    table: string,
    rows: Record<string, unknown>[]
  ): Promise<{ rowCount: number }> {
    validateIdentifier(table, "table name");
    if (rows.length === 0) return { rowCount: 0 };
    const conn = await this.getConn();
    const cols = Object.keys(rows[0]);
    cols.forEach((c) => validateIdentifier(c, "column"));
    const colList = cols.map((c) => q(c)).join(", ");
    const placeholders = cols.map(() => "?").join(", ");
    let total = 0;
    for (const row of rows) {
      const params = cols.map((c) => row[c]) as OdbcParams;
      const result = await conn.query(
        `INSERT INTO ${q(table)} (${colList}) VALUES (${placeholders})`,
        params
      );
      total += result.count ?? 1;
    }
    return { rowCount: total };
  }

  async updateRows(
    _schema: string,
    table: string,
    set: Record<string, unknown>,
    where?: Record<string, unknown>
  ): Promise<{ rowCount: number }> {
    validateIdentifier(table, "table name");
    Object.keys(set).forEach((k) => validateIdentifier(k, "column"));
    const setParts = Object.keys(set).map((k) => `${q(k)} = ?`);
    const params: unknown[] = Object.values(set);
    let sql = `UPDATE ${q(table)} SET ${setParts.join(", ")}`;
    if (where && Object.keys(where).length > 0) {
      Object.keys(where).forEach((k) => validateIdentifier(k, "column"));
      const whereParts = Object.keys(where).map((k) => `${q(k)} = ?`);
      params.push(...Object.values(where));
      sql += ` WHERE ${whereParts.join(" AND ")}`;
    }
    const conn = await this.getConn();
    const result = await conn.query(sql, params as OdbcParams);
    return { rowCount: result.count ?? 0 };
  }

  async deleteRows(
    _schema: string,
    table: string,
    where?: Record<string, unknown>
  ): Promise<{ rowCount: number }> {
    validateIdentifier(table, "table name");
    let sql = `DELETE FROM ${q(table)}`;
    const params: unknown[] = [];
    if (where && Object.keys(where).length > 0) {
      Object.keys(where).forEach((k) => validateIdentifier(k, "column"));
      const whereParts = Object.keys(where).map((k) => `${q(k)} = ?`);
      params.push(...Object.values(where));
      sql += ` WHERE ${whereParts.join(" AND ")}`;
    }
    const conn = await this.getConn();
    const result = await conn.query(sql, params as OdbcParams);
    return { rowCount: result.count ?? 0 };
  }

  // ── Roles / Auth ─────────────────────────────────────────────────────────────
  // Access workgroup security (MDW) is deprecated in modern .accdb files.

  async listRoles(): Promise<RoleInfo[]> { return []; }
  async createRole(_name: string, _options?: { login?: boolean; password?: string; superuser?: boolean; createdb?: boolean; createrole?: boolean }): Promise<void> {
    notSupported("roles (Access workgroup security is deprecated)");
  }
  async alterRole(_name: string, _options: { password?: string; login?: boolean; createdb?: boolean; createrole?: boolean }): Promise<void> {
    notSupported("roles");
  }
  async dropRole(_name: string): Promise<void> { notSupported("roles"); }
  async grantRoleMembership(_r: string, _g: string): Promise<void> { notSupported("role membership"); }
  async revokeRoleMembership(_r: string, _g: string): Promise<void> { notSupported("role membership"); }
  async grantSchema(_s: string, _r: string, _p: string[]): Promise<void> { notSupported("schema grants"); }
  async revokeSchema(_s: string, _r: string, _p?: string[]): Promise<void> { notSupported("schema grants"); }
  async grantTable(_s: string, _t: string, _r: string, _p: string[]): Promise<void> { notSupported("table grants"); }
  async revokeTable(_s: string, _t: string, _r: string, _p?: string[]): Promise<void> { notSupported("table grants"); }
  async grantAllTablesInSchema(_s: string, _r: string, _p: string[]): Promise<void> { notSupported("schema-level grants"); }
  async revokeAllTablesInSchema(_s: string, _r: string, _p?: string[]): Promise<void> { notSupported("schema-level grants"); }
  async listGrantsForRole(_role: string): Promise<GrantInfo[]> { return []; }

  async close(): Promise<void> {
    if (this.conn) {
      await this.conn.close();
      this.conn = null;
    }
  }
}
