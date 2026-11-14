import { describe, expect, it, vi } from "vitest";
import { generateStaffPasswordResetToken } from "../src/modules/auth/staff-password-reset-credential";
import { Issue416PasswordResetIngress } from "../src/modules/auth/issue416-password-reset-redeem-ingress";
import { Issue416PasswordResetRedeemService } from "../src/modules/auth/issue416-password-reset-redeem.service";

function setup() {
  const antiAbuse = {
    key: vi.fn((scope: string, value: string) => ({ scope, keyHash: value })),
    count: vi.fn().mockResolvedValue({ allowed: true }),
  };
  const addresses = { resolve: vi.fn().mockReturnValue("198.51.100.6") };
  const ingress = new Issue416PasswordResetIngress(
    antiAbuse as never,
    addresses as never,
  );
  const origins = {
    allows: (origin: string) => origin === "https://reset.example",
  };
  return { antiAbuse, ingress, addresses, origins };
}

const token = generateStaffPasswordResetToken();
const validBody = { resetToken: token, newPassword: "Strong-Password-2026!" };

describe("Issue416 pre-parser public address budget", () => {
  it("durably counts an attempt before a malformed body is parsed", async () => {
    const { antiAbuse, ingress } = setup();
    const request = { headers: {} };
    await ingress.countBeforeBodyParser(request);
    expect(antiAbuse.key).toHaveBeenCalledWith(
      "v1:staff-password-reset-redeem-client-address",
      "198.51.100.6",
    );
    expect(antiAbuse.count).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "v1:staff-password-reset-redeem-client-address",
      }),
      30,
    );
    expect(ingress.takeCountedAddress(request)).toBe("198.51.100.6");
    expect(() => ingress.takeCountedAddress(request)).toThrow(
      "Service temporarily unavailable.",
    );
  });

  it("refuses denied quota, duplicate counting and an unavailable trusted address", async () => {
    const { antiAbuse, ingress, addresses } = setup();
    const request = { headers: {} };
    antiAbuse.count.mockResolvedValueOnce({ allowed: false, retryAfter: 128 });
    await expect(ingress.countBeforeBodyParser(request)).rejects.toMatchObject({
      code: "STAFF_PASSWORD_RESET_RATE_LIMITED",
      retryAfter: 128,
    });
    await ingress.countBeforeBodyParser(request);
    await expect(ingress.countBeforeBodyParser(request)).rejects.toMatchObject({
      code: "STAFF_PASSWORD_RESET_UNAVAILABLE",
    });
    expect(antiAbuse.count).toHaveBeenCalledTimes(2);
    ingress.takeCountedAddress(request);
    addresses.resolve.mockImplementationOnce(() => {
      throw new Error("not trusted");
    });
    await expect(
      ingress.countBeforeBodyParser({ headers: {} }),
    ).rejects.toMatchObject({ code: "STAFF_PASSWORD_RESET_UNAVAILABLE" });
  });
});

describe("Issue416 anonymous redeem guard", () => {
  it("rejects any attempt without a committed pre-parser ingress budget", async () => {
    const { antiAbuse, ingress, origins } = setup();
    const service = new Issue416PasswordResetRedeemService(
      ingress,
      origins as never,
      antiAbuse as never,
    );
    await expect(
      service.redeem(
        { headers: {} },
        "https://reset.example",
        "application/json",
        {},
        validBody,
      ),
    ).rejects.toMatchObject({ code: "STAFF_PASSWORD_RESET_UNAVAILABLE" });
    expect(antiAbuse.count).not.toHaveBeenCalled();
  });

  it("counts canonical credentials even when the new password is malformed", async () => {
    const { antiAbuse, ingress, origins } = setup();
    const service = new Issue416PasswordResetRedeemService(
      ingress,
      origins as never,
      antiAbuse as never,
    );
    const request = { headers: {} };
    await ingress.countBeforeBodyParser(request);
    await expect(
      service.redeem(
        request,
        "https://reset.example",
        "application/json",
        {},
        { resetToken: token, newPassword: "" },
      ),
    ).rejects.toThrow();
    expect(antiAbuse.key).toHaveBeenCalledWith(
      "v1:staff-password-reset-redeem-credential",
      token,
    );
    expect(antiAbuse.count).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "v1:staff-password-reset-redeem-credential",
      }),
      5,
    );
  });

  it("returns the same generic invalid-link response for malformed bearer syntax", async () => {
    const { antiAbuse, ingress, origins } = setup();
    const service = new Issue416PasswordResetRedeemService(
      ingress,
      origins as never,
      antiAbuse as never,
    );
    const request = { headers: {} };
    await ingress.countBeforeBodyParser(request);
    await expect(
      service.redeem(
        request,
        "https://reset.example",
        "application/json",
        {},
        { resetToken: "vspr1.invalid", newPassword: "New-Password-2026!" },
      ),
    ).rejects.toMatchObject({ code: "STAFF_PASSWORD_RESET_INVALID" });
    expect(antiAbuse.count).toHaveBeenCalledTimes(1);
  });

  it("does not issue a reset without an independently admitted SQL writer", async () => {
    const { antiAbuse, ingress, origins } = setup();
    const service = new Issue416PasswordResetRedeemService(
      ingress,
      origins as never,
      antiAbuse as never,
    );
    const request = { headers: {} };
    await ingress.countBeforeBodyParser(request);
    await expect(
      service.redeem(
        request,
        "https://reset.example",
        "application/json",
        {},
        validBody,
      ),
    ).rejects.toMatchObject({ code: "STAFF_PASSWORD_RESET_UNAVAILABLE" });
    // Both public address and canonical bearer attempts have already been
    // committed independently of a failed or unavailable business mutation.
    expect(antiAbuse.count).toHaveBeenCalledTimes(2);
  });
});
