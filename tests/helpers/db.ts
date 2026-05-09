import { PostgresDriver } from "../../src/drivers/postgres.js";
import { MySQLDriver } from "../../src/drivers/mysql.js";

export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://monitor_user:monitor_pass@localhost:5433/testdb";

export const TEST_MYSQL_URL =
  process.env.TEST_MYSQL_URL ?? "mysql://test:test@localhost:3307/testdb";

export function createTestDriver(): PostgresDriver {
  return new PostgresDriver(TEST_DB_URL);
}

export function createMySQLTestDriver(): MySQLDriver {
  return new MySQLDriver(TEST_MYSQL_URL);
}

export function uniqueSchema(): string {
  return `test_${Math.random().toString(36).slice(2, 8)}`;
}
