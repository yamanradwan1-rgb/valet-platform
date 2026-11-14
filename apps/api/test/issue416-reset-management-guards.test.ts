import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/modules/management/management-authorization", () => ({
  authorizeCompanyAdminManagement: vi.fn(),
  ManagementAccessDeniedError: class ManagementAccessDeniedError extends Error {
    readonly code = "AUTHORIZATION_DENIED";
  },
}));

import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { authorizeCompanyAdminManagement } from "../src/modules/management/management-authorization";
import { preflightPasswordResetTarget } from "../src/modules/management/issue416-password-reset-authority";
import { Issue416PasswordResetService } from "../src/modules/management/issue416-password-reset.service";
import { issue416PasswordResetLink } from "../src/modules/management/issue416-password-reset-link";
import { generateStaffPasswordResetToken } from "../src/modules/auth/staff-password-reset-credential";
import { Issue416ResetUnavailableError } from "../src/modules/auth/issue416-password-reset-errors";

const organizationId = randomUUID();
const membershipId = randomUUID();
const targetUserId = randomUUID();
const context: StaffSessionContext = {
  accessTokenHash: "hash-only-preflight",
  createdAt: new Date(),
  staffAuthSessionId: randomUUID(),
  userId: randomUUID(),
};

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.STAFF_PASSWORD_RESET_PUBLIC_ORIGIN;
});

describe("Issue416 protected reset preflight", () => {
  it("checks current CA entitlement and exact-session sensitive MFA without LM fallback", async () => {
    const transaction = {
      query: vi.fn().mockResolvedValue({
        rowCount: 1,
        rows: [{ targetUserId }],
      }),
    };
    const result = await preflightPasswordResetTarget(
      transaction as never,
      context,
      organizationId,
      membershipId,
      true,
    );
    expect(result).toBe(targetUserId);
    expect(authorizeCompanyAdminManagement).toHaveBeenCalledWith(
      transaction,
      context,
      {
        organizationId,
        capability: "STAFF_MANAGE_ELIGIBLE",
        assurance: "SENSITIVE",
      },
    );
    const [sql, params] = transaction.query.mock.calls[0] as [string, string[]];
    expect(params).toEqual([membershipId, organizationId, context.userId]);
    expect(sql).toContain("target.role IN");
    expect(sql).toContain("'LOCATION_MANAGER'");
    expect(sql).toContain("'VALET_SUPERVISOR'");
    expect(sql).toContain("'VALET_EMPLOYEE'");
    expect(sql).toContain("staff_user.status = 'ACTIVE'");
    expect(sql).toContain("target.status = 'ACTIVE'");
    expect(sql).toContain("target.user_id <> $3");
    // Counts ALL statuses without limiting to active Organizations or grants.
    expect(sql).toContain(
      "COUNT(*) FROM organization_memberships AS all_memberships",
    );
    expect(sql).toContain("all_memberships.user_id = target.user_id");
    expect(sql).not.toContain("membership_location_access");
  });

  it("conceals any missing, multi-company, inactive, admin or cross-tenant target", async () => {
    const transaction = {
      query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
    };
    await expect(
      preflightPasswordResetTarget(
        transaction as never,
        context,
        organizationId,
        membershipId,
        false,
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(authorizeCompanyAdminManagement).toHaveBeenLastCalledWith(
      transaction,
      context,
      {
        organizationId,
        capability: "STAFF_MANAGE_ELIGIBLE",
        assurance: "STANDARD",
      },
    );
  });

  it("fails closed before touching database when protected SQL writer is absent", async () => {
    const resolver = { resolve: vi.fn() };
    const addresses = { resolve: vi.fn() };
    const service = new Issue416PasswordResetService(
      {} as never,
      resolver as never,
      addresses as never,
    );
    await expect(
      service.status("Bearer abc", organizationId, membershipId),
    ).rejects.toBeInstanceOf(Issue416ResetUnavailableError);
    await expect(
      service.issue(
        "Bearer abc",
        organizationId,
        membershipId,
        { operationId: randomUUID(), expectedGeneration: 0 },
        { headers: {} },
      ),
    ).rejects.toBeInstanceOf(Issue416ResetUnavailableError);
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(addresses.resolve).not.toHaveBeenCalled();
  });
});

describe("Issue416 reset copy-link origin policy", () => {
  it("accepts canonical HTTPS fragment only, without query or token transport", () => {
    const token = generateStaffPasswordResetToken();
    process.env.STAFF_PASSWORD_RESET_PUBLIC_ORIGIN = "https://reset.example";
    expect(issue416PasswordResetLink(token)).toBe(
      `https://reset.example/staff/reset-password#reset=${token}`,
    );
  });

  it.each([
    "http://reset.example",
    "https://user:pass@reset.example",
    "https://reset.example/path",
    "https://reset.example?token=value",
    "https://reset.example#reset=value",
    "https://reset.example/attacker",
  ])("denies unsafe public origin %s before an issuance COMMIT", (origin) => {
    process.env.STAFF_PASSWORD_RESET_PUBLIC_ORIGIN = origin;
    expect(() =>
      issue416PasswordResetLink(generateStaffPasswordResetToken()),
    ).toThrow(Issue416ResetUnavailableError);
  });
});
