import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SQLiteDriver } from "../drivers/sqlite.js";

let driver: SQLiteDriver;

beforeEach(() => {
  driver = new SQLiteDriver(":memory:");
});

afterEach(async () => {
  await driver.close();
});

// ── Schemas ──────────────────────────────────────────────────────────────────

describe("schemas", () => {
  it("listSchemas returns main by default", async () => {
    const schemas = await driver.listSchemas();
    expect(schemas.map((s) => s.name)).toContain("main");
  });

  it("getSchema returns main", async () => {
    const schema = await driver.getSchema("main");
    expect(schema).not.toBeNull();
    expect(schema?.name).toBe("main");
  });

  it("getSchema returns null for nonexistent schema", async () => {
    const schema = await driver.getSchema("nonexistent");
    expect(schema).toBeNull();
  });

  it("createSchema throws not-supported", async () => {
    await expect(driver.createSchema("new_schema")).rejects.toThrow(/not support/i);
  });

  it("dropSchema throws not-supported", async () => {
    await expect(driver.dropSchema("main")).rejects.toThrow(/not support/i);
  });
});

// ── Tables ───────────────────────────────────────────────────────────────────

describe("tables", () => {
  it("creates a table and it appears in listTables", async () => {
    await driver.createTable("main", "users", [
      { name: "id", type: "INTEGER" },
      { name: "name", type: "TEXT", nullable: false },
    ]);
    const tables = await driver.listTables();
    expect(tables.map((t) => t.name)).toContain("users");
  });

  it("getTable returns columns and primary key", async () => {
    await driver.createTable(
      "main",
      "products",
      [
        { name: "id", type: "INTEGER" },
        { name: "title", type: "TEXT", nullable: false },
        { name: "price", type: "REAL", nullable: true },
      ],
      { primaryKey: ["id"] }
    );
    const table = await driver.getTable("main", "products");
    expect(table).not.toBeNull();
    expect(table?.columns?.map((c) => c.name)).toEqual(["id", "title", "price"]);
    expect(table?.primaryKey).toEqual(["id"]);
  });

  it("getTable returns null for nonexistent table", async () => {
    const result = await driver.getTable("main", "ghost");
    expect(result).toBeNull();
  });

  it("listTables with verbose includes columns", async () => {
    await driver.createTable("main", "items", [
      { name: "id", type: "INTEGER" },
      { name: "label", type: "TEXT" },
    ]);
    const [table] = await driver.listTables("main", true);
    expect(table?.columns?.length).toBeGreaterThan(0);
  });

  it("alterTable adds a column that appears in getTable", async () => {
    await driver.createTable("main", "posts", [
      { name: "id", type: "INTEGER" },
      { name: "body", type: "TEXT" },
    ]);
    await driver.alterTable("main", "posts", {
      addColumns: [{ name: "published", type: "INTEGER" }],
    });
    const table = await driver.getTable("main", "posts");
    expect(table?.columns?.map((c) => c.name)).toContain("published");
  });

  it("alterTable drops a column that no longer appears in getTable", async () => {
    await driver.createTable("main", "notes", [
      { name: "id", type: "INTEGER" },
      { name: "content", type: "TEXT" },
      { name: "draft", type: "INTEGER" },
    ]);
    await driver.alterTable("main", "notes", { dropColumns: ["draft"] });
    const table = await driver.getTable("main", "notes");
    expect(table?.columns?.map((c) => c.name)).not.toContain("draft");
  });

  it("dropTable removes the table from listTables", async () => {
    await driver.createTable("main", "temp_table", [
      { name: "id", type: "INTEGER" },
    ]);
    await driver.dropTable("main", "temp_table");
    const tables = await driver.listTables();
    expect(tables.map((t) => t.name)).not.toContain("temp_table");
  });

  it("throws on invalid table name", async () => {
    await expect(
      driver.createTable("main", "bad-name", [{ name: "id", type: "INTEGER" }])
    ).rejects.toThrow(/Invalid/);
  });

  it("throws on invalid column name", async () => {
    await expect(
      driver.createTable("main", "valid", [{ name: "bad col!", type: "TEXT" }])
    ).rejects.toThrow(/Invalid/);
  });
});

// ── Indexes ──────────────────────────────────────────────────────────────────

