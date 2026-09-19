import argon2 from "argon2";
import { describe, expect, it } from "vitest";

import { isAcceptedStaffPasswordHash } from "../../src/modules/auth/staff-auth.service";
import {
  AMMAN_DEMO_LOCATION_CODE,
  makeDemoEmployeeLoginCapable,
  type QueryableClient,
} from "../../tools/local-dev/demo-employee-credential";

interface RecordedQuery {
  readonly text: string;
  readonly values?: readonly unknown[] | undefined;
}

class SuccessfulClient implements QueryableClient {
  public queries: RecordedQuery[] = [];
  private readonly responses: Array<{
    rows?: Record<string, unknown>[];
    rowCount?: number | null;
  }> = [
    { rowCount: 1 },
    { rows: [{ role: "VALET_EMPLOYEE", membership_status: "ACTIVE" }] },
    { rows: [{ code: AMMAN_DEMO_LOCATION_CODE }] },
    { rows: [{ status: "ACTIVE" }] },
  ];

  async query(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> {
    this.queries.push({ text, values });
    const response = this.responses[this.queries.length - 1] ?? {};
    const rows = response.rows ?? [];
    return {
      rows,
      rowCount: response.rowCount ?? rows.length,
    };
  }
}

describe("canonical demo employee credential hash integration", () => {
  it("stores and verifies the official provisioning Argon2 hash", async () => {
    const password = "VayletPassword123!";
    const client = new SuccessfulClient();
    const result = await makeDemoEmployeeLoginCapable(
      client,
      "valet@vaylet.demo.invalid",
      password,
    );
    const update = client.queries.find((entry) =>
      entry.text.startsWith("UPDATE users"),
    );

    expect(update).toBeDefined();
    const storedHash = String(update?.values?.[0]);
    expect(storedHash).not.toBe(password);
    expect(isAcceptedStaffPasswordHash(storedHash)).toBe(true);
    await expect(argon2.verify(storedHash, password)).resolves.toBe(true);
    expect(update?.values?.[1]).toBe("valet@vaylet.demo.invalid");
    expect(result).toMatchObject({
      activeShift: true,
      email: "valet@vaylet.demo.invalid",
      membershipRole: "VALET_EMPLOYEE",
    });
  });
});
