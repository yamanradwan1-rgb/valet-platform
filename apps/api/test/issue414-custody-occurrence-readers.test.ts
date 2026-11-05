import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import type { ManagementAlertReaderInput } from "../src/modules/dashboard/management-alert-sources/management-alert-source-contract";

const mocks = vi.hoisted(() => ({
  sourceScope: vi.fn(),
  auditAuthority: vi.fn(),
  requireMfa: vi.fn(),
}));

vi.mock(
  "../src/modules/dashboard/management-alert-sources/management-alert-source-contract",
  async (original) => ({
    ...(await original<object>()),
    requireManagementAlertSourceScope: mocks.sourceScope,
  }),
);
vi.mock("../src/modules/management/management-audit-authorization", () => ({
  authorizeManagementAuditLocation: mocks.auditAuthority,
}));
vi.mock("../src/modules/auth/mfa/mfa-assurance-policy", async (original) => ({
  ...(await original<object>()),
  requireMfaAssuranceInTransaction: mocks.requireMfa,
}));

import {
  queryEmergencyTakeoverAlertOccurrences,
  findEmergencyTakeoverAlertOccurrence,
} from "../src/modules/dashboard/management-alert-sources/emergency-takeover-occurrence-reader";

const organizationId = randomUUID();
const locationId = randomUUID();
const membershipId = randomUUID();
const sessionId = randomUUID();
const taskId = randomUUID();
const operationId = randomUUID();
const occurredAt = new Date("2026-11-04T20:00:00Z");
const scope = { organizationId, locationId, membershipId };
const input = {
  context: {
    userId: randomUUID(),
    staffAuthSessionId: randomUUID(),
    accessTokenHash: "staff-access-sha256:v1:test",
    createdAt: occurredAt,
  },
  scope,
  limit: 21,
} satisfies ManagementAlertReaderInput;

type SqlRow = Record<string, unknown>;

function fakeTransaction(
  rows: SqlRow[],
  calls: string[],
): { readonly tx: PostgresTransaction; readonly sql: string[] } {
  const sql: string[] = [];
  const tx = {
    query: vi.fn(async (statement: string, parameters: unknown[]) => {
      calls.push("source");
      sql.push(statement);
      expect(parameters.slice(0, 2)).toEqual([organizationId, locationId]);
      expect([1, input.limit]).toContain(parameters[2]);
      return { rows, rowCount: rows.length };
    }),
  } as unknown as PostgresTransaction;
  return { tx, sql };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.sourceScope.mockResolvedValue(scope);
  mocks.auditAuthority.mockResolvedValue({ ...scope, role: "ORG_ADMIN" });
  mocks.requireMfa.mockResolvedValue(undefined);
});

describe("Issue #414 DEC-110: ALT-05 committed takeover read", () => {
  it("requires protected source/MFA before rows and returns a secret-free operation identity", async () => {
    const calls: string[] = [];
    mocks.sourceScope.mockImplementation(async () => {
      calls.push("scope");
      return scope;
    });
    mocks.auditAuthority.mockImplementation(async () => {
      calls.push("audit");
      return { ...scope, role: "ORG_ADMIN" };
    });
    mocks.requireMfa.mockImplementation(async () => {
      calls.push("mfa");
    });
    const fixture = {
      operationId,
      taskId,
      valetSessionId: sessionId,
      occurredAt,
      reason: "PRIVATE takeover reason",
      requestFingerprint: "PRIVATE fingerprint",
      newAssigneeMembershipId: randomUUID(),
    };
    const { tx, sql } = fakeTransaction([fixture], calls);
    const cases = await queryEmergencyTakeoverAlertOccurrences(tx, input);
    expect(calls).toEqual(["scope", "audit", "mfa", "source"]);
    expect(cases).toEqual([
      {
        category: "ALT-05",
        severity: "CRITICAL",
        sourceKind: "EMERGENCY_TAKEOVER",
        sourceId: operationId,
        episodeId: operationId,
        organizationId,
        locationId,
        valetSessionId: sessionId,
        taskId,
        occurredAt: occurredAt.toISOString(),
        title: "Emergency task takeover",
      },
    ]);
    expect(JSON.stringify(cases)).not.toMatch(/PRIVATE|fingerprint|assignee/i);
    expect(sql[0]).toContain("FROM emergency_task_takeover_operations");
    expect(sql[0]).toContain("dispatch.event_type='EMERGENCY_TAKEOVER'");
    expect(sql[0]).toContain("audit.event_type='TASK_EMERGENCY_TAKEOVER'");
    expect(sql[0]).toContain(
      "dispatch.actor_membership_id=takeover.actor_membership_id",
    );
    expect(sql[0]).toContain(
      "dispatch.previous_assignee_membership_id=takeover.previous_assignee_membership_id",
    );
    expect(sql[0]).toContain(
      "dispatch.new_assignee_membership_id=takeover.new_assignee_membership_id",
    );
    expect(sql[0]).toContain(
      "audit.actor_membership_id=takeover.actor_membership_id",
    );
    expect(sql[0]).toContain("audit.metadata_json @> jsonb_build_object(");
    for (const field of [
      "operationId",
      "sessionId",
      "previousAssigneeMembershipId",
      "newAssigneeMembershipId",
      "fromVersion",
      "toVersion",
      "fromSessionVersion",
      "toSessionVersion",
    ]) {
      expect(sql[0]).toContain(`'${field}'`);
    }
    expect(sql[0]).toContain("INTERVAL '7 days'");
    // Scope the privacy assertion to SELECT columns. Audit metadata is used
    // only in an existence/provenance predicate, not projected to the caller.
    expect(sql[0]).not.toMatch(/\breason\b|request_fingerprint/);
    expect(sql[0]!.split(/\bFROM\b/, 1)[0]).not.toMatch(/metadata_json/i);
  });

  it("rejects an LM without takeover source permission before looking up any operation", async () => {
    mocks.auditAuthority.mockResolvedValue({
      ...scope,
      role: "LOCATION_MANAGER",
    });
    const calls: string[] = [];
    const { tx } = fakeTransaction([], calls);
    await expect(
      queryEmergencyTakeoverAlertOccurrences(tx, input),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(calls).toEqual([]);
    expect(mocks.requireMfa).not.toHaveBeenCalled();
  });

  it("replays the same operation identity and exact lookup is not page-dependent", async () => {
    const calls: string[] = [];
    const { tx, sql } = fakeTransaction(
      [{ operationId, taskId, valetSessionId: sessionId, occurredAt }],
      calls,
    );
    const first = await queryEmergencyTakeoverAlertOccurrences(tx, input);
    const replay = await findEmergencyTakeoverAlertOccurrence(tx, {
      ...input,
      sourceId: operationId,
    });
    expect(replay).toEqual(first[0]);
    expect(replay?.episodeId).toBe(operationId);
    expect(sql[1]).toContain("takeover.operation_id=$4::uuid");
    expect(sql[1]).toContain("LIMIT $3");
    expect(calls.filter((value) => value === "source")).toHaveLength(2);
  });
});
