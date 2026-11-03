import { expect } from "vitest";

import { staffCredentialHash } from "../src/modules/auth/staff-auth-credential";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

export class ManagementAlertMfaFixture extends ManagementControlPlaneTestFixture {
  private readonly previousBypass = process.env.VAYLET_LOCAL_DISABLE_MFA;

  override async start(): Promise<void> {
    process.env.VAYLET_LOCAL_DISABLE_MFA = "false";
    try {
      await super.start();
      const version = await this.query<{ version: number }>(
        "SELECT current_setting('server_version_num')::integer AS version",
      );
      expect(version.rows[0]?.version).toBeGreaterThanOrEqual(170000);
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  override async stop(): Promise<void> {
    try {
      await super.stop();
    } finally {
      if (this.previousBypass === undefined)
        delete process.env.VAYLET_LOCAL_DISABLE_MFA;
      else process.env.VAYLET_LOCAL_DISABLE_MFA = this.previousBypass;
    }
  }

  async createAssuredAdmin() {
    const user = await this.createUser();
    const membership = await this.createMembership(user.id);
    const location = await this.addLocation(membership.organizationId);
    const auth = await this.nativeLogin(user);
    const factor = await this.enrollAndAssure(auth);
    return { auth, factor, location, membership, user };
  }

  async contextFor(
    accessToken: string,
    sessionId: string,
    userId: string,
  ): Promise<StaffSessionContext> {
    const session = await this.query<{ created_at: Date }>(
      "SELECT created_at FROM staff_auth_sessions WHERE id=$1",
      [sessionId],
    );
    return {
      accessTokenHash: staffCredentialHash("access", accessToken),
      createdAt: session.rows[0]!.created_at,
      staffAuthSessionId: sessionId,
      userId,
    };
  }

  async grantLocation(
    organizationId: string,
    membershipId: string,
    locationId: string,
  ): Promise<void> {
    await this.query(
      `INSERT INTO membership_location_access
         (organization_id, membership_id, location_id) VALUES ($1,$2,$3)`,
      [organizationId, membershipId, locationId],
    );
  }

  async createManager(organizationId: string) {
    const user = await this.createUser();
    const membershipId = await this.addMembership(
      organizationId,
      user.id,
      "LOCATION_MANAGER",
    );
    const auth = await this.nativeLogin(user);
    return { auth, membershipId, user };
  }
}
