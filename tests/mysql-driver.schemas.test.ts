import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createMySQLTestDriver, uniqueSchema } from "./helpers/db.js";

describe("MySQLDriver — schemas", () => {
  const driver = createMySQLTestDriver();
  const schema = uniqueSchema();

  beforeAll(async () => {
    await driver.createSchema(schema);
  });

  afterAll(async () => {
    await driver.dropSchema(schema);
    await driver.close();
  });

  it("lista el schema recién creado", async () => {
    const schemas = await driver.listSchemas();
    expect(schemas.map((s) => s.name)).toContain(schema);
  });

  it("no incluye schemas de sistema por defecto", async () => {
    const schemas = await driver.listSchemas();
    const names = schemas.map((s) => s.name);
    expect(names).not.toContain("information_schema");
    expect(names).not.toContain("performance_schema");
    expect(names).not.toContain("mysql");
    expect(names).not.toContain("sys");
  });

  it("incluye schemas de sistema si se pide explícitamente", async () => {
    const schemas = await driver.listSchemas(true);
    const names = schemas.map((s) => s.name);
    expect(names).toContain("information_schema");
  });

  it("obtiene detalles del schema por nombre", async () => {
    const result = await driver.getSchema(schema);
    expect(result).not.toBeNull();
    expect(result!.name).toBe(schema);
  });

  it("retorna null para un schema inexistente", async () => {
    const result = await driver.getSchema("schema_que_no_existe");
    expect(result).toBeNull();
  });

  it("alterSchema lanza not-supported (MySQL no permite renombrar databases)", async () => {
    await expect(driver.alterSchema(schema, { newName: "otro" })).rejects.toThrow(
      /not support/i
    );
  });

  it("dropea el schema y desaparece del listado", async () => {
    const temp = uniqueSchema();
    await driver.createSchema(temp);
    await driver.dropSchema(temp);
    const schemas = await driver.listSchemas();
    expect(schemas.map((s) => s.name)).not.toContain(temp);
  });

  it("lanza error con nombre de schema inválido", async () => {
    await expect(driver.createSchema("bad name")).rejects.toThrow("Invalid schema name");
  });

  it("lanza error con nombre de schema con caracteres especiales", async () => {
    await expect(driver.createSchema("schema; DROP TABLE users--")).rejects.toThrow(
      "Invalid schema name"
    );
  });
});
