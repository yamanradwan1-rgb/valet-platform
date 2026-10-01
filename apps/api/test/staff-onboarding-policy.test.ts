import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { staffOnboardingCreateSchema } from "@valet/contracts";
import {
  generateStaffInvitationToken,
  staffInvitationHash,
  staffInvitationTokenPattern,
} from "../src/modules/management/staff-invitation-credential";
import {
  staffActivationLink,
  staffOnboardingCreateFingerprint,
  staffOnboardingResendFingerprint,
} from "../src/modules/management/staff-onboarding-policy";
import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import { formatOperationMeasurement } from "../src/common/observability/console-operation-observer";
afterEach(() => vi.unstubAllEnvs());
describe("onboarding credential/origin/fingerprint privacy", () => {
  it("uses independent 256-bit credentials and a separated one-way hash domain", () => {
    const token = generateStaffInvitationToken();
    expect(staffInvitationTokenPattern.test(token)).toBe(true);
    expect(Buffer.from(token.slice(5), "base64url").length).toBe(32);
    expect(generateStaffInvitationToken() === token).toBe(false);
    expect(
      staffInvitationHash(token).startsWith("staff-invite-sha256:v1:"),
    ).toBe(true);
    expect(staffInvitationHash(token).includes(token)).toBe(false);
  });
  it("uses only configured secure origins and fragments, rejects credential/path/query configuration", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const origin of [
      "http://localhost",
      "https://staff.test/path",
      "https://staff.test?q=1",
      "https://u:p@staff.test",
      "https://staff.test#unsafe",
      "invalid",
    ]) {
      vi.stubEnv("STAFF_ACTIVATION_PUBLIC_ORIGIN", origin);
      expect(() => staffActivationLink("redacted")).toThrow("not available");
    }
    vi.stubEnv("STAFF_ACTIVATION_PUBLIC_ORIGIN", "https://staff.test/");
    expect(staffActivationLink("redacted")).toBe(
      "https://staff.test/staff/activate#invite=redacted",
    );
  });
  it("canonical permutations share a digest; every material identity/role/location change conflicts", () => {
    const org = randomUUID(),
      a = randomUUID(),
      b = randomUUID();
    const raw = {
      operationId: randomUUID(),
      firstName: " First ",
      lastName: "Last",
      email: " STAFF@EXAMPLE.COM ",
      role: "VALET_EMPLOYEE",
      locationIds: [a, b],
    };
    const command = staffOnboardingCreateSchema.parse(raw);
    const digest = staffOnboardingCreateFingerprint(org, command);
    expect(
      staffOnboardingCreateFingerprint(
        org.toUpperCase(),
        staffOnboardingCreateSchema.parse({ ...raw, locationIds: [b, a] }),
      ),
    ).toBe(digest);
    for (const patch of [
      { firstName: "Changed" },
      { lastName: "Changed" },
      { email: "other@example.com" },
      { role: "VALET_SUPERVISOR" as const },
      { locationIds: [a] },
    ])
      expect(
        staffOnboardingCreateFingerprint(org, { ...command, ...patch }) ===
          digest,
      ).toBe(false);
    expect(staffOnboardingResendFingerprint(org, a) === digest).toBe(false);
  });
  it("operation measurements/log formatter and mapped errors never contain issuance secrets or database details", async () => {
    const measurements: object[] = [];
    const runner = new ApiOperationRunner(
      { now: () => 1 },
      {
        observe: (measurement) => {
          measurements.push(measurement);
        },
      },
    );
    const secret = generateStaffInvitationToken();
    const result = await runner.run(
      "STAFF_ONBOARDING_CREATE",
      { requestId: "t05c" } as never,
      async () => ({ activationLink: secret }),
    );
    expect(result.activationLink === secret).toBe(true);
    expect(JSON.stringify(measurements).includes(secret)).toBe(false);
    expect(
      formatOperationMeasurement(measurements[0] as never).includes(secret),
    ).toBe(false);
    try {
      await runner.run(
        "STAFF_ONBOARDING_RESEND",
        { requestId: "t05c" } as never,
        async () => {
          throw new Error(secret);
        },
      );
      throw new Error("Expected bounded API failure.");
    } catch (error) {
      const response = (error as { getResponse(): unknown }).getResponse();
      expect(JSON.stringify(response).includes(secret)).toBe(false);
    }
    expect(JSON.stringify(measurements).includes(secret)).toBe(false);
  });
});
