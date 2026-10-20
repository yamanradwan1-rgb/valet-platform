import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostgresTransaction } from "../../src/common/database/postgres";
import type { StaffSessionContext } from "../../src/modules/auth/staff-session-context";
import { ManagementAccessDeniedError } from "../../src/modules/management/management-authorization";
import { authorizeManagementAuditLocation } from "../../src/modules/management/management-audit-authorization";
import { authorizeAuditInvestigationLocation } from "../../src/modules/management/audit-investigation/security/audit-investigation-authorization";

vi.mock("../../src/modules/management/management-audit-authorization", () => ({
  authorizeManagementAuditLocation: vi.fn(),
}));
vi.mock("../../src/modules/management/management-authorization", () => ({
  ManagementAccessDeniedError: class ManagementAccessDeniedError extends Error {
    readonly code = "AUTHORIZATION_DENIED";
    constructor() {
      super("The requested resource is not available.");
    }
  },
}));

const underlying = vi.mocked(authorizeManagementAuditLocation);
const credential: StaffSessionContext = {
  accessTokenHash: "server-derived-token-hash",
  createdAt: new Date("2026-10-17T00:00:00Z"),
  staffAuthSessionId: "staff-session-1",
  userId: "user-1",
};
const tx = { query: vi.fn() } as unknown as PostgresTransaction;
const organizationId = "organization-1";
const locationId = "location-1";

function scope(role: "ORG_ADMIN" | "LOCATION_MANAGER" | "VALET_SUPERVISOR") {
  return {
    organizationId,
    locationId,
    membershipId: "membership-1",
    scope: "LOCATION" as const,
    role,
  };
}

describe("authorizeAuditInvestigationLocation", () => {
  beforeEach(() => underlying.mockReset());

  it.each(["ORG_ADMIN", "LOCATION_MANAGER"] as const)(
    "permits a persisted %s Location scope and strips unneeded fields",
    async (role) => {
      underlying.mockResolvedValueOnce(scope(role));
      const authorized = await authorizeAuditInvestigationLocation(
        tx, credential, organizationId, locationId,
      );
      expect(authorized).toEqual({
        organizationId,
        locationId,
        membershipId: "membership-1",
        role,
      });
      expect(underlying).toHaveBeenCalledExactlyOnceWith(
        tx, credential, organizationId, locationId,
      );
    },
  );

  it("rejects Supervisor despite existing Audit Events permission", async () => {
    underlying.mockResolvedValueOnce(scope("VALET_SUPERVISOR"));
    await expect(authorizeAuditInvestigationLocation(
      tx, credential, organizationId, locationId,
    )).rejects.toBeInstanceOf(ManagementAccessDeniedError);
  });

  it.each([
    { ...scope("ORG_ADMIN"), locationId: "another-location" },
    { ...scope("LOCATION_MANAGER"), organizationId: "another-org" },
    { ...scope("ORG_ADMIN"), scope: "ORGANIZATION" as const },
    { ...scope("LOCATION_MANAGER"), membershipId: "" },
    { ...scope("LOCATION_MANAGER"), role: "VALET_EMPLOYEE" as never },
  ])("fails closed on malformed or cross-scope result %#", async (bad) => {
    underlying.mockResolvedValueOnce(bad as Awaited<ReturnType<typeof authorizeManagementAuditLocation>>);
    await expect(authorizeAuditInvestigationLocation(
      tx, credential, organizationId, locationId,
    )).rejects.toBeInstanceOf(ManagementAccessDeniedError);
  });

  it("does not cache authority across a revoked second request", async () => {
    underlying.mockResolvedValueOnce(scope("LOCATION_MANAGER"));
    underlying.mockRejectedValueOnce(new ManagementAccessDeniedError());
    await expect(authorizeAuditInvestigationLocation(
      tx, credential, organizationId, locationId,
    )).resolves.toMatchObject({ role: "LOCATION_MANAGER" });
    await expect(authorizeAuditInvestigationLocation(
      tx, credential, organizationId, locationId,
    )).rejects.toBeInstanceOf(ManagementAccessDeniedError);
    expect(underlying).toHaveBeenCalledTimes(2);
  });

  it("preserves revoked, MFA, commercial, inactive-user and session errors", async () => {
    const failure = new Error("MFA_STEP_UP_REQUIRED");
    underlying.mockRejectedValueOnce(failure);
    await expect(authorizeAuditInvestigationLocation(
      tx, credential, organizationId, locationId,
    )).rejects.toBe(failure);
  });
});
