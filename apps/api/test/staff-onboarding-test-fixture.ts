import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as pause } from "node:timers/promises";
import { Client } from "pg";
import { expect } from "vitest";
import {
  staffOnboardingResultSchema,
  type StaffOnboardingCreate,
} from "@valet/contracts";
import {
  ManagementControlPlaneTestFixture,
  type ManagementTestRole,
} from "./management-control-plane-test-fixture";
import type { AuthHttpResult } from "./staff-auth-native-fixture";
import { waitForPostgresBlockingEdge } from "./postgres-lock-observer";

export function staffPath(org: string, member?: string) {
  return `/v1/staff/management/organizations/${org}/staff${member === undefined ? "" : `/${member}`}`;
}

export class StaffOnboardingTestFixture extends ManagementControlPlaneTestFixture {
  private readonly originalOrigin = process.env.STAFF_ACTIVATION_PUBLIC_ORIGIN;
  override async start() {
    process.env.STAFF_ACTIVATION_PUBLIC_ORIGIN =
      "https://onboarding.example.test";
    await super.start();
  }
  override async stop() {
    try {
      await super.stop();
    } finally {
      if (this.originalOrigin === undefined)
        delete process.env.STAFF_ACTIVATION_PUBLIC_ORIGIN;
      else process.env.STAFF_ACTIVATION_PUBLIC_ORIGIN = this.originalOrigin;
    }
  }
  async actor(role: ManagementTestRole = "ORG_ADMIN", assured = true) {
    const user = await this.createUser();
    const member = await this.createMembership(user.id, { role });
    const location = await this.addLocation(member.organizationId);
    await this.grant(
      member.organizationId,
      member.membershipId,
      location.locationId,
    );
    const auth = await this.nativeLogin(user);
    if (assured) await this.enrollAndAssure(auth);
    return { user, ...member, locationId: location.locationId, auth };
  }
  async grant(org: string, member: string, location: string) {
    await this.query(
      "INSERT INTO membership_location_access(organization_id,membership_id,location_id) VALUES($1,$2,$3)",
      [org, member, location],
    );
  }
  command(
    locationId: string,
    extra: Partial<StaffOnboardingCreate> = {},
  ): StaffOnboardingCreate {
    return {
      operationId: randomUUID(),
      email: `${randomUUID()}@example.com`,
      firstName: "  أحمد  ",
      lastName: "  Smith  ",
      role: "VALET_EMPLOYEE",
      locationIds: [locationId],
      ...extra,
    };
  }
  create(
    actor: Awaited<ReturnType<StaffOnboardingTestFixture["actor"]>>,
    command = this.command(actor.locationId),
  ) {
    return this.managementPost(
      staffPath(actor.organizationId),
      actor.auth.accessToken,
      command,
    );
  }
  resend(
    actor: Awaited<ReturnType<StaffOnboardingTestFixture["actor"]>>,
    member: string,
    operationId = randomUUID(),
  ) {
    return this.managementPost(
      `${staffPath(actor.organizationId, member)}/invitations`,
      actor.auth.accessToken,
      { operationId },
    );
  }
  async barrier(org: string) {
    const client = new Client({
      connectionString: this.migrationDatabaseUrl(),
    });
    await client.connect();
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('staff-management-org:' || $1::text,0))",
      [org],
    );
    return client;
  }
  async emailBarrier(email: string) {
    const client = new Client({
      connectionString: this.migrationDatabaseUrl(),
    });
    await client.connect();
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('staff-onboarding-email:' || $1::text,0))",
      [email.toLowerCase()],
    );
    return client;
  }
  async memberEmailBarrier(member: string) {
    const result = await this.query<{ email: string }>(
      `SELECT account.email FROM organization_memberships AS membership
       JOIN users AS account ON account.id=membership.user_id WHERE membership.id=$1`,
      [member],
    );
    if (result.rowCount !== 1 || result.rows[0] === undefined)
      throw new Error("Missing activation fixture account.");
    return this.emailBarrier(result.rows[0].email);
  }
  async waitBehind(
    blocker: Client,
    expectedWaiters: number,
    firstWaiterPid?: number,
  ) {
    const result = await blocker.query<{ readonly pid: number }>(
      "SELECT pg_backend_pid() AS pid",
    );
    const blockerPid = result.rows[0]?.pid;
    if (blockerPid === undefined) throw new Error("Race blocker PID is missing.");
    if (firstWaiterPid !== undefined) {
      // The second backend may queue directly behind the barrier (hard block),
      // or behind the first waiter (soft queue edge). Prove either real edge
      // while the first backend remains blocked behind the original barrier.
      const deadline = performance.now() + 10_000;
      while (performance.now() < deadline) {
        const observed = await this.databasePool().query<{
          pid: number;
          blockers: number[];
        }>(
          `SELECT activity.pid, pg_blocking_pids(activity.pid) AS blockers
           FROM pg_stat_activity AS activity
           WHERE activity.datname = current_database()
             AND activity.pid <> pg_backend_pid()`,
        );
        const first = observed.rows.find((row) => row.pid === firstWaiterPid);
        if (first?.blockers.includes(blockerPid)) {
          const second = observed.rows.find(
            (row) =>
              row.pid !== blockerPid &&
              row.pid !== firstWaiterPid &&
              (row.blockers.includes(blockerPid) ||
                row.blockers.includes(firstWaiterPid)),
          );
          if (second !== undefined) return second.pid;
        }
        await pause(20);
      }
      throw new Error("Onboarding second waiter lacks a real causal queue edge.");
    }
    const waiters = await waitForPostgresBlockingEdge(this.databasePool(), {
      blockerPid,
      expectedWaiters,
    });
    return waiters[0]!;
  }
  async waitBlocked(count: number) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const result = await this.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock'",
      );
      if (Number(result.rows[0]?.count) >= count) return;
    }
    throw new Error("Onboarding barrier did not observe waiting transactions.");
  }
}
export function issued(response: AuthHttpResult) {
  expect(response.status).toBe(201);
  // Parsing failures must not print a secret-bearing body.
  const parsed = staffOnboardingResultSchema.safeParse(response.body);
  expect(parsed.success).toBe(true);
  if (!parsed.success || parsed.data.outcome !== "INVITE_ISSUED")
    throw new Error("Expected fresh invitation.");
  return parsed.data;
}
export function hidden(response: AuthHttpResult) {
  expect(response.status).toBe(404);
  expect(response.body?.code).toBe("AUTHORIZATION_DENIED");
}
