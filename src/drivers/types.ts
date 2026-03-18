/** Column definition for create/alter table */
export interface ColumnDef {
  name: string;
  type: string;
  nullable?: boolean;
  default?: string;
}

/** Schema info returned by listSchemas/getSchema */
export interface SchemaInfo {
  name: string;
  owner?: string;
}

/** Table info returned by listTables/getTable */
export interface TableInfo {
  schema: string;
  name: string;
  columns?: ColumnInfo[];
  primaryKey?: string[];
  foreignKeys?: ForeignKeyInfo[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default?: string;
}

export interface ForeignKeyInfo {
  column: string;
  refSchema: string;
  refTable: string;
  refColumn: string;
}

/** Index info */
export interface IndexInfo {
  schema: string;
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
}

/** View info */
export interface ViewInfo {
  schema: string;
  name: string;
  definition?: string;
}

/** Sequence info */
export interface SequenceInfo {
  schema: string;
  name: string;
}

/** Trigger info */
export interface TriggerInfo {
  schema: string;
  table: string;
  name: string;
  timing: string;
  event: string;
  function: string;
}

/** Function info */
export interface FunctionInfo {
  schema: string;
  name: string;
  args?: string;
  returns?: string;
}

/** Extension info */
export interface ExtensionInfo {
  name: string;
  version?: string;
}

/** Role info */
export interface RoleInfo {
  name: string;
  canLogin: boolean;
  isSuperuser: boolean;
  canCreateDb: boolean;
  canCreateRole: boolean;
}

/** Grant info */
export interface GrantInfo {
  role: string;
  type: "schema" | "table" | "sequence" | "function";
  schema?: string;
  object?: string;
  privileges: string[];
}

/** Query result */
export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

/** Database driver interface - extensible for multiple engines */
export interface IDatabaseDriver {
  execute(sql: string, params?: unknown[]): Promise<QueryResult>;
  listSchemas(includeSystem?: boolean): Promise<SchemaInfo[]>;
  createSchema(name: string, options?: { owner?: string }): Promise<void>;
  getSchema(name: string): Promise<SchemaInfo | null>;
  alterSchema(name: string, options: { newName?: string }): Promise<void>;
  dropSchema(name: string, cascade?: boolean): Promise<void>;

  listTables(schema?: string, verbose?: boolean): Promise<TableInfo[]>;
  createTable(
    schema: string,
    name: string,
    columns: ColumnDef[],
    options?: { primaryKey?: string[]; constraints?: string[] }
  ): Promise<void>;
  getTable(schema: string, name: string): Promise<TableInfo | null>;
  alterTable(
    schema: string,
    name: string,
    options: {
      addColumns?: ColumnDef[];
      dropColumns?: string[];
      renameTo?: string;
    }
  ): Promise<void>;
  dropTable(schema: string, name: string, cascade?: boolean): Promise<void>;

  listIndexes(schema?: string, table?: string): Promise<IndexInfo[]>;
  createIndex(
    schema: string,
    table: string,
    columns: string[],
    options?: { name?: string; unique?: boolean }
  ): Promise<void>;
  dropIndex(schema: string, name: string): Promise<void>;

  listViews(schema?: string): Promise<ViewInfo[]>;
  createView(
    schema: string,
    name: string,
    query: string,
    options?: { replace?: boolean }
  ): Promise<void>;
  getView(schema: string, name: string): Promise<ViewInfo | null>;
  dropView(schema: string, name: string, cascade?: boolean): Promise<void>;

  listSequences(schema?: string): Promise<SequenceInfo[]>;
  createSequence(
    schema: string,
    name: string,
    options?: { start?: number; increment?: number }
  ): Promise<void>;
  dropSequence(schema: string, name: string): Promise<void>;

  listTriggers(schema?: string, table?: string): Promise<TriggerInfo[]>;
  createTrigger(
    schema: string,
    table: string,
    name: string,
    options: { timing: string; event: string; function: string }
  ): Promise<void>;
  dropTrigger(schema: string, table: string, name: string): Promise<void>;

  listFunctions(schema?: string): Promise<FunctionInfo[]>;
  createFunction(
    schema: string,
    name: string,
    body: string,
    options?: { args?: string; returns?: string; language?: string }
  ): Promise<void>;
  dropFunction(schema: string, name: string, args?: string): Promise<void>;

  listExtensions(): Promise<ExtensionInfo[]>;
  createExtension(name: string, schema?: string): Promise<void>;
  dropExtension(name: string): Promise<void>;

  insertRows(
    schema: string,
    table: string,
    rows: Record<string, unknown>[]
  ): Promise<{ rowCount: number }>;
  updateRows(
    schema: string,
    table: string,
    set: Record<string, unknown>,
    where?: Record<string, unknown>
  ): Promise<{ rowCount: number }>;
  deleteRows(
    schema: string,
    table: string,
    where?: Record<string, unknown>
  ): Promise<{ rowCount: number }>;

  close(): Promise<void>;

  /** Record SQL to migration file (optional, for tools that run raw SQL) */
  recordMigration?(sql: string, description: string): Promise<void>;

  // Auth: roles
  listRoles(): Promise<RoleInfo[]>;
  createRole(
    name: string,
    options?: { login?: boolean; password?: string; superuser?: boolean; createdb?: boolean; createrole?: boolean }
  ): Promise<void>;
  alterRole(
    name: string,
    options: { password?: string; login?: boolean; createdb?: boolean; createrole?: boolean }
  ): Promise<void>;
  dropRole(name: string): Promise<void>;
  grantRoleMembership(roleToGrant: string, granteeRole: string): Promise<void>;
  revokeRoleMembership(roleToRevoke: string, revokeeRole: string): Promise<void>;

  // Auth: schema permissions
  grantSchema(schema: string, role: string, privileges: string[]): Promise<void>;
  revokeSchema(schema: string, role: string, privileges?: string[]): Promise<void>;

  // Auth: table permissions (SELECT, INSERT, UPDATE, DELETE)
  grantTable(schema: string, table: string, role: string, privileges: string[]): Promise<void>;
  revokeTable(schema: string, table: string, role: string, privileges?: string[]): Promise<void>;

  // Auth: all tables in schema
  grantAllTablesInSchema(schema: string, role: string, privileges: string[]): Promise<void>;
  revokeAllTablesInSchema(schema: string, role: string, privileges?: string[]): Promise<void>;

  // Auth: list grants
  listGrantsForRole(role: string): Promise<GrantInfo[]>;
}
