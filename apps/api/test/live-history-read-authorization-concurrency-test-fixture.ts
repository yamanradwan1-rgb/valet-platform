import { Pool, type PoolClient } from "pg";
import { expect } from "vitest";

import { staffCredentialHash } from "../src/modules/auth/staff-auth-credential";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { authorizeLiveHistoryLocation } from "../src/modules/dashboard/live-history-read-authorization";
import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const expectedDataDirectory =
  "D:/kndoom/valet-platform/tmp/issue-276-disposable-pg-0d8a6d3a254e/data";
const forbiddenSiblingDatabase = "valet276_dec103_w2_40c1a097d8";

function isolatedParentUrl(): string {
  const testUrl = process.env.TEST_DATABASE_URL;
  const migrationUrl = process.env.MIGRATION_DATABASE_URL;
  if (testUrl === undefined || migrationUrl === undefined) {
    throw new Error(
      "Issue #276 concurrency test requires explicit TEST_DATABASE_URL and MIGRATION_DATABASE_URL.",
    );
  }
  if (testUrl !== migrationUrl) {
    throw new Error(
      "Issue #276 concurrency test requires identical explicit admin URLs.",
    );
  }
  const parsed = new URL(testUrl);
  if (
    parsed.hostname !== "127.0.0.1" ||
    parsed.port !== "55449" ||
    parsed.username !== "valet276test" ||
    parsed.pathname !== "/postgres"
  ) {
    throw new Error(
      "Issue #276 concurrency test refuses any PostgreSQL target except the owned 55449 parent.",
    );
  }
  return testUrl;
}

export interface AuthorityScenario {
  readonly context: StaffSessionContext;
  readonly factorId?: string;
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly sessionId: string;
  readonly userId: string;
}

export type Revoker = (
  client: PoolClient,
  current: AuthorityScenario,
) => Promise<void>;

export class LiveHistoryAuthorizationRaceFixture {
  private readonly base = new ManagementControlPlaneTestFixture();
  private readonly parentDatabaseUrl = isolatedParentUrl();

  async start(): Promise<void> {
    const parent = new Pool({ connectionString: this.parentDatabaseUrl });
    try {
      const identity = await parent.query(
        `SELECT current_database() AS database, current_user AS username,
                inet_server_addr()::text AS address, inet_server_port() AS port,
                current_setting('data_directory') AS data_directory`,
      );
      expect(identity.rows[0]).toMatchObject({
        address: "127.0.0.1/32",
        database: "postgres",
        port: 55449,
        username: "valet276test",
      });
      this.expectOwnedDataDirectory(identity.rows[0]?.data_directory);
    } finally {
      await parent.end();
    }
    await this.base.start();
    const child = await this.base.query(
      `SELECT current_database() AS database, current_user AS username,
              inet_server_port() AS port,
              current_setting('data_directory') AS data_directory`,
    );
    const childRow = child.rows[0] as Record<string, unknown>;
    expect(childRow.database).not.toBe("postgres");
    expect(childRow.database).not.toBe(forbiddenSiblingDatabase);
    expect(childRow).toMatchObject({
      port: 55449,
      username: "valet276test",
    });
    this.expectOwnedDataDirectory(childRow.data_directory);
  }

  stop(): Promise<void> {
    return this.base.stop();
  }

  async locationManagerScenario(): Promise<AuthorityScenario> {
    const user = await this.base.createUser();
    const membership = await this.base.createMembership(user.id, {
      role: "LOCATION_MANAGER",
    });
    const location = await this.base.addLocation(membership.organizationId);
    await this.base.query(
      `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
       VALUES($1,$2,$3)`,
      [membership.organizationId, membership.membershipId, location.locationId],
    );
    const auth = await this.base.nativeLogin(user);
    return {
      context: await this.contextFor(user.id, auth),
      locationId: location.locationId,
      membershipId: membership.membershipId,
      organizationId: membership.organizationId,
      sessionId: auth.sessionId,
      userId: user.id,
    };
  }

  async companyAdminScenario(): Promise<
    AuthorityScenario & { factorId: string }
  > {
    const user = await this.base.createUser();
    const membership = await this.base.createMembership(user.id);
    const location = await this.base.addLocation(membership.organizationId);
    const auth = await this.base.nativeLogin(user);
    const factor = await this.base.enrollAndAssure(auth);
    return {
      context: await this.contextFor(user.id, auth),
      factorId: factor.factorId,
      locationId: location.locationId,
      membershipId: membership.membershipId,
      organizationId: membership.organizationId,
      sessionId: auth.sessionId,
      userId: user.id,
    };
  }

