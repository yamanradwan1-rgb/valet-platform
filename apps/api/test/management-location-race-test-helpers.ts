import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as pause } from "node:timers/promises";

import { Client } from "pg";
import { expect } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import { createIntakeSessionCommandExecutor } from "../src/modules/valet-sessions/intake-session-command";

import type { ManagementAuditTestFixture } from "./management-audit-test-fixture";

export async function createActiveLocationRaceScenario(
  fixture: ManagementAuditTestFixture,
) {
  const adminUser = await fixture.createUser();
  const membership = await fixture.createMembership(adminUser.id);
  const auth = await fixture.nativeLogin(adminUser);
  await fixture.enrollAndAssure(auth);
  const admin = { auth, membership };
  const employee = await fixture.createUser();
  const employeeMembershipId = await fixture.addMembership(
    membership.organizationId,
    employee.id,
    "VALET_EMPLOYEE",
  );
  const create = await fixture.managementPost(
    `/v1/staff/management/organizations/${membership.organizationId}/locations`,
    auth.accessToken,
    {
      addressText: "Race address",
      code: `R-${randomUUID().slice(0, 8)}`,
      currency: "JOD",
      name: "Race location",
      operationId: randomUUID(),
      timezone: "Asia/Amman",
    },
  );
  expect(create.status).toBe(201);
  const locationId = String(create.body?.locationId);
  await fixture.grantLocationAccess(
    membership.organizationId,
    employeeMembershipId,
    locationId,
  );
  const base = `/v1/staff/management/organizations/${membership.organizationId}/locations/${locationId}`;
  const activate = await fixture.managementPost(
    `${base}/activate`,
    auth.accessToken,
    {
      expectedUpdatedAt: String(create.body?.updatedAt),
    },
  );
  expect(activate.status).toBe(201);
  return {
    admin,
    base,
    employee,
    employeeMembershipId,
    locationId,
    updatedAt: String(activate.body?.updatedAt),
  };
}

export async function createStoppedLocationRaceScenario(
  fixture: ManagementAuditTestFixture,
) {
  const current = await createActiveLocationRaceScenario(fixture);
  const stopped = await fixture.managementPost(
    `${current.base}/stop-intake`,
    current.admin.auth.accessToken,
    { expectedUpdatedAt: current.updatedAt },
  );
  expect(stopped.status).toBe(201);
  return { ...current, updatedAt: String(stopped.body?.updatedAt) };
}

export async function locationRaceBarrierClient(connectionString: string) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("BEGIN");
    return client;
  } catch (error) {
    await client.end();
    throw error;
  }
}

export async function waitForLocationRaceBlocked(
  fixture: ManagementAuditTestFixture,
  expected: number,
  barrier?: Client,
) {
  const blockerPid =
    barrier === undefined
      ? null
      : (await barrier.query<{ pid: number }>("SELECT pg_backend_pid() AS pid"))
          .rows[0]!.pid;
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    const result = await fixture.query<{ count: string }>(
      blockerPid === null
        ? `SELECT count(*)::text AS count FROM pg_stat_activity
           WHERE datname=current_database() AND pid<>pg_backend_pid()
             AND wait_event_type='Lock'`
        : `WITH RECURSIVE blocked(pid) AS (
             SELECT $1::integer
             UNION
             SELECT activity.pid FROM pg_stat_activity AS activity
             JOIN blocked AS parent
               ON parent.pid = ANY(pg_blocking_pids(activity.pid))
             WHERE activity.datname=current_database()
               AND activity.wait_event_type='Lock'
           )
           SELECT (count(*) - 1)::text AS count FROM blocked`,
      blockerPid === null ? [] : [blockerPid],
    );
    if (
      Number(result.rows[0]?.count ?? 0) >= expected &&
      performance.now() <= deadline
    )
      return;
    await pause(Math.min(20, Math.max(1, deadline - performance.now())));
  }
  throw new Error(
    "Timed out waiting for " +
      expected +
      " blocked transactions" +
      (blockerPid === null ? "." : " behind PID " + blockerPid + "."),
  );
}

export async function releaseLocationRaceBarrier(client: Client) {
  try {
    await client.query("COMMIT");
  } finally {
    await client.end();
  }
}

export function createLocationRaceIntake(
  runtimePool: PostgresPool,
  input: { employeeUserId: string; locationId: string },
) {
  return createIntakeSessionCommandExecutor(runtimePool)({
    authenticatedUserId: input.employeeUserId,
    intakeOperationId: `race:${randomUUID()}`,
    targetLocationId: input.locationId,
    vehicleIdentity: {
      mode: "TEMPORARY_DESCRIPTOR",
      temporaryDescriptor: `Race ${randomUUID()}`,
    },
  });
}
