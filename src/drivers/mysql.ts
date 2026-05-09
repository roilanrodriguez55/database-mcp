import mysql from "mysql2/promise";
import { log } from "../logger.js";
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
const SYSTEM_DBS = ["information_schema", "performance_schema", "mysql", "sys"];

function validateIdentifier(name: string, label: string): void {
  if (!IDENT_REGEX.test(name)) {
    throw new Error(`Invalid ${label}: ${name}`);
  }
}

function notSupported(feature: string): never {
  throw new Error(`MySQL does not support ${feature}`);
}

function q(name: string): string {
  return `\`${name}\``;
}

function tableRef(schema: string, name: string): string {
  return `${q(schema)}.${q(name)}`;
}

export class MySQLDriver implements IDatabaseDriver {
  private pool: mysql.Pool;
  private migrationRecorder?: MigrationRecorder;
  private databaseName?: string;

  constructor(
    connectionString: string,
    options?: { migrationRecorder?: MigrationRecorder; databaseName?: string }
  ) {
    this.pool = mysql.createPool(connectionString);
    this.migrationRecorder = options?.migrationRecorder;
    this.databaseName = options?.databaseName;
  }

  private async recordMigrationInternal(sql: string, description: string): Promise<void> {
    log("info", "ddl.executed", { database: this.databaseName, description, sql: sql.slice(0, 500) });
    if (this.migrationRecorder) await this.migrationRecorder(sql, description);
  }

  async recordMigration(sql: string, description: string): Promise<void> {
    await this.recordMigrationInternal(sql, description);
  }

  async execute(sql: string, params?: unknown[]): Promise<QueryResult> {
    try {
      const [result] = await this.pool.query(sql, params ?? []);
      if (Array.isArray(result)) {
        const rows = result as Record<string, unknown>[];
        return { rows, rowCount: rows.length };
      }
      const header = result as mysql.ResultSetHeader;
      return { rows: [], rowCount: header.affectedRows ?? 0 };
    } catch (err) {
      log("error", "query.error", {
        database: this.databaseName,
        message: err instanceof Error ? err.message : String(err),
        sql: sql.slice(0, 500),
      });
      throw err;
    }
  }

  // ── Schemas ──────────────────────────────────────────────────────────────────
  // In MySQL a "schema" is a "database".

  async listSchemas(includeSystem = false): Promise<SchemaInfo[]> {
    let sql = `SELECT SCHEMA_NAME as name FROM information_schema.SCHEMATA`;
    if (!includeSystem) {
      sql += ` WHERE SCHEMA_NAME NOT IN (${SYSTEM_DBS.map(() => "?").join(", ")})`;
    }
    sql += ` ORDER BY SCHEMA_NAME`;
    const params = includeSystem ? [] : SYSTEM_DBS;
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(sql, params);
    return rows as unknown as SchemaInfo[];
  }

  async createSchema(name: string, _options?: { owner?: string }): Promise<void> {
    validateIdentifier(name, "schema name");
    const sql = `CREATE DATABASE IF NOT EXISTS ${q(name)}`;
    await this.recordMigrationInternal(sql, `create_schema_${name}`);
    await this.pool.query(sql);
  }

