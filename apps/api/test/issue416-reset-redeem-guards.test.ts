import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { generateStaffPasswordResetToken } from "../src/modules/auth/staff-password-reset-credential";
import { Issue416PasswordResetIngress } from "../src/modules/auth/issue416-password-reset-redeem-ingress";
import { Issue416PasswordResetRedeemService } from "../src/modules/auth/issue416-password-reset-redeem.service";
import { Issue416R03PrivateAttemptAdmission } from "../src/modules/auth/issue416-r03-private-attempt-admission";
import {
  ISSUE416_R03_COUNTED_POLICY,
  issue416CanonicalR03Credential,
} from "../src/modules/auth/issue416-r03-private-attempt-contract";

const token = generateStaffPasswordResetToken();
const body = { resetToken: token, newPassword: "Strong-Password-2026!" };
const expectedFailure = { code: "STAFF_PASSWORD_RESET_UNAVAILABLE" };

function setup() {
  const r03 = new Issue416R03PrivateAttemptAdmission();
  const ingress = new Issue416PasswordResetIngress(r03);
  const service = new Issue416PasswordResetRedeemService(
    ingress,
    { allows: (origin: string) => origin === "https://reset.example" } as never,
    r03,
    { redeem: vi.fn() } as never,
  );
  return { r03, ingress, service };
}

describe("R03 counted-only private ledger source contract (NOT SQL proof)", () => {
  it("fixes DB-owned 30 IP, 5 canonical verifier and 15 minute ceilings", () => {
    expect(ISSUE416_R03_COUNTED_POLICY).toEqual({
      client: {
        scope: "v1:staff-password-reset-redeem-client-address",
        limit: 30,
      },
      credential: {
        scope: "v1:staff-password-reset-redeem-credential",
        limit: 5,
      },
      windowMinutes: 15,
    });
  });

  it("selects canonical credential budget even when password/body fields are invalid", () => {
    expect(issue416CanonicalR03Credential(body)).toBe(token);
    expect(
      issue416CanonicalR03Credential({ resetToken: token, newPassword: "" }),
    ).toBe(token);
    expect(
      issue416CanonicalR03Credential({ resetToken: token, unexpected: true }),
    ).toBe(token);
    expect(
      issue416CanonicalR03Credential({ resetToken: token, newPassword: null }),
    ).toBe(token);
  });

  it("never treats malformed, missing or noncanonical credential as a verifier", () => {
    for (const invalid of [
      null,
      [],
      "not an object",
      {},
      { resetToken: 4 },
      { resetToken: "vspr1.invalid" },
      { resetToken: token + "!" },
    ]) {
      expect(issue416CanonicalR03Credential(invalid)).toBeNull();
    }
  });

  it("rejects all CLIENT pre-parser attempts without an attested binder", async () => {
    const { ingress, r03 } = setup();
    const attempted = vi.spyOn(r03, "countClientBeforeBodyParser");
    const request = { headers: {}, socket: { remoteAddress: "198.51.100.8" } };
    await expect(ingress.countBeforeBodyParser(request)).rejects.toMatchObject(
      expectedFailure,
    );
    expect(attempted).toHaveBeenCalledTimes(1);
    expect(() => ingress.takeCountedClientAttempt(request)).toThrow(
      "Service temporarily unavailable.",
    );
  });

  it("does not retry unknown CLIENT COMMIT on the same request", async () => {
    const { ingress, r03 } = setup();
    const attempted = vi
      .spyOn(r03, "countClientBeforeBodyParser")
      .mockRejectedValueOnce(new Error("SQL response lost after COMMIT"));
    const request = { headers: {} };
    await expect(ingress.countBeforeBodyParser(request)).rejects.toMatchObject(
      expectedFailure,
    );
    await expect(ingress.countBeforeBodyParser(request)).rejects.toMatchObject(
      expectedFailure,
    );
    expect(attempted).toHaveBeenCalledTimes(1);
    expect(() => ingress.takeCountedClientAttempt(request)).toThrow();
  });

  it("rejects fake CLIENT receipts, copied hashes and forged credential admission", async () => {
    const { r03 } = setup();
    const fake = {
      audience: "staging:api",
      requestId: randomUUID(),
      clientAttemptId: randomUUID(),
      trustedClientAddressAppOnly: "198.51.100.7",
    };
    await expect(
      r03.countCanonicalCredential(fake, token),
    ).rejects.toMatchObject(expectedFailure);
    await expect(
      r03.countClientBeforeBodyParser({ headers: {} }),
    ).rejects.toMatchObject(expectedFailure);
  });

  it("rejects redeem without committed CLIENT stage before any verifier or business call", async () => {
    const { service } = setup();
    await expect(
      service.redeem(
        { headers: {} },
        "https://reset.example",
        "application/json",
        {},
        body,
      ),
    ).rejects.toMatchObject(expectedFailure);
  });

  it("contains no shared AntiAbuseService.count fallback or public table usage", () => {
    const root = resolve(process.cwd(), "src/modules/auth");
    for (const file of [
      "issue416-password-reset-redeem-ingress.ts",
      "issue416-password-reset-redeem.service.ts",
      "issue416-r03-private-attempt-admission.ts",
    ]) {
      const source = readFileSync(resolve(root, file), "utf8");
      expect(source).not.toMatch(
        /antiAbuse\.count|AntiAbuseService|anti_abuse_events\s*(?:\(|AS)/,
      );
    }
  });
});
