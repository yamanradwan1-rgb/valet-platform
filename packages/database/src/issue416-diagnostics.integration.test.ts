import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, expect, it } from "vitest";

import { Issue416AuditTestContext } from "./issue416-audit-test-context.js";

const context = new Issue416AuditTestContext();
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.cleanup(), 60_000);

it("measures synthetic bind/error/cancellation exposure without reusable credentials", async () => {
  const canary = `issue416-public-diagnostic-${randomUUID()}`;
  const facts: Record<string, unknown> = {};
  try {
    // Only this disposable owner's test connection changes logging settings.
    // No production configuration or application observability is changed.
    await context.admin.query("SET log_statement='all'");
    await context.admin.query("SET log_parameter_max_length=-1");
    await context.admin.query("SET log_parameter_max_length_on_error=-1");
    const settings = await context.admin.query(
      `SELECT current_setting('log_statement') AS statement,
              current_setting('log_parameter_max_length') AS bind,
              current_setting('log_parameter_max_length_on_error') AS error_bind,
              current_setting('shared_preload_libraries') AS preloads`,
    );
    facts.settings = settings.rows[0];
    const result = await context.admin.query<{ length: number }>(
      "SELECT length($1::text) AS length",
      [canary],
    );
    expect(result.rows[0]?.length).toBe(canary.length);
    facts.successValueContainsCanary = JSON.stringify(result.rows).includes(
      canary,
    );
    await context.admin.query("BEGIN");
    await context.admin.query("SELECT length($1::text)", [canary]);
    await context.admin.query("ROLLBACK");
    facts.rollbackCompleted = true;
    try {
      await context.admin.query("SELECT $1::integer", [canary]);
      throw new Error("Expected synthetic integer-conversion rejection.");
    } catch (error) {
      const databaseError = error as { code?: string; message?: string };
      expect(databaseError.code).toBe("22P02");
      facts.conversionErrorCode = databaseError.code;
      facts.driverErrorContainsCanary = databaseError.message?.includes(canary);
    }
    await context.admin.query("SET statement_timeout='20ms'");
    try {
      await context.admin.query("SELECT length($1::text),pg_sleep(1)", [
        canary,
      ]);
      throw new Error("Expected disposable statement cancellation.");
    } catch (error) {
      const databaseError = error as { code?: string; message?: string };
      expect(databaseError.code).toBe("57014");
      facts.cancelErrorCode = databaseError.code;
      facts.cancelErrorContainsCanary = databaseError.message?.includes(canary);
    }
    console.info("ISSUE416_SYNTHETIC_DIAGNOSTICS", JSON.stringify(facts));
  } finally {
    await context.admin.query("ROLLBACK");
    await context.admin.query("RESET statement_timeout");
    await context.admin.query("RESET log_statement");
    await context.admin.query("RESET log_parameter_max_length");
    await context.admin.query("RESET log_parameter_max_length_on_error");
  }
});
