import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostgresTransaction } from "../../src/common/database/postgres";
import { ManagementAccessDeniedError } from "../../src/modules/management/management-authorization";
import { requireAuditInvestigationDetailSource } from "../../src/modules/management/audit-investigation/security/audit-investigation-source-boundary";

vi.mock("../../src/modules/management/management-authorization", () => ({
  ManagementAccessDeniedError: class ManagementAccessDeniedError extends Error {
    readonly code = "AUTHORIZATION_DENIED";
    constructor() {
      super("The requested resource is not available.");
    }
  },
}));

const organizationId = "org-1";
const locationId = "loc-1";
const membershipId = "member-1";
const scope = { organizationId, locationId, membershipId, role: "LOCATION_MANAGER" as const };
const sessionId = "session-1";
const eventId = "event-1";
const query = vi.fn();
const tx = { query } as unknown as PostgresTransaction;

describe("requireAuditInvestigationDetailSource", () => {
  beforeEach(() => query.mockReset());

  it.each([
    ["AUDIT", "audit_events"],
    ["KEY_CUSTODY", "key_custody_events"],
    ["DISPATCH", "dispatch_events"],
    ["INCIDENT", "incidents"],
  ] as const)("proves %s exact org/location/session/source/id in SQL", async (source, table) => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ allowed: 1 }] });
    await expect(requireAuditInvestigationDetailSource(tx, scope, {
      sessionId, source, eventId,
    })).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0] as [string, readonly string[]];
    expect(sql).toContain(table);
    expect(sql).toContain("valet_sessions");
    expect(sql).toContain("evidence.organization_id = session.organization_id");
    expect(sql).toContain("evidence.location_id = session.location_id");
    expect(sql).toContain("evidence.valet_session_id = session.id");
    expect(values).toEqual([organizationId, locationId, sessionId, eventId]);
    if (source === "INCIDENT") expect(sql).toContain("location.status = 'ACTIVE'");
    if (source !== "INCIDENT") expect(sql).not.toContain("location.status = 'ACTIVE'");
  });

  it.each([0, 2])("denies zero or ambiguous matches (%s)", async (count) => {
    query.mockResolvedValueOnce({ rowCount: count, rows: count ? [{ allowed: 1 }, { allowed: 1 }] : [] });
    await expect(requireAuditInvestigationDetailSource(tx, scope, {
      sessionId, source: "INCIDENT", eventId,
    })).rejects.toBeInstanceOf(ManagementAccessDeniedError);
  });

  it("does not accept arbitrary metadata or attacker-controlled table names", async () => {
    await expect(requireAuditInvestigationDetailSource(tx, scope, {
      sessionId, source: "INCIDENT; DROP TABLE incidents" as "INCIDENT", eventId,
    })).rejects.toBeInstanceOf(ManagementAccessDeniedError);
    expect(query).not.toHaveBeenCalled();
  });

  it("does not authorize a photo-byte or private-object source", async () => {
    await expect(requireAuditInvestigationDetailSource(tx, scope, {
      sessionId, source: "PHOTO" as "AUDIT", eventId,
    })).rejects.toBeInstanceOf(ManagementAccessDeniedError);
    expect(query).not.toHaveBeenCalled();
  });

  it("fails closed when source row does not belong to the authorized Session", async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(requireAuditInvestigationDetailSource(tx, scope, {
      sessionId: "other-session", source: "DISPATCH", eventId,
    })).rejects.toBeInstanceOf(ManagementAccessDeniedError);
  });

  it("does not emit raw columns, reasons or sensitive metadata", async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ allowed: 1 }] });
    await requireAuditInvestigationDetailSource(tx, scope, {
      sessionId, source: "AUDIT", eventId,
    });
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toMatch(/SELECT\s+1\b/);
    expect(sql).not.toMatch(/metadata_json|object_key|password|secret_hash|description|returning\s+\*/i);
  });
});
