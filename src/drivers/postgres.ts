import { Pool } from "pg";
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

const IDENT_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function validateIdentifier(name: string, label: string): void {
  if (!IDENT_REGEX.test(name)) {
    throw new Error(`Invalid ${label}: ${name}`);
  }
}

export type MigrationRecorder = (sql: string, description: string) => Promise<void>;

export class PostgresDriver implements IDatabaseDriver {
  private pool: Pool;
  private migrationRecorder?: MigrationRecorder;

  constructor(
    connectionString: string,
    options?: { migrationRecorder?: MigrationRecorder }
  ) {
    this.pool = new Pool({ connectionString });
    this.migrationRecorder = options?.migrationRecorder;
  }

  private async recordMigrationInternal(sql: string, description: string): Promise<void> {
    if (this.migrationRecorder) await this.migrationRecorder(sql, description);
  }

  /** Exposed for tools that run raw SQL (e.g. db_execute_sql) */
  async recordMigration(sql: string, description: string): Promise<void> {
    await this.recordMigrationInternal(sql, description);
  }

  async execute(sql: string, params?: unknown[]): Promise<QueryResult> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params ?? []);
      return {
        rows: (result.rows as Record<string, unknown>[]) ?? [],
        rowCount: result.rowCount ?? 0,
      };
    } finally {
      client.release();
    }
  }

  async listSchemas(includeSystem = false): Promise<SchemaInfo[]> {
    let sql = `
      SELECT nspname as name, rolname as owner
      FROM pg_namespace n
      LEFT JOIN pg_roles r ON n.nspowner = r.oid
      WHERE nspname NOT LIKE 'pg_temp%' AND nspname NOT LIKE 'pg_toast%'
    `;
    if (!includeSystem) {
      sql += ` AND nspname NOT IN ('pg_catalog', 'information_schema')`;
    }
    sql += ` ORDER BY nspname`;
    const { rows } = await this.execute(sql);
    return rows as unknown as SchemaInfo[];
  }

  async createSchema(name: string, options?: { owner?: string }): Promise<void> {
    validateIdentifier(name, "schema name");
    let sql = `CREATE SCHEMA IF NOT EXISTS "${name}"`;
    if (options?.owner) {
      validateIdentifier(options.owner, "owner");
      sql += ` AUTHORIZATION "${options.owner}"`;
    }
    sql += ";";
    await this.recordMigrationInternal(sql, `create_schema_${name}`);
    await this.execute(sql);
  }

  async getSchema(name: string): Promise<SchemaInfo | null> {
    validateIdentifier(name, "schema name");
    const { rows } = await this.execute(
      `SELECT nspname as name, rolname as owner
       FROM pg_namespace n
       LEFT JOIN pg_roles r ON n.nspowner = r.oid
       WHERE nspname = $1`,
      [name]
    );
    return rows.length > 0 ? (rows[0] as unknown as SchemaInfo) : null;
  }

  async alterSchema(name: string, options: { newName?: string }): Promise<void> {
    validateIdentifier(name, "schema name");
    if (options.newName) {
      validateIdentifier(options.newName, "new schema name");
      const sql = `ALTER SCHEMA "${name}" RENAME TO "${options.newName}"`;
      await this.recordMigrationInternal(sql, `alter_schema_${name}_rename`);
      await this.execute(sql);
    }
  }

  async dropSchema(name: string, cascade = false): Promise<void> {
    validateIdentifier(name, "schema name");
    const suffix = cascade ? " CASCADE" : "";
    const sql = `DROP SCHEMA IF EXISTS "${name}"${suffix}`;
    await this.recordMigrationInternal(sql, `drop_schema_${name}`);
    await this.execute(sql);
  }

  async listTables(schema?: string, verbose = false): Promise<TableInfo[]> {
    const schemaFilter = schema
      ? `AND t.table_schema = $1`
      : `AND t.table_schema NOT IN ('pg_catalog', 'information_schema')`;
    const params = schema ? [schema] : [];

    let sql = `
      SELECT t.table_schema as schema, t.table_name as name
      FROM information_schema.tables t
      WHERE t.table_type = 'BASE TABLE' ${schemaFilter}
      ORDER BY t.table_schema, t.table_name
    `;
    const { rows } = await this.execute(sql, params);
    const tables = rows as unknown as TableInfo[];

    if (verbose && tables.length > 0) {
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
    const fullName = `"${schema}"."${name}"`;
    const sql = `CREATE TABLE IF NOT EXISTS ${fullName} (${colDefs.join(", ")})`;
    await this.recordMigrationInternal(sql, `create_table_${schema}_${name}`);
    await this.execute(sql);
  }

  async getTable(schema: string, name: string): Promise<TableInfo | null> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "table name");
    const { rows } = await this.execute(
      `SELECT table_schema as schema, table_name as name
       FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = $2 AND table_type = 'BASE TABLE'`,
      [schema, name]
    );
    if (rows.length === 0) return null;

    const table = rows[0] as unknown as TableInfo;

    const colRes = await this.execute(
      `SELECT column_name as name, data_type as type, is_nullable = 'YES' as nullable, column_default as default
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, name]
    );
    table.columns = colRes.rows as unknown as ColumnInfo[];

    const pkRes = await this.execute(
      `SELECT a.attname
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       JOIN pg_class c ON c.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relname = $2 AND i.indisprimary AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY array_position(i.indkey, a.attnum)`,
      [schema, name]
    );
    table.primaryKey = pkRes.rows.map((r) => (r as { attname: string }).attname);

    const fkRes = await this.execute(
      `SELECT kcu.column_name as column,
              ccu.table_schema as ref_schema, ccu.table_name as ref_table, ccu.column_name as ref_column
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1 AND tc.table_name = $2`,
      [schema, name]
    );
    table.foreignKeys = fkRes.rows as unknown as ForeignKeyInfo[];

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
    const fullName = `"${schema}"."${name}"`;
    const stmts: string[] = [];

    if (options.addColumns?.length) {
      for (const c of options.addColumns) {
        validateIdentifier(c.name, "column name");
        let def = `ADD COLUMN "${c.name}" ${c.type}`;
        if (c.nullable === false) def += " NOT NULL";
        if (c.default) def += ` DEFAULT ${c.default}`;
        stmts.push(`ALTER TABLE ${fullName} ${def}`);
      }
    }
    if (options.dropColumns?.length) {
      for (const col of options.dropColumns) {
        validateIdentifier(col, "column name");
        stmts.push(`ALTER TABLE ${fullName} DROP COLUMN IF EXISTS "${col}"`);
      }
    }
    if (options.renameTo) {
      validateIdentifier(options.renameTo, "new table name");
      stmts.push(`ALTER TABLE ${fullName} RENAME TO "${options.renameTo}"`);
    }
    if (stmts.length > 0) {
      const sql = stmts.join(";\n") + ";";
      await this.recordMigrationInternal(sql, `alter_table_${schema}_${name}`);
      for (const s of stmts) await this.execute(s);
    }
  }

  async dropTable(schema: string, name: string, cascade = false): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "table name");
    const suffix = cascade ? " CASCADE" : "";
    const sql = `DROP TABLE IF EXISTS "${schema}"."${name}"${suffix}`;
    await this.recordMigrationInternal(sql, `drop_table_${schema}_${name}`);
    await this.execute(sql);
  }

  async listIndexes(schema?: string, table?: string): Promise<IndexInfo[]> {
    let sql = `
      SELECT n.nspname as schema, i.relname as name, t.relname as table,
             array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) as columns,
             ix.indisunique as unique
      FROM pg_index ix
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = i.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey) AND a.attnum > 0 AND NOT a.attisdropped
      WHERE i.relkind = 'i'
    `;
    const params: string[] = [];
    if (schema) {
      params.push(schema);
      sql += ` AND n.nspname = $${params.length}`;
    }
    if (table) {
      params.push(table);
      sql += ` AND t.relname = $${params.length}`;
    }
    sql += ` GROUP BY n.nspname, i.relname, t.relname, ix.indisunique ORDER BY schema, name`;
    const { rows } = await this.execute(sql, params);
    return rows as unknown as IndexInfo[];
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
    const sql = `CREATE ${unique}INDEX IF NOT EXISTS "${indexName}" ON "${schema}"."${table}" (${colList})`;
    await this.recordMigrationInternal(sql, `create_index_${indexName}`);
    await this.execute(sql);
  }

  async dropIndex(schema: string, name: string): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "index name");
    const sql = `DROP INDEX IF EXISTS "${schema}"."${name}"`;
    await this.recordMigrationInternal(sql, `drop_index_${schema}_${name}`);
    await this.execute(sql);
  }

  async listViews(schema?: string): Promise<ViewInfo[]> {
    let sql = `
      SELECT table_schema as schema, table_name as name
      FROM information_schema.views
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    `;
    const params: string[] = [];
    if (schema) {
      params.push(schema);
      sql += ` AND table_schema = $1`;
    }
    sql += ` ORDER BY table_schema, table_name`;
    const { rows } = await this.execute(sql, params);
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
    const sql = `CREATE ${orReplace}VIEW "${schema}"."${name}" AS ${query}`;
    const migrationSql = `CREATE OR REPLACE VIEW "${schema}"."${name}" AS ${query}`;
    await this.recordMigrationInternal(migrationSql, `create_view_${schema}_${name}`);
    await this.execute(sql);
  }

  async getView(schema: string, name: string): Promise<ViewInfo | null> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "view name");
    const { rows } = await this.execute(
      `SELECT table_schema as schema, table_name as name, view_definition as definition
       FROM information_schema.views
       WHERE table_schema = $1 AND table_name = $2`,
      [schema, name]
    );
    return rows.length > 0 ? (rows[0] as unknown as ViewInfo) : null;
  }

  async dropView(schema: string, name: string, cascade = false): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "view name");
    const suffix = cascade ? " CASCADE" : "";
    const sql = `DROP VIEW IF EXISTS "${schema}"."${name}"${suffix}`;
    await this.recordMigrationInternal(sql, `drop_view_${schema}_${name}`);
    await this.execute(sql);
  }

  async listSequences(schema?: string): Promise<SequenceInfo[]> {
    let sql = `
      SELECT n.nspname as schema, c.relname as name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'S' AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    `;
    const params: string[] = [];
    if (schema) {
      params.push(schema);
      sql += ` AND n.nspname = $1`;
    }
    sql += ` ORDER BY schema, name`;
    const { rows } = await this.execute(sql, params);
    return rows as unknown as SequenceInfo[];
  }

  async createSequence(
    schema: string,
    name: string,
    options?: { start?: number; increment?: number }
  ): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "name");
    let sql = `CREATE SEQUENCE IF NOT EXISTS "${schema}"."${name}"`;
    const opts: string[] = [];
    if (options?.start != null) opts.push(`START ${options.start}`);
    if (options?.increment != null) opts.push(`INCREMENT ${options.increment}`);
    if (opts.length) sql += ` ${opts.join(" ")}`;
    sql += ";";
    await this.recordMigrationInternal(sql, `create_sequence_${schema}_${name}`);
    await this.execute(sql);
  }

  async dropSequence(schema: string, name: string): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "name");
    const sql = `DROP SEQUENCE IF EXISTS "${schema}"."${name}"`;
    await this.recordMigrationInternal(sql, `drop_sequence_${schema}_${name}`);
    await this.execute(sql);
  }

  async listTriggers(schema?: string, table?: string): Promise<TriggerInfo[]> {
    let sql = `
      SELECT event_object_schema as schema, event_object_table as table, trigger_name as name,
             action_timing as timing, event_manipulation as event, action_statement as function
      FROM information_schema.triggers
      WHERE trigger_schema NOT IN ('pg_catalog', 'information_schema')
    `;
    const params: string[] = [];
    if (schema) {
      params.push(schema);
      sql += ` AND event_object_schema = $${params.length}`;
    }
    if (table) {
      params.push(table);
      sql += ` AND event_object_table = $${params.length}`;
    }
    sql += ` ORDER BY schema, table, name`;
    const { rows } = await this.execute(sql, params);
    return rows.map((r) => ({
      schema: (r as { schema: string }).schema,
      table: (r as { table: string }).table,
      name: (r as { name: string }).name,
      timing: (r as { timing: string }).timing,
      event: (r as { event: string }).event,
      function: (r as { function: string }).function,
    })) as TriggerInfo[];
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
    const fnParts = options.function.split(".");
    const fnSchema = fnParts.length > 1 ? fnParts[0] : schema;
    const fnName = fnParts.length > 1 ? fnParts[1] : fnParts[0];
    const createSql = `CREATE TRIGGER "${name}" ${options.timing} ${options.event} ON "${schema}"."${table}"
       FOR EACH ROW EXECUTE FUNCTION "${fnSchema}"."${fnName}"()`;
    const dropSql = `DROP TRIGGER IF EXISTS "${name}" ON "${schema}"."${table}"`;
    const migrationSql = `${dropSql};\n${createSql}`;
    await this.recordMigrationInternal(migrationSql, `create_trigger_${name}`);
    await this.execute(dropSql);
    await this.execute(createSql);
  }

  async dropTrigger(schema: string, table: string, name: string): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(table, "table name");
    validateIdentifier(name, "trigger name");
    const sql = `DROP TRIGGER IF EXISTS "${name}" ON "${schema}"."${table}"`;
    await this.recordMigrationInternal(sql, `drop_trigger_${name}`);
    await this.execute(sql);
  }

  async listFunctions(schema?: string): Promise<FunctionInfo[]> {
    let sql = `
      SELECT n.nspname as schema, p.proname as name,
             pg_get_function_arguments(p.oid) as args,
             pg_get_function_result(p.oid) as returns
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    `;
    const params: string[] = [];
    if (schema) {
      params.push(schema);
      sql += ` AND n.nspname = $1`;
    }
    sql += ` ORDER BY schema, name`;
    const { rows } = await this.execute(sql, params);
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
    const returns = options?.returns ?? "void";
    const lang = options?.language ?? "plpgsql";
    const sql = `CREATE OR REPLACE FUNCTION "${schema}"."${name}"(${args}) RETURNS ${returns}
       LANGUAGE ${lang} AS $$ ${body} $$`;
    await this.recordMigrationInternal(sql, `create_function_${schema}_${name}`);
    await this.execute(sql);
  }

  async dropFunction(schema: string, name: string, args?: string): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(name, "name");
    const argsClause = args ? `(${args})` : "";
    const sql = `DROP FUNCTION IF EXISTS "${schema}"."${name}"${argsClause}`;
    await this.recordMigrationInternal(sql, `drop_function_${schema}_${name}`);
    await this.execute(sql);
  }

  async listExtensions(): Promise<ExtensionInfo[]> {
    const { rows } = await this.execute(
      `SELECT extname as name, extversion as version FROM pg_extension ORDER BY extname`
    );
    return rows as unknown as ExtensionInfo[];
  }

  async createExtension(name: string, schema?: string): Promise<void> {
    validateIdentifier(name, "extension name");
    let sql = `CREATE EXTENSION IF NOT EXISTS "${name}"`;
    if (schema) {
      validateIdentifier(schema, "schema");
      sql += ` SCHEMA "${schema}"`;
    }
    sql += ";";
    await this.recordMigrationInternal(sql, `create_extension_${name}`);
    await this.execute(sql);
  }

  async dropExtension(name: string): Promise<void> {
    validateIdentifier(name, "extension name");
    const sql = `DROP EXTENSION IF EXISTS "${name}"`;
    await this.recordMigrationInternal(sql, `drop_extension_${name}`);
    await this.execute(sql);
  }

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
    const placeholders = rows
      .map(
        (_, i) =>
          `(${cols.map((_, j) => `$${i * cols.length + j + 1}`).join(", ")})`
      )
      .join(", ");
    const params = rows.flatMap((r) => cols.map((c) => r[c]));
    const { rowCount } = await this.execute(
      `INSERT INTO "${schema}"."${table}" (${colList}) VALUES ${placeholders}`,
      params
    );
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
    const setParts = Object.keys(set).map((k, i) => `"${k}" = $${i + 1}`);
    const params: unknown[] = Object.values(set);
    let sql = `UPDATE "${schema}"."${table}" SET ${setParts.join(", ")}`;
    if (where && Object.keys(where).length > 0) {
      Object.keys(where).forEach((k) => validateIdentifier(k, "column"));
      const whereParts = Object.keys(where).map(
        (k, i) => `"${k}" = $${params.length + i + 1}`
      );
      params.push(...Object.values(where));
      sql += ` WHERE ${whereParts.join(" AND ")}`;
    }
    const { rowCount } = await this.execute(sql, params);
    return { rowCount };
  }

  async deleteRows(
    schema: string,
    table: string,
    where?: Record<string, unknown>
  ): Promise<{ rowCount: number }> {
    validateIdentifier(schema, "schema");
    validateIdentifier(table, "table name");
    let sql = `DELETE FROM "${schema}"."${table}"`;
    const params: unknown[] = [];
    if (where && Object.keys(where).length > 0) {
      Object.keys(where).forEach((k) => validateIdentifier(k, "column"));
      const whereParts = Object.keys(where).map(
        (k, i) => `"${k}" = $${i + 1}`
      );
      params.push(...Object.values(where));
      sql += ` WHERE ${whereParts.join(" AND ")}`;
    }
    const { rowCount } = await this.execute(sql, params);
    return { rowCount };
  }

  async listRoles(): Promise<RoleInfo[]> {
    const { rows } = await this.execute(`
      SELECT rolname as name, rolcanlogin as "canLogin", rolsuper as "isSuperuser",
             rolcreatedb as "canCreateDb", rolcreaterole as "canCreateRole"
      FROM pg_roles
      WHERE rolname NOT LIKE 'pg_%'
      ORDER BY rolname
    `);
    return rows as unknown as RoleInfo[];
  }

  async createRole(
    name: string,
    options?: { login?: boolean; password?: string; superuser?: boolean; createdb?: boolean; createrole?: boolean }
  ): Promise<void> {
    validateIdentifier(name, "role name");
    const opts: string[] = [];
    if (options?.login) opts.push("LOGIN");
    else opts.push("NOLOGIN");
    if (options?.password) opts.push(`PASSWORD '${options.password.replace(/'/g, "''")}'`);
    if (options?.superuser) opts.push("SUPERUSER");
    if (options?.createdb) opts.push("CREATEDB");
    if (options?.createrole) opts.push("CREATEROLE");
    const optsStr = opts.length ? ` WITH ${opts.join(" ")}` : "";
    const sql = `CREATE ROLE "${name}"${optsStr}`;
    await this.recordMigrationInternal(sql, `create_role_${name}`);
    await this.execute(sql);
  }

  async alterRole(
    name: string,
    options: { password?: string; login?: boolean; createdb?: boolean; createrole?: boolean }
  ): Promise<void> {
    validateIdentifier(name, "role name");
    const opts: string[] = [];
    if (options.password !== undefined) opts.push(`PASSWORD '${options.password.replace(/'/g, "''")}'`);
    if (options.login !== undefined) opts.push(options.login ? "LOGIN" : "NOLOGIN");
    if (options.createdb !== undefined) opts.push(options.createdb ? "CREATEDB" : "NOCREATEDB");
    if (options.createrole !== undefined) opts.push(options.createrole ? "CREATEROLE" : "NOCREATEROLE");
    if (opts.length) {
      const sql = `ALTER ROLE "${name}" WITH ${opts.join(" ")}`;
      await this.recordMigrationInternal(sql, `alter_role_${name}`);
      await this.execute(sql);
    }
  }

  async dropRole(name: string): Promise<void> {
    validateIdentifier(name, "role name");
    const sql = `DROP ROLE IF EXISTS "${name}"`;
    await this.recordMigrationInternal(sql, `drop_role_${name}`);
    await this.execute(sql);
  }

  async grantRoleMembership(roleToGrant: string, granteeRole: string): Promise<void> {
    validateIdentifier(roleToGrant, "role to grant");
    validateIdentifier(granteeRole, "grantee role");
    const sql = `GRANT "${roleToGrant}" TO "${granteeRole}"`;
    await this.recordMigrationInternal(sql, `grant_role_${roleToGrant}_to_${granteeRole}`);
    await this.execute(sql);
  }

  async revokeRoleMembership(roleToRevoke: string, revokeeRole: string): Promise<void> {
    validateIdentifier(roleToRevoke, "role to revoke");
    validateIdentifier(revokeeRole, "revokee role");
    const sql = `REVOKE "${roleToRevoke}" FROM "${revokeeRole}"`;
    await this.recordMigrationInternal(sql, `revoke_role_${roleToRevoke}_from_${revokeeRole}`);
    await this.execute(sql);
  }

  async grantSchema(schema: string, role: string, privileges: string[]): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(role, "role");
    const valid = ["USAGE", "CREATE"];
    const privs = privileges.filter((p) => valid.includes(p.toUpperCase()));
    if (privs.length === 0) throw new Error("Valid schema privileges: USAGE, CREATE");
    const sql = `GRANT ${privs.join(", ")} ON SCHEMA "${schema}" TO "${role}"`;
    await this.recordMigrationInternal(sql, `grant_schema_${schema}_to_${role}`);
    await this.execute(sql);
  }

  async revokeSchema(schema: string, role: string, privileges?: string[]): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(role, "role");
    const privs = privileges?.length ? privileges.join(", ") : "ALL";
    const sql = `REVOKE ${privs} ON SCHEMA "${schema}" FROM "${role}"`;
    await this.recordMigrationInternal(sql, `revoke_schema_${schema}_from_${role}`);
    await this.execute(sql);
  }

  async grantTable(schema: string, table: string, role: string, privileges: string[]): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(table, "table");
    validateIdentifier(role, "role");
    const valid = ["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"];
    const privs = privileges.map((p) => p.toUpperCase()).filter((p) => valid.includes(p));
    if (privs.length === 0) throw new Error("Valid table privileges: SELECT, INSERT, UPDATE, DELETE, ALL");
    const sql = `GRANT ${privs.join(", ")} ON TABLE "${schema}"."${table}" TO "${role}"`;
    await this.recordMigrationInternal(sql, `grant_table_${schema}_${table}_to_${role}`);
    await this.execute(sql);
  }

  async revokeTable(schema: string, table: string, role: string, privileges?: string[]): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(table, "table");
    validateIdentifier(role, "role");
    const privs = privileges?.length ? privileges.map((p) => p.toUpperCase()).join(", ") : "ALL";
    const sql = `REVOKE ${privs} ON TABLE "${schema}"."${table}" FROM "${role}"`;
    await this.recordMigrationInternal(sql, `revoke_table_${schema}_${table}_from_${role}`);
    await this.execute(sql);
  }

  async grantAllTablesInSchema(schema: string, role: string, privileges: string[]): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(role, "role");
    const valid = ["SELECT", "INSERT", "UPDATE", "DELETE", "ALL"];
    const privs = privileges.map((p) => p.toUpperCase()).filter((p) => valid.includes(p));
    if (privs.length === 0) throw new Error("Valid table privileges: SELECT, INSERT, UPDATE, DELETE, ALL");
    const sql = `GRANT ${privs.join(", ")} ON ALL TABLES IN SCHEMA "${schema}" TO "${role}"`;
    await this.recordMigrationInternal(sql, `grant_all_tables_${schema}_to_${role}`);
    await this.execute(sql);
  }

  async revokeAllTablesInSchema(schema: string, role: string, privileges?: string[]): Promise<void> {
    validateIdentifier(schema, "schema");
    validateIdentifier(role, "role");
    const privs = privileges?.length ? privileges.map((p) => p.toUpperCase()).join(", ") : "ALL";
    const sql = `REVOKE ${privs} ON ALL TABLES IN SCHEMA "${schema}" FROM "${role}"`;
    await this.recordMigrationInternal(sql, `revoke_all_tables_${schema}_from_${role}`);
    await this.execute(sql);
  }

  async listGrantsForRole(role: string): Promise<GrantInfo[]> {
    validateIdentifier(role, "role");
    const grants: GrantInfo[] = [];
    const { rows: tableRows } = await this.execute(
      `SELECT table_schema as schema, table_name as object, privilege_type as privilege
       FROM information_schema.role_table_grants
       WHERE grantee = $1 AND table_schema NOT IN ('pg_catalog', 'information_schema')`,
      [role]
    );
    const tableGrants = new Map<string, { schema: string; object: string; privs: string[] }>();
    for (const r of tableRows as { schema: string; object: string; privilege: string }[]) {
      const key = `${r.schema}.${r.object}`;
      if (!tableGrants.has(key)) tableGrants.set(key, { schema: r.schema, object: r.object, privs: [] });
      tableGrants.get(key)!.privs.push(r.privilege);
    }
    for (const { schema, object, privs } of tableGrants.values()) {
      grants.push({ role, type: "table", schema, object, privileges: privs });
    }
    return grants;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
