import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDriver, uniqueSchema } from "./helpers/db.js";

describe("PostgresDriver — tables", () => {
  const driver = createTestDriver();
  const schema = uniqueSchema();

  beforeAll(async () => {
    await driver.createSchema(schema);
  });

  afterAll(async () => {
    await driver.dropSchema(schema, true);
    await driver.close();
  });

  it("crea una tabla y aparece en listTables", async () => {
    await driver.createTable(schema, "products", [
      { name: "id", type: "serial", nullable: false },
      { name: "name", type: "text", nullable: false },
      { name: "price", type: "numeric" },
    ], { primaryKey: ["id"] });

    const tables = await driver.listTables(schema);
    expect(tables.map((t) => t.name)).toContain("products");
  });

  it("getTable retorna columnas y primary key correctos", async () => {
    const table = await driver.getTable(schema, "products");
    expect(table).not.toBeNull();
    const colNames = table!.columns!.map((c) => c.name);
    expect(colNames).toContain("id");
    expect(colNames).toContain("name");
    expect(colNames).toContain("price");
    expect(table!.primaryKey).toContain("id");
  });

  it("retorna null para una tabla inexistente", async () => {
    const result = await driver.getTable(schema, "tabla_inexistente");
    expect(result).toBeNull();
  });

  it("listTables con verbose incluye columnas", async () => {
    const tables = await driver.listTables(schema, true);
    const products = tables.find((t) => t.name === "products");
    expect(products).toBeDefined();
    expect(products!.columns).toBeDefined();
    expect(products!.columns!.length).toBeGreaterThan(0);
  });

  it("alterTable agrega una columna que aparece en getTable", async () => {
    await driver.alterTable(schema, "products", {
      addColumns: [{ name: "stock", type: "integer", default: "0" }],
    });
    const table = await driver.getTable(schema, "products");
    expect(table!.columns!.map((c) => c.name)).toContain("stock");
  });

  it("alterTable elimina una columna que ya no aparece en getTable", async () => {
    await driver.alterTable(schema, "products", {
      dropColumns: ["price"],
    });
    const table = await driver.getTable(schema, "products");
    expect(table!.columns!.map((c) => c.name)).not.toContain("price");
  });

  it("dropTable elimina la tabla del listado", async () => {
    await driver.createTable(schema, "temp_table", [
      { name: "id", type: "serial" },
    ]);
    await driver.dropTable(schema, "temp_table");
    const tables = await driver.listTables(schema);
    expect(tables.map((t) => t.name)).not.toContain("temp_table");
  });

  it("lanza error con nombre de tabla inválido", async () => {
    await expect(
      driver.createTable(schema, "bad table!", [{ name: "id", type: "serial" }])
    ).rejects.toThrow("Invalid table name");
  });

  it("lanza error con nombre de columna inválido", async () => {
    await expect(
      driver.createTable(schema, "valid_table", [{ name: "bad col", type: "text" }])
    ).rejects.toThrow("Invalid column name");
  });
});