  freshAuthorization(current: AuthorityScenario) {
    return this.withReader((client) => this.authorize(client, current));
  }

  async readFirstThenRevoke(
    current: AuthorityScenario,
    revoke: Revoker,
  ): Promise<void> {
    const reader = await this.base.databasePool().connect();
    const revoker = await this.base.databasePool().connect();
    try {
      await reader.query("BEGIN");
      await expect(this.authorize(reader, current)).resolves.toEqual({
        locationId: current.locationId,
        membershipId: current.membershipId,
        organizationId: current.organizationId,
      });
      await revoker.query("BEGIN");
      const pid = await this.backendPid(revoker);
      const pending = revoke(revoker, current);
      await this.waitForLock(pid);
      await reader.query("COMMIT");
      await pending;
      await revoker.query("COMMIT");
    } finally {
      await reader.query("ROLLBACK").catch(() => undefined);
      await revoker.query("ROLLBACK").catch(() => undefined);
      reader.release();
      revoker.release();
    }
  }

  async revokerFirstThenRead(current: AuthorityScenario, revoke: Revoker) {
    const reader = await this.base.databasePool().connect();
    const revoker = await this.base.databasePool().connect();
    try {
      await revoker.query("BEGIN");
      await revoke(revoker, current);
      await reader.query("BEGIN");
      const pid = await this.backendPid(reader);
      const pending = this.authorize(reader, current);
      await this.waitForLock(pid);
      await revoker.query("COMMIT");
      return await pending;
    } finally {
      await reader.query("ROLLBACK").catch(() => undefined);
      await revoker.query("ROLLBACK").catch(() => undefined);
      reader.release();
      revoker.release();
    }
  }

  readonly revokeSession: Revoker = async (client, current) => {
    await client.query(
      "UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1",
      [current.sessionId],
    );
  };

  readonly revokeGrant: Revoker = async (client, current) => {
    await this.lockOrganization(client, current.organizationId);
    await client.query(
      "DELETE FROM membership_location_access WHERE membership_id=$1 AND location_id=$2",
      [current.membershipId, current.locationId],
    );
  };

  readonly revokeEntitlement: Revoker = async (client, current) => {
    await this.lockOrganization(client, current.organizationId);
    await client.query(
      "UPDATE organization_subscriptions SET dashboard_access_enabled=FALSE WHERE organization_id=$1",
      [current.organizationId],
    );
  };

  readonly retireMfa: Revoker = async (client, current) => {
    if (current.factorId === undefined)
      throw new Error("CA MFA factor missing.");
    await client.query(
      "SELECT id FROM staff_auth_sessions WHERE id=$1 FOR UPDATE",
      [current.sessionId],
    );
    await client.query(
      `UPDATE user_mfa_totp_factors
       SET state='RETIRED', retired_at=clock_timestamp()
       WHERE id=$1`,
      [current.factorId],
    );
  };

  private authorize(client: PoolClient, current: AuthorityScenario) {
    return authorizeLiveHistoryLocation(client, {
      authenticatedUserId: current.userId,
      staffSessionContext: current.context,
      targetLocationId: current.locationId,
    });
  }

  private async contextFor(
    userId: string,
    auth: { readonly accessToken: string; readonly sessionId: string },
  ): Promise<StaffSessionContext> {
    const session = await this.base.query<{ created_at: Date }>(
      "SELECT created_at FROM staff_auth_sessions WHERE id=$1",
      [auth.sessionId],
    );
    return {
      accessTokenHash: staffCredentialHash("access", auth.accessToken),
      createdAt: session.rows[0]!.created_at,
      staffAuthSessionId: auth.sessionId,
      userId,
    };
  }

  private async withReader<T>(
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.base.databasePool().connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  }

  private async backendPid(client: PoolClient): Promise<number> {
    return Number(
      (await client.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid,
    );
  }

  private async waitForLock(pid: number): Promise<void> {
    await expect
      .poll(
        async () =>
          (
            await this.base.query<{ wait_event_type: string | null }>(
              "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",
              [pid],
            )
          ).rows[0]?.wait_event_type,
        { interval: 25, timeout: 10_000 },
      )
      .toBe("Lock");
  }

  private async lockOrganization(client: PoolClient, organizationId: string) {
    await client.query(
      `SELECT pg_advisory_xact_lock(
         hashtextextended('staff-management-org:' || $1::text, 0)
       )`,
      [organizationId],
    );
  }

  private expectOwnedDataDirectory(value: unknown): void {
    expect(String(value).replaceAll("\\", "/")).toBe(expectedDataDirectory);
  }
}
