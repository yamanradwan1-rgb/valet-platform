import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import { authorizeDashboardReadLocation } from "../src/modules/dashboard/dashboard-read-authorization";
import { findRetrievalSlaAlertCaseById } from "../src/modules/dashboard/management-alert-sources/retrieval-sla-alert-reader";
import { findIncidentAlertCaseById } from "../src/modules/dashboard/management-alert-sources/incident-alert-reader";
import { findPresenceReviewAlertCaseById } from "../src/modules/dashboard/management-alert-sources/presence-review-alert-reader";
import type { ManagementAlertExactReaderInput } from "../src/modules/dashboard/management-alert-sources/management-alert-source-contract";

vi.mock("../src/modules/dashboard/dashboard-read-authorization", () => ({
  authorizeDashboardReadLocation: vi.fn(),
}));

const sourceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sessionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const input: ManagementAlertExactReaderInput = {
  context: {
    accessTokenHash: "token-hash",
    createdAt: new Date("2026-11-03T00:00:00Z"),
    staffAuthSessionId: "auth-session",
    userId: "user",
  },
  scope: {
    organizationId: "organization",
    locationId: "location",
    membershipId: "membership",
  },
  sourceId,
};
const authorize = vi.mocked(authorizeDashboardReadLocation);

function fakeTransaction(rows: Record<string, unknown>[], enabled = true) {
  const calls: Array<{ sql: string; args?: readonly unknown[] }> = [];
  const transaction = {
    query: vi.fn(async (sql: string, args?: readonly unknown[]) => {
      calls.push(args === undefined ? { sql } : { sql, args });
      if (sql.includes("shift_presence_lock_management_entitlement")) {
        return { rows: [{ enabled }], rowCount: 1 };
      }
      return { rows, rowCount: rows.length };
    }),
  } as unknown as PostgresTransaction;
  return { transaction, calls };
}

beforeEach(() => {
  vi.resetAllMocks();
  authorize.mockResolvedValue(input.scope);
});

describe("Issue #414 exact-source navigation lookup", () => {
  it("returns exact current retrieval source with safe session ID only on detail", async () => {
    const { transaction, calls } = fakeTransaction([
      {
        requestId: sourceId,
        valetSessionId: sessionId,
        requestedAt: new Date("2026-11-03T12:00:00Z"),
      },
    ]);
    const found = await findRetrievalSlaAlertCaseById(transaction, {
      ...input,
      graceSeconds: 0,
    });
    expect(found).toMatchObject({
      category: "ALT-01",
      sourceId,
      valetSessionId: sessionId,
      severity: "CRITICAL",
      title: "Retrieval SLA exceeded",
    });
    expect(Object.keys(found ?? {})).not.toContain("customerId");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain("AND request.id=$5::uuid");
    expect(calls[0]!.args).toEqual([
      "organization",
      "location",
      0,
      1,
      sourceId,
    ]);
  });

  it("matches Incident by exact ID before LIMIT under current status/severity", async () => {
    const { transaction, calls } = fakeTransaction([
      {
        incidentId: sourceId,
        severity: "CRITICAL",
        createdAt: new Date("2026-11-03T12:00:00Z"),
        description: "do not return",
      },
    ]);
    const found = await findIncidentAlertCaseById(transaction, input);
    expect(found).toMatchObject({
      category: "ALT-08",
      sourceId,
      severity: "CRITICAL",
    });
    expect(JSON.stringify(found)).not.toContain("do not return");
    expect(calls[0]!.sql).toContain("AND incident.id=$4::uuid");
    expect(calls[0]!.args).toEqual(["organization", "location", 1, sourceId]);
  });

  it("requires Presence entitlement before exact reviewability, with no source leak", async () => {
    const forbidden = fakeTransaction([], false);
    await expect(
      findPresenceReviewAlertCaseById(forbidden.transaction, input),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(forbidden.calls).toHaveLength(1);
    const allowed = fakeTransaction([
      {
        exceptionId: sourceId,
        requestedAt: new Date("2026-11-03T12:00:00Z"),
        reason: "private reason",
      },
    ]);
    const found = await findPresenceReviewAlertCaseById(
      allowed.transaction,
      input,
    );
    expect(found).toMatchObject({
      category: "ALT-12",
      sourceId,
      title: "Presence exception requires review",
    });
    expect(JSON.stringify(found)).not.toContain("private reason");
    expect(allowed.calls[1]!.sql).toContain("AND e.id=$5::uuid");
    expect(allowed.calls[1]!.sql).toContain("challenge.consumed_at IS NULL");
    expect(allowed.calls[1]!.args).toEqual([
      "organization",
      "location",
      "user",
      1,
      sourceId,
    ]);
  });

  it("returns null for absent/retired exact cases while still reauthorizing", async () => {
    const { transaction, calls } = fakeTransaction([]);
    expect(await findIncidentAlertCaseById(transaction, input)).toBeNull();
    expect(calls).toHaveLength(1);
    expect(authorize).toHaveBeenCalledTimes(1);
  });

  it("does not query sources for invalid IDs, revoked grants or changed membership", async () => {
    const { transaction, calls } = fakeTransaction([]);
    await expect(
      findIncidentAlertCaseById(transaction, {
        ...input,
        sourceId: "not-a-uuid",
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(calls).toHaveLength(0);
    authorize.mockResolvedValueOnce(null);
    await expect(
      findRetrievalSlaAlertCaseById(transaction, {
        ...input,
        graceSeconds: 0,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    authorize.mockResolvedValueOnce({
      ...input.scope,
      membershipId: "different",
    });
    await expect(
      findPresenceReviewAlertCaseById(transaction, input),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(calls).toHaveLength(0);
  });
});
