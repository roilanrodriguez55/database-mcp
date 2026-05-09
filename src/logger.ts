export type LogLevel = "info" | "warn" | "error";

export function log(level: LogLevel, event: string, data?: Record<string, unknown>): void {
  const entry = { timestamp: new Date().toISOString(), level, event, ...data };
  process.stderr.write(JSON.stringify(entry) + "\n");
}
