import { describe, expect, it } from "vitest";

import type { QueryableClient } from "../../tools/local-dev/demo-employee-credential";
import {
  collectStatusReport,
  renderStatusReport,
  runReadOnly,
  STATUS_SQL_STATEMENTS,
} from "../../tools/local-dev/status";

class RecordingClient implements QueryableClient {
  public queries: string[] = [];

  constructor(private readonly report: Record<string, unknown>[] = []) {}

  async query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> {
    this.queries.push(`${text}|${JSON.stringify(values ?? [])}`);
    return { rows: this.report, rowCount: this.report.length };
  }
}

describe("status command structural read-only guarantees", () => {
  it("wraps diagnostics in an explicit READ ONLY transaction", async () => {
    const client = new RecordingClient();
    const result = await runReadOnly(client, async (transaction) => {
      await transaction.query("SELECT 1");
      return "value";
    });
    expect(result).toBe("value");
    expect(client.queries[0]).toBe("BEGIN TRANSACTION READ ONLY|[]");
    expect(client.queries.at(-1)).toBe("COMMIT|[]");
  });

  it("rolls back the read-only transaction when a diagnostic fails", async () => {
    const client = new RecordingClient();
    await expect(
      runReadOnly(client, async () => {
        throw new Error("diagnostic failure");
      }),
    ).rejects.toThrow("diagnostic failure");
    expect(client.queries.at(-1)).toBe("ROLLBACK|[]");
  });

  it("keeps every status SQL statement SELECT-only", () => {
    expect(STATUS_SQL_STATEMENTS.length).toBeGreaterThanOrEqual(9);
    for (const statement of STATUS_SQL_STATEMENTS) {
      expect(statement.trim().toUpperCase()).toMatch(/^SELECT\b/);
      expect(statement.toUpperCase()).not.toMatch(
        /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|CREATE)\b/,
      );
      expect(statement.toUpperCase()).not.toMatch(/FOR\s+UPDATE/);
    }
  });

  it("reports employee verification without exposing the stored hash", async () => {
    const client = new RecordingClient([
      {
        database_name: "valet",
        connected_role: "valet_runtime",
        user_id: "u1",
        email: "valet@vaylet.demo.invalid",
        user_status: "ACTIVE",
        membership_role: "VALET_EMPLOYEE",
        membership_status: "ACTIVE",
        code: "AMM-DEMO",
        active_shifts: 1,
        password_hash: "$argon2id$invalid-hash-material",
      },
    ]);
    const report = await collectStatusReport(client);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("$argon2id$invalid-hash-material");
    expect(serialized).not.toContain("password_hash");
    expect(report.employee.exists).toBe(true);
    expect(report.employee.passwordVerifies).toBe(false);
    const lines = renderStatusReport(report);
    expect(lines.join("\n")).toContain("canonical password verifies: NO");
    expect(lines.join("\n")).not.toContain("argon2");
  });

  it("renders a missing demo employee without inventing state", async () => {
    const client = new RecordingClient([]);
    const report = await collectStatusReport(client);
    expect(report.employee.exists).toBe(false);
    expect(report.employee.membershipRole).toBeNull();
    const lines = renderStatusReport(report).join("\n");
    expect(lines).toContain("exists:            NO");
    expect(lines).toContain("active staff auth sessions: 0");
  });
});
