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

class RecordingClient implements QueryableClient {
  public queries: RecordedQuery[] = [];

  constructor(
    private readonly responses: Array<{
      rows?: Record<string, unknown>[];
      rowCount?: number | null;
    }> = [],
  ) {}

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

function successfulClient(): RecordingClient {
  return new RecordingClient([
    { rowCount: 1 },
    { rows: [{ role: "VALET_EMPLOYEE", membership_status: "ACTIVE" }] },
    { rows: [{ code: AMMAN_DEMO_LOCATION_CODE }] },
    { rows: [{ status: "ACTIVE" }] },
  ]);
}

describe("canonical demo employee credential", () => {
  it("stores a hash produced by the official provisioning implementation", async () => {
    const client = successfulClient();
    const result = await makeDemoEmployeeLoginCapable(
      client,
      "valet@vaylet.demo.invalid",
      "VayletPassword123!",
    );
    const update = client.queries.find((entry) =>
      entry.text.startsWith("UPDATE users"),
    );
    expect(update).toBeDefined();
    const storedHash = String(update?.values?.[0]);
    expect(storedHash).not.toBe("VayletPassword123!");
    expect(isAcceptedStaffPasswordHash(storedHash)).toBe(true);
    expect(await argon2.verify(storedHash, "VayletPassword123!")).toBe(true);
    expect(update?.values?.[1]).toBe("valet@vaylet.demo.invalid");
    expect(result.email).toBe("valet@vaylet.demo.invalid");
    expect(result.membershipRole).toBe("VALET_EMPLOYEE");
    expect(result.activeShift).toBe(true);
  });

  it("never exposes the password hash in the returned status object", async () => {
    const client = successfulClient();
    const result = await makeDemoEmployeeLoginCapable(
      client,
      "valet@vaylet.demo.invalid",
      "VayletPassword123!",
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/argon2id/i);
    expect(serialized.toLowerCase()).not.toContain("password_hash");
    expect(Object.keys(result)).toEqual([
      "activeShift",
      "email",
      "locationCodes",
      "membershipRole",
    ]);
  });

  it("aborts when the demo employee row is missing or not ACTIVE", async () => {
    const client = new RecordingClient([{ rowCount: 0 }]);
    await expect(
      makeDemoEmployeeLoginCapable(
        client,
        "valet@vaylet.demo.invalid",
        "VayletPassword123!",
      ),
    ).rejects.toThrow("not found or is not ACTIVE");
    expect(
      client.queries.some((entry) => entry.text.startsWith("SELECT")),
    ).toBe(false);
  });

  it("verifies canonical membership, Amman access and active shift", async () => {
    const wrongRole = new RecordingClient([
      { rowCount: 1 },
      { rows: [{ role: "ORG_ADMIN", membership_status: "ACTIVE" }] },
    ]);
    await expect(
      makeDemoEmployeeLoginCapable(wrongRole, "x", "VayletPassword123!"),
    ).rejects.toThrow("must remain VALET_EMPLOYEE");

    const inactiveMembership = new RecordingClient([
      { rowCount: 1 },
      { rows: [{ role: "VALET_EMPLOYEE", membership_status: "INACTIVE" }] },
    ]);
    await expect(
      makeDemoEmployeeLoginCapable(
        inactiveMembership,
        "x",
        "VayletPassword123!",
      ),
    ).rejects.toThrow("membership must remain ACTIVE");

    const missingAccess = new RecordingClient([
      { rowCount: 1 },
      { rows: [{ role: "VALET_EMPLOYEE", membership_status: "ACTIVE" }] },
      { rows: [{ code: "DXB-DEMO" }] },
    ]);
    await expect(
      makeDemoEmployeeLoginCapable(missingAccess, "x", "VayletPassword123!"),
    ).rejects.toThrow(AMMAN_DEMO_LOCATION_CODE);

    const noShift = new RecordingClient([
      { rowCount: 1 },
      { rows: [{ role: "VALET_EMPLOYEE", membership_status: "ACTIVE" }] },
      { rows: [{ code: AMMAN_DEMO_LOCATION_CODE }] },
      { rows: [] },
    ]);
    await expect(
      makeDemoEmployeeLoginCapable(noShift, "x", "VayletPassword123!"),
    ).rejects.toThrow("active Shift");
  });
});
