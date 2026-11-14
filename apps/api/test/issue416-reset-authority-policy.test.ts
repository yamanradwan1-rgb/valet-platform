import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/modules/auth/mfa/mfa-assurance-policy", () => ({
  requireMfaAssuranceInTransaction: vi.fn(),
}));
vi.mock(
  "../src/modules/management/management-commercial-access-policy",
  () => ({
    hasManagementCommercialAccess: vi.fn().mockResolvedValue(true),
  }),
);

import { requireMfaAssuranceInTransaction } from "../src/modules/auth/mfa/mfa-assurance-policy";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { preflightPasswordResetTarget } from "../src/modules/management/issue416-password-reset-authority";

const org = randomUUID();
const actor = randomUUID();
const targetUser = randomUUID();
const targetMembership = randomUUID();
const context: StaffSessionContext = {
  accessTokenHash: "not-a-bearer-proof",
  createdAt: new Date(),
  staffAuthSessionId: randomUUID(),
  userId: actor,
};

function fixture(options: { issuer?: boolean; target?: boolean } = {}) {
  const { issuer = true, target = true } = options;
  const query = vi.fn(async (statement: string) => {
    if (statement.includes("INNER JOIN organizations AS organization")) {
      return { rowCount: issuer ? 1 : 0, rows: issuer ? [{}] : [] };
    }
    if (statement.includes("pg_advisory_xact_lock")) {
      return { rowCount: 1, rows: [{}] };
    }
    if (statement.includes("SELECT id FROM organizations")) {
      return { rowCount: 1, rows: [{ id: org }] };
    }
    if (statement.includes("FOR UPDATE OF membership")) {
      return {
        rowCount: 1,
        rows: [{ membershipId: randomUUID(), organizationId: org }],
      };
    }
    if (statement.includes("SELECT target.user_id")) {
      return {
        rowCount: target ? 1 : 0,
        rows: target ? [{ targetUserId: targetUser }] : [],
      };
    }
    throw new Error("Unexpected authority SQL");
  });
  return { query };
}

beforeEach(() => {
  vi.mocked(requireMfaAssuranceInTransaction).mockReset().mockResolvedValue();
});

describe("Issue416 actual Company Admin authority policy, read-only preflight", () => {
  it("requires active ORG_ADMIN exact org then five-minute MFA for issuance", async () => {
    const transaction = fixture();
    expect(
      await preflightPasswordResetTarget(
        transaction as never,
        context,
        org,
        targetMembership,
        true,
      ),
    ).toBe(targetUser);
    expect(requireMfaAssuranceInTransaction).toHaveBeenCalledWith(
      transaction,
      context,
      { sensitive: true },
    );
    const firstQuery = transaction.query.mock.calls[0]?.[0];
    expect(firstQuery).toContain("membership.role = 'ORG_ADMIN'");
    expect(firstQuery).toContain("membership.status = 'ACTIVE'");
    expect(firstQuery).toContain("organization.status = 'ACTIVE'");
    expect(firstQuery).toContain("membership.organization_id = $2");
    const targetSql = transaction.query.mock.calls.at(-1)?.[0];
    expect(targetSql).toContain("all_memberships.user_id = target.user_id");
    expect(targetSql).toContain("COUNT(*)");
    expect(targetSql).not.toContain("membership_location_access");
  });

  it("status still requires MFA but not a fresh sensitive step-up", async () => {
    const transaction = fixture();
    await preflightPasswordResetTarget(
      transaction as never,
      context,
      org,
      targetMembership,
      false,
    );
    expect(requireMfaAssuranceInTransaction).toHaveBeenCalledWith(
      transaction,
      context,
      { sensitive: false },
    );
  });

  it("conceals missing CA/foreign organization without entering target query", async () => {
    const transaction = fixture({ issuer: false });
    await expect(
      preflightPasswordResetTarget(
        transaction as never,
        context,
        org,
        targetMembership,
        true,
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(requireMfaAssuranceInTransaction).not.toHaveBeenCalled();
    expect(transaction.query).toHaveBeenCalledTimes(1);
  });

  it("blocks stale MFA before target lookup or reset generation", async () => {
    const transaction = fixture();
    vi.mocked(requireMfaAssuranceInTransaction).mockRejectedValueOnce(
      Object.assign(new Error("Step-up required"), {
        code: "MFA_STEP_UP_REQUIRED",
      }),
    );
    await expect(
      preflightPasswordResetTarget(
        transaction as never,
        context,
        org,
        targetMembership,
        true,
      ),
    ).rejects.toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    expect(transaction.query).toHaveBeenCalledTimes(1);
  });

  it("conceals inactive, self, ORG_ADMIN, multi-company and foreign targets", async () => {
    const transaction = fixture({ target: false });
    await expect(
      preflightPasswordResetTarget(
        transaction as never,
        context,
        org,
        targetMembership,
        true,
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    const targetSql = transaction.query.mock.calls.at(-1)?.[0] ?? "";
    expect(targetSql).toContain("target.user_id <> $3");
    expect(targetSql).toContain("target.status = 'ACTIVE'");
    expect(targetSql).toContain("staff_user.status = 'ACTIVE'");
    expect(targetSql).toContain("'LOCATION_MANAGER'");
    expect(targetSql).toContain("'VALET_SUPERVISOR'");
    expect(targetSql).toContain("'VALET_EMPLOYEE'");
    expect(targetSql).not.toContain("'ORG_ADMIN'");
  });
});
