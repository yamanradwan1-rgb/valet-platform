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
  findHandoffTerminalAlertOccurrence,
  queryHandoffTerminalAlertOccurrences,
} from "../src/modules/dashboard/management-alert-sources/handoff-terminal-occurrence-reader";

const organizationId = randomUUID();
const locationId = randomUUID();
const membershipId = randomUUID();
const sessionId = randomUUID();
const eventId = randomUUID();
const overrideId = randomUUID();
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

describe("Issue #414 DEC-110: ALT-07 terminal handoff occurrence", () => {
  it("permits only an exact-granted audit-authorized LM and denies mismatched identity", async () => {
    mocks.auditAuthority.mockResolvedValue({
      ...scope,
      role: "LOCATION_MANAGER",
      membershipId: randomUUID(),
    });
    const calls: string[] = [];
    const { tx } = fakeTransaction([], calls);
    await expect(
      queryHandoffTerminalAlertOccurrences(tx, input),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(calls).toEqual([]);
    mocks.auditAuthority.mockResolvedValue({
      ...scope,
      role: "LOCATION_MANAGER",
    });
    expect(await queryHandoffTerminalAlertOccurrences(tx, input)).toEqual([]);
    expect(mocks.requireMfa).not.toHaveBeenCalled();
  });

  it("denies a Supervisor even with the ordinary audited Location scope", async () => {
    mocks.auditAuthority.mockResolvedValue({
      ...scope,
      role: "VALET_SUPERVISOR",
    });
    const calls: string[] = [];
    const { tx } = fakeTransaction([], calls);
    await expect(
      queryHandoffTerminalAlertOccurrences(tx, input),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(calls).toEqual([]);
  });

  it("excludes ordinary attempts at SQL boundary and never reads proof or reason metadata", async () => {
    const calls: string[] = [];
    const { tx, sql } = fakeTransaction(
      [
        {
          eventId,
          eventType: "HANDOFF_VERIFICATION_FAILED",
          valetSessionId: sessionId,
          occurredAt,
          metadataJson: { secret_hash: "PRIVATE", method: "PICKUP_CODE" },
        },
        {
          eventId: overrideId,
          eventType: "HANDOFF_SUPERVISOR_OVERRIDE",
          valetSessionId: sessionId,
          occurredAt,
          reason: "PRIVATE",
        },
      ],
      calls,
    );
    const result = await queryHandoffTerminalAlertOccurrences(tx, input);
    expect(result.map((item) => item.sourceId)).toEqual([eventId, overrideId]);
    expect(result.map((item) => item.episodeId)).toEqual([eventId, overrideId]);
    expect(result.map((item) => item.sourceKind)).toEqual([
      "TERMINAL_HANDOFF_FAILURE",
      "HANDOFF_SUPERVISOR_OVERRIDE",
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE|secret_hash|reason|method/,
    );
    expect(sql[0]).toContain(
      "event.metadata_json @> '{\"terminalized\":true}'::jsonb",
    );
    expect(sql[0]).toContain("event.entity_id=event.valet_session_id");
    expect(sql[0]).toContain("INTERVAL '7 days'");
    expect(sql[0]!.split(/\bFROM\b/, 1)[0]).not.toMatch(/metadata_json/i);
    expect(result[0]?.sourceId).not.toBe(result[1]?.sourceId);
  });

  it("does not infer a proof episode from same-ms UUID order, and exact ID stays scoped", async () => {
    const calls: string[] = [];
    const { tx, sql } = fakeTransaction(
      [
        {
          eventId,
          eventType: "HANDOFF_VERIFICATION_FAILED",
          valetSessionId: sessionId,
          occurredAt,
        },
      ],
      calls,
    );
    const result = await findHandoffTerminalAlertOccurrence(tx, {
      ...input,
      sourceId: eventId,
    });
    expect(result?.sourceId).toBe(eventId);
    expect(result?.episodeId).toBe(eventId);
    expect(sql[0]).toContain("event.id=$4::uuid");
    expect(sql[0]).not.toMatch(/LAG\(|ROW_NUMBER\(|verification_id/);
  });

  it("keeps two independent terminal events at the same millisecond separate", async () => {
    const otherId = randomUUID();
    const calls: string[] = [];
    const { tx } = fakeTransaction(
      [
        {
          eventId,
          eventType: "HANDOFF_VERIFICATION_FAILED",
          valetSessionId: sessionId,
          occurredAt,
        },
        {
          eventId: otherId,
          eventType: "HANDOFF_VERIFICATION_FAILED",
          valetSessionId: sessionId,
          occurredAt,
        },
      ],
      calls,
    );
    const cases = await queryHandoffTerminalAlertOccurrences(tx, input);
    expect(cases).toHaveLength(2);
    expect(new Set(cases.map((item) => item.sourceId)).size).toBe(2);
    expect(cases[0]?.occurredAt).toBe(cases[1]?.occurredAt);
  });
});
