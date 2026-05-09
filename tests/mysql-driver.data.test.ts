import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createMySQLTestDriver, uniqueSchema } from "./helpers/db.js";

describe("MySQLDriver — data & indexes", () => {
  const driver = createMySQLTestDriver();
  const schema = uniqueSchema();

  beforeAll(async () => {
    await driver.createSchema(schema);
    await driver.createTable(
      schema,
      "users",
      [
        { name: "id", type: "INT AUTO_INCREMENT", nullable: false },
        { name: "name", type: "VARCHAR(255)", nullable: false },
        { name: "email", type: "VARCHAR(255)" },
      ],
      { primaryKey: ["id"] }
    );
  });

  afterAll(async () => {
    await driver.dropSchema(schema);
    await driver.close();
  });

  // --- INSERT ---

  it("insertRows retorna rowCount correcto", async () => {
    const { rowCount } = await driver.insertRows(schema, "users", [
      { name: "Alice", email: "alice@example.com" },
      { name: "Bob", email: "bob@example.com" },
    ]);
    expect(rowCount).toBe(2);
  });

  it("insertRows con batch múltiple inserta todas las filas", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      name: `User${i}`,
      email: `user${i}@example.com`,
    }));
    const { rowCount } = await driver.insertRows(schema, "users", rows);
    expect(rowCount).toBe(5);
  });

  it("insertRows con array vacío retorna rowCount 0 sin error", async () => {
    const { rowCount } = await driver.insertRows(schema, "users", []);
    expect(rowCount).toBe(0);
  });

  // --- QUERY ---

  it("execute SELECT recupera las filas insertadas", async () => {
    const { rows } = await driver.execute(
      `SELECT name FROM \`${schema}\`.\`users\` WHERE name = ?`,
      ["Alice"]
    );
    expect(rows.length).toBe(1);
    expect((rows[0] as { name: string }).name).toBe("Alice");
  });

  it("execute con parámetros previene SQL injection", async () => {
    const { rows } = await driver.execute(
      `SELECT name FROM \`${schema}\`.\`users\` WHERE name = ?`,
      ["' OR '1'='1"]
    );
    expect(rows.length).toBe(0);
  });

  // --- UPDATE ---

  it("updateRows con where actualiza solo la fila correcta", async () => {
    await driver.insertRows(schema, "users", [
      { name: "Carlos", email: "carlos@example.com" },
    ]);
    const { rowCount } = await driver.updateRows(
      schema,
      "users",
      { email: "carlos_new@example.com" },
      { name: "Carlos" }
    );
    expect(rowCount).toBe(1);

    const { rows } = await driver.execute(
      `SELECT email FROM \`${schema}\`.\`users\` WHERE name = ?`,
      ["Carlos"]
    );
    expect((rows[0] as { email: string }).email).toBe("carlos_new@example.com");
  });

  it("updateRows sin where actualiza todas las filas", async () => {
    const before = await driver.execute(
      `SELECT COUNT(*) as total FROM \`${schema}\`.\`users\``
    );
    const total = Number((before.rows[0] as { total: string }).total);

    const { rowCount } = await driver.updateRows(schema, "users", {
      email: "reset@example.com",
    });
    expect(rowCount).toBe(total);
  });

  // --- DELETE ---

  it("deleteRows con where elimina solo la fila correcta", async () => {
    await driver.insertRows(schema, "users", [
      { name: "ToDelete", email: "del@example.com" },
    ]);
    const { rowCount } = await driver.deleteRows(schema, "users", { name: "ToDelete" });
    expect(rowCount).toBe(1);

    const { rows } = await driver.execute(
      `SELECT * FROM \`${schema}\`.\`users\` WHERE name = ?`,
      ["ToDelete"]
    );
    expect(rows.length).toBe(0);
  });

  it("deleteRows sin where elimina todas las filas", async () => {
    await driver.insertRows(schema, "users", [{ name: "Temp", email: "t@t.com" }]);
    const { rowCount } = await driver.deleteRows(schema, "users");
    expect(rowCount).toBeGreaterThan(0);

    const { rows } = await driver.execute(
      `SELECT * FROM \`${schema}\`.\`users\``
    );
    expect(rows.length).toBe(0);
  });

  // --- INDEXES ---

  it("createIndex crea el índice y aparece en listIndexes", async () => {
    await driver.insertRows(schema, "users", [
      { name: "IndexTest", email: "idx@test.com" },
    ]);
    await driver.createIndex(schema, "users", ["name"], { name: "users_name_idx" });

    const indexes = await driver.listIndexes(schema, "users");
    expect(indexes.map((i) => i.name)).toContain("users_name_idx");
  });

  it("createIndex unique rechaza duplicados en la columna", async () => {
    await driver.createIndex(schema, "users", ["email"], {
      name: "users_email_unique_idx",
      unique: true,
    });
    await driver.insertRows(schema, "users", [
      { name: "UniqueA", email: "unique@test.com" },
    ]);
    await expect(
      driver.insertRows(schema, "users", [
        { name: "UniqueB", email: "unique@test.com" },
      ])
    ).rejects.toThrow();
  });

  it("dropIndex elimina el índice del listado", async () => {
    await driver.dropIndex(schema, "users_name_idx");
    const indexes = await driver.listIndexes(schema, "users");
    expect(indexes.map((i) => i.name)).not.toContain("users_name_idx");
  });
});