describe("indexes", () => {
  beforeEach(async () => {
    await driver.createTable("main", "orders", [
      { name: "id", type: "INTEGER" },
      { name: "customer_id", type: "INTEGER" },
      { name: "status", type: "TEXT" },
    ]);
  });

  it("createIndex creates an index that appears in listIndexes", async () => {
    await driver.createIndex("main", "orders", ["customer_id"]);
    const indexes = await driver.listIndexes("main", "orders");
    expect(indexes.map((i) => i.name)).toContain("orders_customer_id_idx");
  });

  it("createIndex unique rejects duplicate values", async () => {
    await driver.createIndex("main", "orders", ["status"], {
      name: "orders_status_uniq",
      unique: true,
    });
    await driver.insertRows("main", "orders", [
      { id: 1, customer_id: 1, status: "open" },
    ]);
    await expect(
      driver.insertRows("main", "orders", [
        { id: 2, customer_id: 2, status: "open" },
      ])
    ).rejects.toThrow();
  });

  it("dropIndex removes the index", async () => {
    await driver.createIndex("main", "orders", ["status"], {
      name: "orders_status_idx",
    });
    await driver.dropIndex("main", "orders_status_idx");
    const indexes = await driver.listIndexes("main", "orders");
    expect(indexes.map((i) => i.name)).not.toContain("orders_status_idx");
  });
});

// ── Views ────────────────────────────────────────────────────────────────────

describe("views", () => {
  beforeEach(async () => {
    await driver.createTable("main", "employees", [
      { name: "id", type: "INTEGER" },
      { name: "name", type: "TEXT" },
      { name: "dept", type: "TEXT" },
    ]);
  });

  it("createView appears in listViews", async () => {
    await driver.createView(
      "main",
      "eng_view",
      `SELECT * FROM "employees" WHERE dept = 'eng'`
    );
    const views = await driver.listViews("main");
    expect(views.map((v) => v.name)).toContain("eng_view");
  });

  it("getView returns the view definition", async () => {
    await driver.createView("main", "all_emp", `SELECT * FROM "employees"`);
    const view = await driver.getView("main", "all_emp");
    expect(view).not.toBeNull();
    expect(view?.definition).toMatch(/SELECT/i);
  });

  it("getView returns null for nonexistent view", async () => {
    const view = await driver.getView("main", "ghost_view");
    expect(view).toBeNull();
  });

  it("dropView removes the view", async () => {
    await driver.createView("main", "temp_view", `SELECT * FROM "employees"`);
    await driver.dropView("main", "temp_view");
    const views = await driver.listViews("main");
    expect(views.map((v) => v.name)).not.toContain("temp_view");
  });

  it("createView with replace:true replaces existing view", async () => {
    await driver.createView("main", "emp_view", `SELECT id FROM "employees"`);
    await driver.createView(
      "main",
      "emp_view",
      `SELECT id, name FROM "employees"`,
      { replace: true }
    );
    const view = await driver.getView("main", "emp_view");
    expect(view?.definition).toMatch(/name/i);
  });
});

// ── Triggers ─────────────────────────────────────────────────────────────────

describe("triggers", () => {
  beforeEach(async () => {
    await driver.createTable("main", "logs", [
      { name: "id", type: "INTEGER" },
      { name: "msg", type: "TEXT" },
    ]);
    await driver.createTable("main", "audit", [
      { name: "id", type: "INTEGER" },
      { name: "action", type: "TEXT" },
    ]);
  });

  it("createTrigger appears in listTriggers", async () => {
    await driver.createTrigger("main", "logs", "after_log_insert", {
      timing: "AFTER",
      event: "INSERT",
      function: "BEGIN INSERT INTO \"audit\" (action) VALUES ('inserted'); END",
    });
    const triggers = await driver.listTriggers("main", "logs");
    expect(triggers.map((t) => t.name)).toContain("after_log_insert");
  });

  it("dropTrigger removes the trigger", async () => {
    await driver.createTrigger("main", "logs", "temp_trigger", {
      timing: "AFTER",
      event: "INSERT",
      function: "BEGIN SELECT 1; END",
    });
    await driver.dropTrigger("main", "logs", "temp_trigger");
    const triggers = await driver.listTriggers("main", "logs");
    expect(triggers.map((t) => t.name)).not.toContain("temp_trigger");
  });
});

// ── Sequences ────────────────────────────────────────────────────────────────

describe("sequences", () => {
  it("listSequences returns empty array", async () => {
    const seqs = await driver.listSequences();
    expect(seqs).toEqual([]);
  });

  it("createSequence throws not-supported", async () => {
    await expect(driver.createSequence("main", "my_seq")).rejects.toThrow(/not support/i);
  });
});

// ── Functions ────────────────────────────────────────────────────────────────

