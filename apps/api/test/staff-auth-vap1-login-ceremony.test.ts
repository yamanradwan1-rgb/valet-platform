import { describe, expect, it, vi } from "vitest";

import { verifySubmittedStaffLoginPassword } from "../src/modules/auth/staff-auth-vap1-login-ceremony";
import { STAFF_AUTH_DUMMY_PASSWORD_HASH } from "../src/modules/auth/staff-password-verification";

const active = {
  id: "00000000-0000-4000-8000-000000000001",
  password_hash: STAFF_AUTH_DUMMY_PASSWORD_HASH,
  status: "ACTIVE" as const,
};

describe("A01 raw password ceremony, not a VAP1 signer", () => {
  it("retains the exact PHC that was verified against the submitted password", async () => {
    const verify = vi.fn(
      async (hash: string, password: string) =>
        hash === active.password_hash && password === "actual-password",
    );
    await expect(
      verifySubmittedStaffLoginPassword({
        user: active,
        submittedPassword: "actual-password",
        verifier: { verify },
      }),
    ).resolves.toBe(active.password_hash);
    expect(verify).toHaveBeenCalledExactlyOnceWith(
      active.password_hash,
      "actual-password",
    );
  });

  it("rejects SQL-visible User ID and PHC used as surrogate credentials", async () => {
    const verify = vi.fn(
      async (_hash: string, password: string) => password === "actual-password",
    );
    for (const submittedPassword of [
      active.id,
      active.password_hash,
      "",
      "true",
    ]) {
      await expect(
        verifySubmittedStaffLoginPassword({
          user: active,
          submittedPassword,
          verifier: { verify },
        }),
      ).rejects.toMatchObject({ code: "STAFF_AUTHENTICATION_FAILED" });
    }
    expect(verify).toHaveBeenCalledTimes(4);
  });

  it("does not admit an ID-only, disabled or malformed PHC even if verifier reports true", async () => {
    const verify = vi.fn().mockResolvedValue(true);
    for (const user of [
      undefined,
      { ...active, password_hash: null },
      { ...active, password_hash: "legacy-placeholder" },
      { ...active, status: "DISABLED" as const },
    ]) {
      await expect(
        verifySubmittedStaffLoginPassword({
          user,
          submittedPassword: "candidate",
          verifier: { verify },
        }),
      ).rejects.toMatchObject({ code: "STAFF_AUTHENTICATION_FAILED" });
    }
    expect(verify).toHaveBeenCalledTimes(4);
    expect(
      verify.mock.calls
        .slice(0, 3)
        .every(([hash]) => hash === STAFF_AUTH_DUMMY_PASSWORD_HASH),
    ).toBe(true);
  });
});
