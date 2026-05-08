import { PostgresDriver } from "../../src/drivers/postgres.js";

export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://monitor_user:monitor_pass@localhost:5433/testdb";

export function createTestDriver(): PostgresDriver {
  return new PostgresDriver(TEST_DB_URL);
}

export function uniqueSchema(): string {
  return `test_${Math.random().toString(36).slice(2, 8)}`;
}