describe("functions", () => {
  it("listFunctions returns empty array", async () => {
    const fns = await driver.listFunctions();
    expect(fns).toEqual([]);
  });

  it("createFunction throws not-supported", async () => {
    await expect(
      driver.createFunction("main", "my_fn", "SELECT 1")
    ).rejects.toThrow(/not support/i);
  });
});

// ── Extensions ───────────────────────────────────────────────────────────────

describe("extensions", () => {
  it("listExtensions returns empty array", async () => {
    const exts = await driver.listExtensions();
    expect(exts).toEqual([]);
  });

  it("createExtension throws not-supported", async () => {
    await expect(driver.createExtension("fts5")).rejects.toThrow(/not support/i);
  });
});

// ── Data operations ──────────────────────────────────────────────────────────

describe("data", () => {
  beforeEach(async () => {
    await driver.createTable(
      "main",
      "tasks",
      [
        { name: "id", type: "INTEGER" },
        { name: "title", type: "TEXT" },
        { name: "done", type: "INTEGER" },
      ],
      { primaryKey: ["id"] }
    );
  });

  it("insertRows returns correct rowCount", async () => {
    const { rowCount } = await driver.insertRows("main", "tasks", [
      { id: 1, title: "foo", done: 0 },
      { id: 2, title: "bar", done: 0 },
    ]);
    expect(rowCount).toBe(2);
  });

  it("insertRows with empty array returns rowCount 0 without error", async () => {
    const { rowCount } = await driver.insertRows("main", "tasks", []);
    expect(rowCount).toBe(0);
  });

  it("execute SELECT retrieves inserted rows", async () => {
    await driver.insertRows("main", "tasks", [
      { id: 1, title: "hello", done: 0 },
    ]);
    const { rows } = await driver.execute(`SELECT * FROM "tasks"`);
    expect(rows).toHaveLength(1);
    expect((rows[0] as { title: string }).title).toBe("hello");
  });

  it("execute with params prevents SQL injection", async () => {
    await driver.insertRows("main", "tasks", [
      { id: 1, title: "safe", done: 0 },
    ]);
    const { rows } = await driver.execute(
      `SELECT * FROM "tasks" WHERE title = ?`,
      ["safe' OR '1'='1"]
    );
    expect(rows).toHaveLength(0);
  });

  it("updateRows with where updates only the matching row", async () => {
    await driver.insertRows("main", "tasks", [
      { id: 1, title: "first", done: 0 },
      { id: 2, title: "second", done: 0 },
    ]);
    const { rowCount } = await driver.updateRows(
      "main",
      "tasks",
      { done: 1 },
      { id: 1 }
    );
    expect(rowCount).toBe(1);
    const { rows } = await driver.execute(`SELECT done FROM "tasks" WHERE id = 2`);
    expect((rows[0] as { done: number }).done).toBe(0);
  });

  it("updateRows without where updates all rows", async () => {
    await driver.insertRows("main", "tasks", [
      { id: 1, title: "a", done: 0 },
      { id: 2, title: "b", done: 0 },
    ]);
    const { rowCount } = await driver.updateRows("main", "tasks", { done: 1 });
    expect(rowCount).toBe(2);
  });

  it("deleteRows with where removes only the matching row", async () => {
    await driver.insertRows("main", "tasks", [
      { id: 1, title: "keep", done: 0 },
      { id: 2, title: "remove", done: 0 },
    ]);
    const { rowCount } = await driver.deleteRows("main", "tasks", { id: 2 });
    expect(rowCount).toBe(1);
    const { rows } = await driver.execute(`SELECT COUNT(*) as n FROM "tasks"`);
    expect((rows[0] as { n: number }).n).toBe(1);
  });

  it("deleteRows without where removes all rows", async () => {
    await driver.insertRows("main", "tasks", [
      { id: 1, title: "a", done: 0 },
      { id: 2, title: "b", done: 0 },
    ]);
    await driver.deleteRows("main", "tasks");
    const { rows } = await driver.execute(`SELECT COUNT(*) as n FROM "tasks"`);
    expect((rows[0] as { n: number }).n).toBe(0);
  });
});

// ── Roles / Auth ─────────────────────────────────────────────────────────────

describe("roles", () => {
  it("listRoles returns empty array", async () => {
    const roles = await driver.listRoles();
    expect(roles).toEqual([]);
  });

  it("createRole throws not-supported", async () => {
    await expect(driver.createRole("admin")).rejects.toThrow(/not support/i);
  });

  it("listGrantsForRole returns empty array", async () => {
    const grants = await driver.listGrantsForRole("admin");
    expect(grants).toEqual([]);
  });
});
