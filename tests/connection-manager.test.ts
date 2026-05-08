import { describe, it, expect } from "vitest";
import { ConnectionManager } from "../src/connection-manager.js";
import { TEST_DB_URL } from "./helpers/db.js";

const BASE_CONFIGS = [
  {
    name: "writable",
    connectionString: TEST_DB_URL,
    dbType: "postgres" as const,
    enabled: true,
  },
  {
    name: "readonly_db",
    connectionString: TEST_DB_URL,
    dbType: "postgres" as const,
    enabled: true,
    readonly: true,
  },
  {
    name: "disabled_db",
    connectionString: TEST_DB_URL,
    dbType: "postgres" as const,
    enabled: false,
  },
  {
    name: "prod",
    description: "Production replica",
    connectionString: TEST_DB_URL,
    dbType: "postgres" as const,
    enabled: true,
    readonly: true,
  },
];

function makeManager() {
  return new ConnectionManager("/tmp", false, BASE_CONFIGS);
}

describe("ConnectionManager — getDatabase", () => {
  it("lanza error para una base de datos no registrada", () => {
    const cm = makeManager();
    expect(() => cm.getDatabase("inexistente")).toThrow(
      'Database "inexistente" not found in databases.json'
    );
  });

  it("lanza error para una base de datos deshabilitada", () => {
    const cm = makeManager();
    expect(() => cm.getDatabase("disabled_db")).toThrow(
      'Database "disabled_db" is disabled'
    );
  });

  it("retorna el driver para una base habilitada", () => {
    const cm = makeManager();
    const driver = cm.getDatabase("writable");
    expect(driver).toBeDefined();
  });

  it("retorna el mismo driver en llamadas sucesivas (lazy singleton)", () => {
    const cm = makeManager();
    const d1 = cm.getDatabase("writable");
    const d2 = cm.getDatabase("writable");
    expect(d1).toBe(d2);
  });
});

describe("ConnectionManager — assertWritable", () => {
  it("lanza error para una base de datos readonly", () => {
    const cm = makeManager();
    expect(() => cm.assertWritable("readonly_db")).toThrow(
      'Database "readonly_db" is read-only'
    );
  });

  it("lanza error para una base no registrada", () => {
    const cm = makeManager();
    expect(() => cm.assertWritable("ghost")).toThrow(
      'Database "ghost" not found in databases.json'
    );
  });

  it("no lanza error para una base escribible", () => {
    const cm = makeManager();
    expect(() => cm.assertWritable("writable")).not.toThrow();
  });

  it("no lanza error para una base deshabilitada (assertWritable solo chequea readonly)", () => {
    const cm = makeManager();
    expect(() => cm.assertWritable("disabled_db")).not.toThrow();
  });
});

describe("ConnectionManager — listDatabases", () => {
  it("lista todas las bases registradas", () => {
    const cm = makeManager();
    const dbs = cm.listDatabases();
    expect(dbs.map((d) => d.name)).toEqual(
      expect.arrayContaining(["writable", "readonly_db", "disabled_db", "prod"])
    );
  });

  it("expone readonly: true para bases marcadas como readonly", () => {
    const cm = makeManager();
    const dbs = cm.listDatabases();
    const ro = dbs.find((d) => d.name === "readonly_db");
    expect(ro!.readonly).toBe(true);
  });

  it("expone readonly: false para bases sin el flag", () => {
    const cm = makeManager();
    const dbs = cm.listDatabases();
    const wr = dbs.find((d) => d.name === "writable");
    expect(wr!.readonly).toBe(false);
  });

  it("expone enabled: false para bases deshabilitadas", () => {
    const cm = makeManager();
    const dbs = cm.listDatabases();
    const dis = dbs.find((d) => d.name === "disabled_db");
    expect(dis!.enabled).toBe(false);
  });
});

describe("ConnectionManager — getDatabaseInfo", () => {
  it("retorna null para una base no registrada", () => {
    const cm = makeManager();
    expect(cm.getDatabaseInfo("fantasma")).toBeNull();
  });

  it("retorna info completa con readonly y enabled", () => {
    const cm = makeManager();
    const info = cm.getDatabaseInfo("prod");
    expect(info).not.toBeNull();
    expect(info!.readonly).toBe(true);
    expect(info!.enabled).toBe(true);
    expect(info!.description).toBe("Production replica");
  });

  it("retorna readonly: false para bases sin el flag", () => {
    const cm = makeManager();
    const info = cm.getDatabaseInfo("writable");
    expect(info!.readonly).toBe(false);
  });
});
