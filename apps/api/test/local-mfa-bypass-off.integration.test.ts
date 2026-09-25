import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

class LocalMfaBypassOffFixture extends ManagementControlPlaneTestFixture {
  private readonly originalBypass = process.env.VAYLET_LOCAL_DISABLE_MFA;

  override async start(): Promise<void> {
    process.env.VAYLET_LOCAL_DISABLE_MFA = "false";
    try {
      await super.start();
    } catch (error) {
      this.restoreLocalBypassEnvironment();
      throw error;
    }
  }

  override async stop(): Promise<void> {
    try {
      await super.stop();
    } finally {
      this.restoreLocalBypassEnvironment();
    }
  }

  private restoreLocalBypassEnvironment(): void {
    if (this.originalBypass === undefined) {
      delete process.env.VAYLET_LOCAL_DISABLE_MFA;
    } else {
      process.env.VAYLET_LOCAL_DISABLE_MFA = this.originalBypass;
    }
  }
}

const fixture = new LocalMfaBypassOffFixture();

beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

function brandingPath(organizationId: string) {
  return `/v1/staff/management/organizations/${organizationId}/branding`;
}

describe("local development MFA bypass disabled", () => {
  it("retains real enrollment, standard assurance, and sensitive assurance gates", async () => {
    const user = await fixture.createUser();
    const membership = await fixture.createMembership(user.id);
    const auth = await fixture.nativeLogin(user);
    expect((await fixture.factors(user.id)).rowCount).toBe(0);

    const state = await fixture.getMfa(
      "/v1/staff/auth/mfa/state",
      auth.accessToken,
    );
    expect(state.status).toBe(200);
    expect(state.body).toEqual({ state: "ENROLLMENT_REQUIRED" });

    const path = brandingPath(membership.organizationId);
    const read = await fixture.managementGet(path, auth.accessToken);
    expect(read.status).toBe(403);
    expect(read.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });

    const sensitive = await fixture.managementPut(
      `${path}/default`,
      auth.accessToken,
      {
        expectedUpdatedAt: "2026-09-25T00:00:00.000Z",
        setting: "brandPrimaryColor",
        value: "#010203",
      },
    );
    expect(sensitive.status).toBe(403);
    expect(sensitive.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
  });
});
