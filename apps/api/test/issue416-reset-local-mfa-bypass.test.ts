import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/modules/auth/mfa/local-mfa-bypass", () => ({
  localMfaBypassEnabled: vi.fn(() => true),
}));
vi.mock("../src/modules/management/management-authorization", () => ({
  authorizeCompanyAdminManagement: vi.fn(),
}));

import { authorizeCompanyAdminManagement } from "../src/modules/management/management-authorization";
import { preflightPasswordResetTarget } from "../src/modules/management/issue416-password-reset-authority";

describe("Issue416 reset cannot use the development MFA bypass", () => {
  it("rejects even an apparently valid admin before any authority SQL", async () => {
    const transaction = { query: vi.fn() };
    await expect(preflightPasswordResetTarget(
      transaction as never,
      {
        accessTokenHash: "synthetic",
        staffAuthSessionId: randomUUID(),
        userId: randomUUID(),
        createdAt: new Date(),
      },
      randomUUID(), randomUUID(),
    )).rejects.toMatchObject({ code: "STAFF_PASSWORD_RESET_UNAVAILABLE" });
    expect(authorizeCompanyAdminManagement).not.toHaveBeenCalled();
    expect(transaction.query).not.toHaveBeenCalled();
  });
});