  async getSchema(name: string): Promise<SchemaInfo | null> {
    validateIdentifier(name, "schema name");
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT SCHEMA_NAME as name FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [name]
    );
    return rows.length > 0 ? (rows[0] as unknown as SchemaInfo) : null;
  }

  async alterSchema(_name: string, _options: { newName?: string }): Promise<void> {
    notSupported("RENAME DATABASE (removed in MySQL 5.1.7)");
  }

  async dropSchema(name: string, _cascade = false): Promise<void> {
    validateIdentifier(name, "schema name");
    const sql = `DROP DATABASE IF EXISTS ${q(name)}`;
    await this.recordMigrationInternal(sql, `drop_schema_${name}`);
    await this.pool.query(sql);
  }

  // ── Tables ───────────────────────────────────────────────────────────────────

  async listTables(schema?: string, verbose = false): Promise<TableInfo[]> {
    let sql = `
      SELECT TABLE_SCHEMA as \`schema\`, TABLE_NAME as name
      FROM information_schema.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
    `;
    const params: unknown[] = [];
    if (schema) {
      params.push(schema);
      sql += ` AND TABLE_SCHEMA = ?`;
    } else {
      sql += ` AND TABLE_SCHEMA NOT IN (${SYSTEM_DBS.map(() => "?").join(", ")})`;
      params.push(...SYSTEM_DBS);
    }
    sql += ` ORDER BY TABLE_SCHEMA, TABLE_NAME`;

    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(sql, params);
    const tables = rows as unknown as TableInfo[];

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
      let def = `${q(c.name)} ${c.type}`;
      if (c.nullable === false) def += " NOT NULL";
      if (c.default) def += ` DEFAULT ${c.default}`;
      return def;
    });
    if (options?.primaryKey?.length) {
      colDefs.push(
        `PRIMARY KEY (${options.primaryKey.map((c) => q(c)).join(", ")})`
      );
    }
    if (options?.constraints?.length) {
      colDefs.push(...options.constraints);
    }
    const sql = `CREATE TABLE IF NOT EXISTS ${tableRef(schema, name)} (${colDefs.join(", ")})`;
    await this.recordMigrationInternal(sql, `create_table_${schema}_${name}`);
    await this.pool.query(sql);
  }

  async getTable(schema: string, name: string): Promise<TableInfo | null> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "table name");

    const [tableRows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_SCHEMA as \`schema\`, TABLE_NAME as name
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND TABLE_TYPE = 'BASE TABLE'`,
      [schema, name]
    );
    if (tableRows.length === 0) return null;
    const table = tableRows[0] as unknown as TableInfo;

    const [colRows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME as name, COLUMN_TYPE as type,
              (IS_NULLABLE = 'YES') as nullable, COLUMN_DEFAULT as \`default\`
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [schema, name]
    );
    table.columns = colRows.map((c) => ({
      name: c.name as string,
      type: c.type as string,
      nullable: Boolean(c.nullable),
      default: (c.default ?? undefined) as string | undefined,
    })) as ColumnInfo[];

    const [pkRows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
       ORDER BY ORDINAL_POSITION`,
      [schema, name]
    );
    table.primaryKey = pkRows.map((r) => r.COLUMN_NAME as string);

    const [fkRows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT kcu.COLUMN_NAME as \`column\`,
              kcu.REFERENCED_TABLE_SCHEMA as refSchema,
              kcu.REFERENCED_TABLE_NAME as refTable,
              kcu.REFERENCED_COLUMN_NAME as refColumn
       FROM information_schema.KEY_COLUMN_USAGE kcu
       JOIN information_schema.TABLE_CONSTRAINTS tc
         ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
         AND kcu.TABLE_SCHEMA = tc.TABLE_SCHEMA
         AND kcu.TABLE_NAME = tc.TABLE_NAME
       WHERE tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
         AND kcu.TABLE_SCHEMA = ? AND kcu.TABLE_NAME = ?`,
      [schema, name]
    );
    table.foreignKeys = fkRows as unknown as ForeignKeyInfo[];

    return table;
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
    const stmts: string[] = [];

    if (options.addColumns?.length) {
      for (const c of options.addColumns) {
        validateIdentifier(c.name, "column name");
        let def = `ADD COLUMN ${q(c.name)} ${c.type}`;
        if (c.nullable === false) def += " NOT NULL";
        if (c.default) def += ` DEFAULT ${c.default}`;
        stmts.push(`ALTER TABLE ${tableRef(schema, name)} ${def}`);
      }
    }
    if (options.dropColumns?.length) {
      for (const col of options.dropColumns) {
        validateIdentifier(col, "column name");
        stmts.push(`ALTER TABLE ${tableRef(schema, name)} DROP COLUMN ${q(col)}`);
      }
    }
    if (options.renameTo) {
      validateIdentifier(options.renameTo, "new table name");
      stmts.push(`RENAME TABLE ${tableRef(schema, name)} TO ${tableRef(schema, options.renameTo)}`);
    }
    if (stmts.length > 0) {
      const sql = stmts.join(";\n") + ";";
      await this.recordMigrationInternal(sql, `alter_table_${schema}_${name}`);
      for (const s of stmts) await this.pool.query(s);
    }
  }

  async dropTable(schema: string, name: string, _cascade = false): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "table name");
    const sql = `DROP TABLE IF EXISTS ${tableRef(schema, name)}`;
    await this.recordMigrationInternal(sql, `drop_table_${schema}_${name}`);
    await this.pool.query(sql);
  }

  // ── Indexes ──────────────────────────────────────────────────────────────────

  async listIndexes(schema?: string, table?: string): Promise<IndexInfo[]> {
    let sql = `
      SELECT TABLE_SCHEMA as \`schema\`, INDEX_NAME as name,
             TABLE_NAME as \`table\`,
             GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as cols,
             (NON_UNIQUE = 0) as \`unique\`
      FROM information_schema.STATISTICS
      WHERE INDEX_NAME != 'PRIMARY'
    `;
    const params: unknown[] = [];
    if (schema) {
      params.push(schema);
      sql += ` AND TABLE_SCHEMA = ?`;
    } else {
      sql += ` AND TABLE_SCHEMA NOT IN (${SYSTEM_DBS.map(() => "?").join(", ")})`;
      params.push(...SYSTEM_DBS);
    }
    if (table) {
      params.push(table);
      sql += ` AND TABLE_NAME = ?`;
    }
    sql += ` GROUP BY TABLE_SCHEMA, INDEX_NAME, TABLE_NAME, NON_UNIQUE ORDER BY TABLE_SCHEMA, \`table\`, name`;

    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(sql, params);
    return rows.map((r) => ({
      schema: r.schema as string,
      name: r.name as string,
      table: r.table as string,
      columns: (r.cols as string).split(","),
      unique: Boolean(r.unique),
    }));
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
    const colList = columns.map((c) => q(c)).join(", ");
    const sql = `CREATE ${unique}INDEX ${q(indexName)} ON ${tableRef(schema, table)} (${colList})`;
    await this.recordMigrationInternal(sql, `create_index_${indexName}`);
    await this.pool.query(sql);
  }

  async dropIndex(schema: string, name: string): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "index name");
    // MySQL requires the table name to drop an index — look it up first
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = ? AND INDEX_NAME = ? LIMIT 1`,
      [schema, name]
    );
    if (rows.length === 0) return;
    const tbl = rows[0].TABLE_NAME as string;
    const sql = `DROP INDEX ${q(name)} ON ${tableRef(schema, tbl)}`;
    await this.recordMigrationInternal(sql, `drop_index_${schema}_${name}`);
    await this.pool.query(sql);
  }

  // ── Views ────────────────────────────────────────────────────────────────────

  async listViews(schema?: string): Promise<ViewInfo[]> {
    let sql = `
      SELECT TABLE_SCHEMA as \`schema\`, TABLE_NAME as name, VIEW_DEFINITION as definition
      FROM information_schema.VIEWS
      WHERE TABLE_SCHEMA NOT IN (${SYSTEM_DBS.map(() => "?").join(", ")})
    `;
    const params: unknown[] = [...SYSTEM_DBS];
    if (schema) {
      params.push(schema);
      sql += ` AND TABLE_SCHEMA = ?`;
    }
    sql += ` ORDER BY TABLE_SCHEMA, TABLE_NAME`;
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(sql, params);
    return rows as unknown as ViewInfo[];
  }

  async createView(
    schema: string,
    name: string,
    query: string,
    options?: { replace?: boolean }
  ): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "view name");
    const orReplace = options?.replace ? "OR REPLACE " : "";
    const sql = `CREATE ${orReplace}VIEW ${tableRef(schema, name)} AS ${query}`;
    const migrationSql = `CREATE OR REPLACE VIEW ${tableRef(schema, name)} AS ${query}`;
    await this.recordMigrationInternal(migrationSql, `create_view_${schema}_${name}`);
    await this.pool.query(sql);
  }

  async getView(schema: string, name: string): Promise<ViewInfo | null> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "view name");
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_SCHEMA as \`schema\`, TABLE_NAME as name, VIEW_DEFINITION as definition
       FROM information_schema.VIEWS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [schema, name]
    );
    return rows.length > 0 ? (rows[0] as unknown as ViewInfo) : null;
  }

  async dropView(schema: string, name: string, _cascade = false): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "view name");
    const sql = `DROP VIEW IF EXISTS ${tableRef(schema, name)}`;
    await this.recordMigrationInternal(sql, `drop_view_${schema}_${name}`);
    await this.pool.query(sql);
  }

  // ── Sequences ────────────────────────────────────────────────────────────────
  // MySQL uses AUTO_INCREMENT — no SEQUENCE objects.

  async listSequences(_schema?: string): Promise<SequenceInfo[]> {
    return [];
  }

  async createSequence(_schema: string, _name: string, _options?: { start?: number; increment?: number }): Promise<void> {
    notSupported("SEQUENCE (use AUTO_INCREMENT instead)");
  }

  async dropSequence(_schema: string, _name: string): Promise<void> {
    notSupported("SEQUENCE");
  }

  // ── Triggers ─────────────────────────────────────────────────────────────────
  // MySQL triggers use inline BEGIN...END bodies, not EXECUTE FUNCTION.
  // When creating: pass the full trigger body (BEGIN ... END) in options.function.

  async listTriggers(schema?: string, table?: string): Promise<TriggerInfo[]> {
    let sql = `
      SELECT TRIGGER_SCHEMA as \`schema\`, EVENT_OBJECT_TABLE as \`table\`,
             TRIGGER_NAME as name, ACTION_TIMING as timing,
             EVENT_MANIPULATION as event, ACTION_STATEMENT as \`function\`
      FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA NOT IN (${SYSTEM_DBS.map(() => "?").join(", ")})
    `;
    const params: unknown[] = [...SYSTEM_DBS];
    if (schema) {
      params.push(schema);
      sql += ` AND TRIGGER_SCHEMA = ?`;
    }
    if (table) {
      params.push(table);
      sql += ` AND EVENT_OBJECT_TABLE = ?`;
    }
    sql += ` ORDER BY \`schema\`, \`table\`, name`;
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(sql, params);
    return rows as unknown as TriggerInfo[];
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
    const dropSql = `DROP TRIGGER IF EXISTS ${tableRef(schema, name)}`;
    const createSql = `CREATE TRIGGER ${q(name)} ${options.timing} ${options.event}
      ON ${tableRef(schema, table)} FOR EACH ROW\n${options.function}`;
    const migrationSql = `${dropSql};\n${createSql}`;
    await this.recordMigrationInternal(migrationSql, `create_trigger_${name}`);
    await this.pool.query(dropSql);
    await this.pool.query(createSql);
  }

  async dropTrigger(schema: string, _table: string, name: string): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "trigger name");
    const sql = `DROP TRIGGER IF EXISTS ${tableRef(schema, name)}`;
    await this.recordMigrationInternal(sql, `drop_trigger_${name}`);
    await this.pool.query(sql);
  }

  // ── Functions ────────────────────────────────────────────────────────────────

  async listFunctions(schema?: string): Promise<FunctionInfo[]> {
    let sql = `
      SELECT ROUTINE_SCHEMA as \`schema\`, ROUTINE_NAME as name,
             ROUTINE_DEFINITION as body
      FROM information_schema.ROUTINES
      WHERE ROUTINE_TYPE = 'FUNCTION'
        AND ROUTINE_SCHEMA NOT IN (${SYSTEM_DBS.map(() => "?").join(", ")})
    `;
    const params: unknown[] = [...SYSTEM_DBS];
    if (schema) {
      params.push(schema);
      sql += ` AND ROUTINE_SCHEMA = ?`;
    }
    sql += ` ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME`;
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(sql, params);
    return rows as unknown as FunctionInfo[];
  }

  async createFunction(
    schema: string,
    name: string,
    body: string,
    options?: { args?: string; returns?: string; language?: string }
  ): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "name");
    const args = options?.args ?? "";
    const returns = options?.returns ?? "INT";
    const sql = `CREATE FUNCTION ${tableRef(schema, name)}(${args}) RETURNS ${returns}
      DETERMINISTIC BEGIN ${body} END`;
    await this.recordMigrationInternal(sql, `create_function_${schema}_${name}`);
    await this.pool.query(sql);
  }

  async dropFunction(schema: string, name: string, _args?: string): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "name");
    const sql = `DROP FUNCTION IF EXISTS ${tableRef(schema, name)}`;
    await this.recordMigrationInternal(sql, `drop_function_${schema}_${name}`);
    await this.pool.query(sql);
  }

  // ── Extensions ───────────────────────────────────────────────────────────────

  async listExtensions(): Promise<ExtensionInfo[]> {
    return [];
  }

  async createExtension(_name: string, _schema?: string): Promise<void> {
    notSupported("EXTENSION");
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
    const colList = cols.map((c) => q(c)).join(", ");
    const placeholders = rows
      .map(() => `(${cols.map(() => "?").join(", ")})`)
      .join(", ");
    const params = rows.flatMap((r) => cols.map((c) => r[c]));
    const [result] = await this.pool.query(
      `INSERT INTO ${tableRef(schema, table)} (${colList}) VALUES ${placeholders}`,
      params
    );
    const rowCount = (result as mysql.ResultSetHeader).affectedRows ?? 0;
    log("info", "data.insert", { database: this.databaseName, schema, table, rowCount });
    return { rowCount };
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
    const setParts = Object.keys(set).map((k) => `${q(k)} = ?`);
    const params: unknown[] = Object.values(set);
    let sql = `UPDATE ${tableRef(schema, table)} SET ${setParts.join(", ")}`;
    if (where && Object.keys(where).length > 0) {
      Object.keys(where).forEach((k) => validateIdentifier(k, "column"));
      const whereParts = Object.keys(where).map((k) => `${q(k)} = ?`);
      params.push(...Object.values(where));
      sql += ` WHERE ${whereParts.join(" AND ")}`;
    }
    const [result] = await this.pool.query(sql, params);
    const rowCount = (result as mysql.ResultSetHeader).affectedRows ?? 0;
    log("info", "data.update", { database: this.databaseName, schema, table, rowCount });
    return { rowCount };
  }

  async deleteRows(
    schema: string,
    table: string,
    where?: Record<string, unknown>
  ): Promise<{ rowCount: number }> {
    validateIdentifier(schema, "schema");
    validateIdentifier(table, "table name");
    let sql = `DELETE FROM ${tableRef(schema, table)}`;
    const params: unknown[] = [];
    if (where && Object.keys(where).length > 0) {
      Object.keys(where).forEach((k) => validateIdentifier(k, "column"));
      const whereParts = Object.keys(where).map((k) => `${q(k)} = ?`);
      params.push(...Object.values(where));
      sql += ` WHERE ${whereParts.join(" AND ")}`;
    }
    const [result] = await this.pool.query(sql, params);
    const rowCount = (result as mysql.ResultSetHeader).affectedRows ?? 0;
    log("info", "data.delete", { database: this.databaseName, schema, table, rowCount });
    return { rowCount };
  }

  // ── Roles / Auth (MySQL 8+) ──────────────────────────────────────────────────

  async listRoles(): Promise<RoleInfo[]> {
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(`
      SELECT User as name,
        (account_locked = 'N') as canLogin,
        (Super_priv = 'Y') as isSuperuser,
        (Create_db_priv = 'Y') as canCreateDb,
        (Create_role_priv = 'Y') as canCreateRole
      FROM mysql.user
      WHERE User NOT LIKE 'mysql.%' AND User != ''
      ORDER BY User
    `);
    return rows.map((r) => ({
      name: r.name as string,
      canLogin: Boolean(r.canLogin),
      isSuperuser: Boolean(r.isSuperuser),
      canCreateDb: Boolean(r.canCreateDb),
      canCreateRole: Boolean(r.canCreateRole),
    }));
  }

  async createRole(
    name: string,
    options?: { login?: boolean; password?: string; superuser?: boolean; createdb?: boolean; createrole?: boolean }
  ): Promise<void> {
    validateIdentifier(name, "role name");
    await this.pool.query(`CREATE ROLE IF NOT EXISTS ${q(name)}`);
    if (options?.password) {
      const escaped = options.password.replace(/'/g, "''");
      await this.pool.query(`ALTER USER ${q(name)} IDENTIFIED BY '${escaped}'`);
    }
    if (options?.login) {
      await this.pool.query(`ALTER USER ${q(name)} ACCOUNT UNLOCK`);
    }
  }

  async alterRole(
    name: string,
    options: { password?: string; login?: boolean; createdb?: boolean; createrole?: boolean }
  ): Promise<void> {
    validateIdentifier(name, "role name");
    if (options.password !== undefined) {
      const escaped = options.password.replace(/'/g, "''");
      await this.pool.query(`ALTER USER ${q(name)} IDENTIFIED BY '${escaped}'`);
    }
    if (options.login !== undefined) {
      const lock = options.login ? "ACCOUNT UNLOCK" : "ACCOUNT LOCK";
      await this.pool.query(`ALTER USER ${q(name)} ${lock}`);
    }
  }

  async dropRole(name: string): Promise<void> {
    validateIdentifier(name, "role name");
    await this.pool.query(`DROP ROLE IF EXISTS ${q(name)}`);
  }

  async grantRoleMembership(roleToGrant: string, granteeRole: string): Promise<void> {
    validateIdentifier(roleToGrant, "role to grant");
    validateIdentifier(granteeRole, "grantee role");
    await this.pool.query(`GRANT ${q(roleToGrant)} TO ${q(granteeRole)}`);
  }

  async revokeRoleMembership(roleToRevoke: string, revokeeRole: string): Promise<void> {
    validateIdentifier(roleToRevoke, "role to revoke");
    validateIdentifier(revokeeRole, "revokee role");
    await this.pool.query(`REVOKE ${q(roleToRevoke)} FROM ${q(revokeeRole)}`);
  }

  async grantSchema(schema: string, role: string, privileges: string[]): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(role, "role");
    const valid = ["CREATE", "ALTER", "DROP", "INDEX", "CREATE ROUTINE", "ALTER ROUTINE", "CREATE TEMPORARY TABLES", "LOCK TABLES", "REFERENCES", "ALL"];
    const privs = privileges.map((p) => p.toUpperCase()).filter((p) => valid.includes(p));
    if (privs.length === 0) throw new Error(`Valid schema privileges: ${valid.join(", ")}`);
    await this.pool.query(`GRANT ${privs.join(", ")} ON ${q(schema)}.* TO ${q(role)}`);
  }

  async revokeSchema(schema: string, role: string, privileges?: string[]): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(role, "role");
    const privs = privileges?.length ? privileges.map((p) => p.toUpperCase()).join(", ") : "ALL PRIVILEGES";
    await this.pool.query(`REVOKE ${privs} ON ${q(schema)}.* FROM ${q(role)}`);
  }

  async grantTable(schema: string, table: string, role: string, privileges: string[]): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(table, "table");
    validateIdentifier(role, "role");
    const valid = ["SELECT", "INSERT", "UPDATE", "DELETE", "ALL", "REFERENCES"];
    const privs = privileges.map((p) => p.toUpperCase()).filter((p) => valid.includes(p));
    if (privs.length === 0) throw new Error("Valid table privileges: SELECT, INSERT, UPDATE, DELETE, ALL, REFERENCES");
    await this.pool.query(`GRANT ${privs.join(", ")} ON ${tableRef(schema, table)} TO ${q(role)}`);
  }

  async revokeTable(schema: string, table: string, role: string, privileges?: string[]): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(table, "table");
    validateIdentifier(role, "role");
    const privs = privileges?.length ? privileges.map((p) => p.toUpperCase()).join(", ") : "ALL PRIVILEGES";
    await this.pool.query(`REVOKE ${privs} ON ${tableRef(schema, table)} FROM ${q(role)}`);
  }

  async grantAllTablesInSchema(schema: string, role: string, privileges: string[]): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(role, "role");
    const valid = ["SELECT", "INSERT", "UPDATE", "DELETE", "ALL", "REFERENCES"];
    const privs = privileges.map((p) => p.toUpperCase()).filter((p) => valid.includes(p));
    if (privs.length === 0) throw new Error("Valid table privileges: SELECT, INSERT, UPDATE, DELETE, ALL, REFERENCES");
    await this.pool.query(`GRANT ${privs.join(", ")} ON ${q(schema)}.* TO ${q(role)}`);
  }

  async revokeAllTablesInSchema(schema: string, role: string, privileges?: string[]): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(role, "role");
    const privs = privileges?.length ? privileges.map((p) => p.toUpperCase()).join(", ") : "ALL PRIVILEGES";
    await this.pool.query(`REVOKE ${privs} ON ${q(schema)}.* FROM ${q(role)}`);
  }

  async listGrantsForRole(role: string): Promise<GrantInfo[]> {
    validateIdentifier(role, "role");
    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_SCHEMA as \`schema\`, TABLE_NAME as object, PRIVILEGE_TYPE as privilege
       FROM information_schema.TABLE_PRIVILEGES
       WHERE GRANTEE = ?`,
      [`'${role}'@'%'`]
    );
    const grouped = new Map<string, { schema: string; object: string; privs: string[] }>();
    for (const r of rows) {
      const key = `${r.schema as string}.${r.object as string}`;
      if (!grouped.has(key)) grouped.set(key, { schema: r.schema as string, object: r.object as string, privs: [] });
      grouped.get(key)!.privs.push(r.privilege as string);
    }
    return [...grouped.values()].map(({ schema, object, privs }) => ({
      role,
      type: "table" as const,
      schema,
      object,
      privileges: privs,
    }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
