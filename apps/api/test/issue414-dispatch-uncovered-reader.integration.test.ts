import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAssignTaskCommandExecutor } from "../src/modules/dispatch/assign-task-command";
import { createDeclineTaskCommandExecutor } from "../src/modules/dispatch/decline-task-command";
import {
  readCurrentUncoveredTaskAlertById,
  readCurrentUncoveredTaskAlertEpisode,
  readCurrentUncoveredTaskAlerts,
  type AuthorizedUncoveredTaskAlertScope,
  type UncoveredTaskAlert,
} from "../src/modules/dispatch/uncovered-task-alert-query";
import { DispatchTestContext } from "./dispatch-test-context";

const context = new DispatchTestContext("issue414_uncovered");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

function read(
  scope: AuthorizedUncoveredTaskAlertScope,
): Promise<UncoveredTaskAlert[]>;
function read(
  scope: AuthorizedUncoveredTaskAlertScope,
  taskId: string,
): Promise<UncoveredTaskAlert | null>;
function read(
  scope: AuthorizedUncoveredTaskAlertScope,
  taskId: string,
  episodeId: string,
): Promise<UncoveredTaskAlert | null>;
async function read(
  scope: AuthorizedUncoveredTaskAlertScope,
  taskId?: string,
  episodeId?: string,
) {
  const connection: PoolClient = await context.runtimePool.connect();
  try {
    await connection.query("BEGIN READ ONLY");
    const result =
      taskId === undefined
        ? await readCurrentUncoveredTaskAlerts(connection, scope)
        : episodeId !== undefined
          ? await readCurrentUncoveredTaskAlertEpisode(
              connection,
              scope,
              taskId,
              episodeId,
            )
          : await readCurrentUncoveredTaskAlertById(connection, scope, taskId);
    await connection.query("COMMIT");
    return result;
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}

async function viewerScope(
  fixture: Awaited<ReturnType<DispatchTestContext["createDispatchFixture"]>>,
  role: "ORG_ADMIN" | "LOCATION_MANAGER" = "LOCATION_MANAGER",
  overrides: Partial<AuthorizedUncoveredTaskAlertScope> = {},
): Promise<AuthorizedUncoveredTaskAlertScope> {
  const viewer = await context.addMember(fixture, role, false);
  return {
    organizationId: fixture.organizationId,
    locationId: fixture.locationId,
    viewerUserId: viewer.userId,
    viewerMembershipId: viewer.membershipId,
    limit: 21,
    initialQueueDelaySeconds: 0,
    postDeclineDelaySeconds: 0,
    postLockClockCutover: new Date(0),
    ...overrides,
  };
}

describe("Issue #414 P1 ALT-02/03 strictly current Task episode reader", () => {
  it("emits only initial queued v1 with exact safe Task projection", async () => {
    const fixture = await context.createDispatchFixture();
    const scope = await viewerScope(fixture);
    const queued = await context.queue(fixture);
    expect(await read(scope)).toEqual([
      {
        category: "ALT-02",
        severity: "IMPORTANT",
        sourceKind: "TASK",
        sourceId: queued.taskId,
        episodeId: `${queued.taskId}:1`,
        organizationId: fixture.organizationId,
        locationId: fixture.locationId,
        occurredAt: expect.any(String),
        title: "Unassigned parking task",
      },
    ]);
    expect(await read(scope, queued.taskId)).toMatchObject({
      category: "ALT-02",
      sourceId: queued.taskId,
    });
    expect(await read(scope, randomUUID())).toBeNull();
    expect(await read(scope, "invalid-uuid")).toBeNull();
  });

  it("folds original and latest decline, then retires on assignment", async () => {
    const fixture = await context.createDispatchFixture();
    const scope = await viewerScope(fixture, "ORG_ADMIN");
    const queued = await context.queue(fixture);
    const assign = createAssignTaskCommandExecutor(context.runtimePool);
    const decline = createDeclineTaskCommandExecutor(context.runtimePool);
    const assigned = await assign({
      authenticatedUserId: fixture.userId,
      expectedVersion: queued.version,
      taskId: queued.taskId,
    });
    expect(await read(scope, queued.taskId)).toBeNull();
    const declined = await decline({
      authenticatedUserId: fixture.userId,
      expectedVersion: assigned.version,
      taskId: queued.taskId,
    });
    expect(await read(scope)).toEqual([
      expect.objectContaining({
        category: "ALT-03",
        sourceId: queued.taskId,
        episodeId: `${queued.taskId}:${declined.version}`,
      }),
    ]);
    expect(await read(scope, queued.taskId, `${queued.taskId}:1`)).toBeNull();
    expect(
      await read(scope, queued.taskId, `${queued.taskId}:3`),
    ).toMatchObject({
      episodeId: `${queued.taskId}:${declined.version}`,
    });
    const assignedAgain = await assign({
      authenticatedUserId: fixture.userId,
      expectedVersion: declined.version,
      taskId: queued.taskId,
    });
    expect(await read(scope, queued.taskId)).toBeNull();
    const declinedAgain = await decline({
      authenticatedUserId: fixture.userId,
      expectedVersion: assignedAgain.version,
      taskId: queued.taskId,
    });
    const cases = await read(scope);
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({
      category: "ALT-03",
      episodeId: `${queued.taskId}:${declinedAgain.version}`,
    });
  });

  it("fails closed on invalid cutover and excludes cutoff equality for both queue reasons", async () => {
    const fixture = await context.createDispatchFixture();
    const scope = await viewerScope(fixture);
    const queued = await context.queue(fixture);
    const initial = await read(scope, queued.taskId);
    expect(initial?.category).toBe("ALT-02");
    const initialAt = new Date(initial!.occurredAt);
    expect(
      await read({ ...scope, postLockClockCutover: initialAt }, queued.taskId),
    ).toBeNull();
    expect(
      await read(
        {
          ...scope,
          postLockClockCutover: new Date(initialAt.getTime() - 1),
        },
        queued.taskId,
      ),
    ).not.toBeNull();
    await expect(
      read(
        {
          ...scope,
          postLockClockCutover: undefined as unknown as Date,
        },
        queued.taskId,
      ),
    ).rejects.toThrow("Invalid bounded Dispatch alert query parameters.");

    const assigned = await createAssignTaskCommandExecutor(context.runtimePool)(
      {
        authenticatedUserId: fixture.userId,
        expectedVersion: queued.version,
        taskId: queued.taskId,
      },
    );
    await createDeclineTaskCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedVersion: assigned.version,
      taskId: queued.taskId,
    });
    const latest = await read(scope, queued.taskId);
    expect(latest?.category).toBe("ALT-03");
    expect(
      await read(
        {
          ...scope,
          postLockClockCutover: new Date(latest!.occurredAt),
        },
        queued.taskId,
      ),
    ).toBeNull();
  });

  it("suppresses unproven legacy queue, duplicate per-version decline and missing dispatch", async () => {
    const fixture = await context.createDispatchFixture();
    const scope = await viewerScope(fixture);
    const legacySessionId = await context.addSession(fixture);
    const legacyTaskId = randomUUID();
    // A disposable legacy Task without source history must fail closed.
    await context.adminPool.query(
      `INSERT INTO tasks
         (id, organization_id, location_id, valet_session_id,
          task_type, status, version, updated_at)
       VALUES ($1,$2,$3,$4,'PARKING','QUEUED',1,clock_timestamp())`,
      [
        legacyTaskId,
        fixture.organizationId,
        fixture.locationId,
        legacySessionId,
      ],
    );
    expect(await read(scope, legacyTaskId)).toBeNull();

    const secondSessionId = await context.addSession(fixture);
    const second = await context.queue({
      ...fixture,
      sessionId: secondSessionId,
    });
    const assigned = await createAssignTaskCommandExecutor(context.runtimePool)(
      {
        authenticatedUserId: fixture.userId,
        expectedVersion: second.version,
        taskId: second.taskId,
      },
    );
    await createDeclineTaskCommandExecutor(context.runtimePool)({
      authenticatedUserId: fixture.userId,
      expectedVersion: assigned.version,
      taskId: second.taskId,
    });
    expect(await read(scope, second.taskId)).not.toBeNull();
    await context.adminPool.query(
      `INSERT INTO audit_events
         (id, organization_id, location_id, valet_session_id,
          actor_membership_id, event_type, entity_type, entity_id,
          metadata_json, occurred_at)
       SELECT $1, organization_id, location_id, valet_session_id,
              actor_membership_id, event_type, entity_type, entity_id,
              metadata_json, occurred_at
       FROM audit_events
       WHERE entity_type='Task' AND entity_id=$2
         AND event_type='TASK_DECLINED'`,
      [randomUUID(), second.taskId],
    );
    expect(await read(scope, second.taskId)).toBeNull();
  });
});
