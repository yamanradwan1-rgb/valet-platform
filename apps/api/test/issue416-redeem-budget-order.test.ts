import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { generateStaffPasswordResetToken } from "../src/modules/auth/staff-password-reset-credential";
import { Issue416PasswordResetIngress } from "../src/modules/auth/issue416-password-reset-redeem-ingress";
import { Issue416PasswordResetRedeemService } from "../src/modules/auth/issue416-password-reset-redeem.service";
import { Issue416R03PrivateAttemptAdmission } from "../src/modules/auth/issue416-r03-private-attempt-admission";

const token = generateStaffPasswordResetToken();
const origin = "https://reset.example";

function setup() {
  const r03 = new Issue416R03PrivateAttemptAdmission();
  const counted = vi.spyOn(r03, "countClientBeforeBodyParser").mockImplementation(
    async () => ({
      audience: "reset:synthetic",
      requestId: randomUUID(),
      clientAttemptId: randomUUID(),
      trustedClientAddressAppOnly: "198.51.100.8",
    }),
  );
  const credentials = vi.spyOn(r03, "countCanonicalCredential")
    .mockResolvedValue();
  const ingress = new Issue416PasswordResetIngress(r03);
  const service = new Issue416PasswordResetRedeemService(
    ingress,
    { allows: (value: string) => value === origin } as never,
    r03,
  );
  return { counted, credentials, ingress, service };
}

describe("Issue416 R03 separate committed quota ordering", () => {
  it.each([
    ["foreign origin", "https://foreign.example", "application/json", {}],
    ["invalid content type", origin, "text/plain", {}],
    ["unexpected query", origin, "application/json", { suspicious: "1" }],
  ])("counts a canonical verifier before rejecting %s", async (
    _label, submittedOrigin, contentType, query,
  ) => {
    const { ingress, service, credentials } = setup();
    const request = { headers: {} };
    await ingress.countBeforeBodyParser(request);
    await expect(service.redeem(
      request, submittedOrigin as string, contentType as string,
      query, { resetToken: token, newPassword: "Safe-New-Password-2026!" },
    )).rejects.toBeDefined();
    expect(credentials).toHaveBeenCalledTimes(1);
    expect(credentials).toHaveBeenCalledWith(
      expect.objectContaining({ trustedClientAddressAppOnly: "198.51.100.8" }),
      token,
    );
  });

  it("counts malformed credentials only in the client-address stage", async () => {
    const { ingress, service, counted, credentials } = setup();
    const request = { headers: {} };
    await ingress.countBeforeBodyParser(request);
    await expect(service.redeem(
      request, origin, "application/json", {},
      { resetToken: "vspr1.noncanonical", newPassword: "Safe-New-Password-2026!" },
    )).rejects.toMatchObject({ code: "STAFF_PASSWORD_RESET_INVALID" });
    expect(counted).toHaveBeenCalledTimes(1);
    expect(credentials).not.toHaveBeenCalled();
  });
});
