import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";
import {
  createDispatchEvent,
  createTask,
  createTaskDispatchScope,
} from "./task-dispatch-fixture.js";

interface PgError extends Error {
  code?: string;
  constraint?: string;
}

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const databaseName = `valet_005d_${process.pid}_${Date.now()}`;
const migrationsPath = fileURLToPath(
  new URL("../prisma/migrations", import.meta.url),
);
let client: Client;

async function expectConstraint(
  operation: Promise<unknown>,
  constraint: string,
): Promise<void> {
  try {
    await operation;
    throw new Error("Expected PostgreSQL constraint failure.");
  } catch (error) {
    const pgError = error as PgError;
    expect(["23503", "23505", "23514"]).toContain(pgError.code);
    expect(pgError.constraint).toBe(constraint);
  }
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  client = new Client({ connectionString: url.toString() });
  await client.connect();
  for (const migration of expectedMigrationDirectories) {
    await client.query(
      await readFile(join(migrationsPath, migration, "migration.sql"), "utf8"),
    );
  }
}, 120_000);

afterAll(async () => {
  await client?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.end();
}, 60_000);

describe("DEC-034 Task and DispatchEvent persistence", () => {
  it("preserves Task/Dispatch enums through the current migration set", async () => {
    const directories = (await readdir(migrationsPath, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(directories).toEqual(expectedMigrationDirectories);
    expect(directories).toHaveLength(37);
    expect(directories.at(-1)).toBe("20260916003700_mgt_be_04_staff_roles_access");
    for (const [type, expected] of [
      ["task_type", ["PARKING", "RETRIEVAL"]],
      [
        "task_status",
        [
          "QUEUED",
          "ASSIGNED",
          "ACCEPTED",
          "IN_PROGRESS",
          "COMPLETED",
          "CANCELLED",
        ],
      ],
      [
        "dispatch_event_type",
        [
          "QUEUED",
          "ASSIGNED",
          "ACCEPTED",
          "DECLINED",
          "REASSIGNED",
          "IN_PROGRESS",
          "COMPLETED",
          "CANCELLED",
        ],
      ],
    ] as const) {
      const result = await client.query<{ value: string }>(
        `SELECT enumlabel AS value FROM pg_enum
         JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
         WHERE pg_type.typname = $1 ORDER BY pg_enum.enumsortorder`,
        [type],
      );
      expect(result.rows.map((row) => row.value)).toEqual(expected);
    }
    const indexes = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
       AND (tablename = 'tasks' OR tablename = 'dispatch_events')`,
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "tasks_one_active_per_valet_session_task_type_idx",
        "tasks_location_id_status_created_at_id_idx",
        "tasks_current_assignee_membership_id_status_idx",
        "tasks_valet_session_id_created_at_id_idx",
        "dispatch_events_task_id_occurred_at_id_idx",
        "dispatch_events_valet_session_id_occurred_at_id_idx",
      ]),
    );
  });

  it("enforces exact Task scope, assignee shape and version default", async () => {
    const scope = await createTaskDispatchScope(client);
    const otherLocation = await createTaskDispatchScope(
      client,
      scope.organizationId,
    );
    const foreign = await createTaskDispatchScope(client);
    await expectConstraint(
      createTask(client, scope, { locationId: foreign.locationId }),
      "tasks_org_location_id_fkey",
    );
    await expectConstraint(
      createTask(client, scope, { locationId: otherLocation.locationId }),
      "tasks_org_location_session_id_fkey",
    );
    await expectConstraint(
      createTask(client, scope, {
        assigneeId: foreign.membershipId,
        status: "ASSIGNED",
      }),
      "tasks_org_current_assignee_membership_id_fkey",
    );
    await expectConstraint(
      createTask(client, scope, {
        assigneeId: scope.membershipId,
        status: "QUEUED",
      }),
      "tasks_assignee_status_check",
    );
    for (const status of ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"]) {
      await expectConstraint(
        createTask(client, scope, { status, taskType: "RETRIEVAL" }),
        "tasks_assignee_status_check",
      );
    }
    for (const status of ["COMPLETED", "CANCELLED"]) {
      await expect(
        createTask(client, scope, {
          assigneeId: scope.membershipId,
          status,
          taskType: "RETRIEVAL",
        }),
      ).resolves.toBeDefined();
    }
    const taskId = await createTask(client, scope);
    const version = await client.query<{ version: number }>(
      `SELECT version FROM tasks WHERE id = $1`,
      [taskId],
    );
    expect(version.rows[0]?.version).toBe(1);
  });

  it("prevents duplicate active intended operations but permits terminal history", async () => {
    const scope = await createTaskDispatchScope(client);
    await createTask(client, scope, { taskType: "PARKING" });
    await expectConstraint(
      createTask(client, scope, { taskType: "PARKING" }),
      "tasks_one_active_per_valet_session_task_type_idx",
    );
    await createTask(client, scope, { taskType: "RETRIEVAL" });
    await expectConstraint(
      createTask(client, scope, { taskType: "RETRIEVAL" }),
      "tasks_one_active_per_valet_session_task_type_idx",
    );
    const terminal = await createTaskDispatchScope(client);
    await createTask(client, terminal, { status: "COMPLETED" });
    await expect(createTask(client, terminal)).resolves.toBeDefined();
  });

  it("enforces exact DispatchEvent scope and membership scope", async () => {
    const scope = await createTaskDispatchScope(client);
    const foreign = await createTaskDispatchScope(client);
    const taskId = await createTask(client, scope);
    await expectConstraint(
      createDispatchEvent(client, foreign, taskId, "QUEUED", null, null),
      "dispatch_events_task_scope_id_fkey",
    );
    for (const position of ["actor", "previous", "new"] as const) {
      const [previous, next, actor] = {
        actor: [null, null, foreign.membershipId],
        new: [null, foreign.membershipId, null],
        previous: [foreign.membershipId, null, null],
      }[position] as [string | null, string | null, string | null];
      await expectConstraint(
        createDispatchEvent(
          client,
          scope,
          taskId,
          "CANCELLED",
          previous,
          next,
          actor,
        ),
        `dispatch_events_org_${position}_assignee_membership_id_fkey`.replace(
          "actor_assignee",
          "actor",
        ),
      );
    }
  });

  it("enforces all event shapes and deterministic timelines", async () => {
    const scope = await createTaskDispatchScope(client);
    const taskId = await createTask(client, scope);
    const member = scope.membershipId;
    const invalid = [
      ["QUEUED", member, null],
      ["ASSIGNED", null, null],
      ["ACCEPTED", null, null],
      ["DECLINED", null, null],
      ["REASSIGNED", member, null],
      ["REASSIGNED", member, member],
      ["IN_PROGRESS", null, null],
      ["COMPLETED", null, null],
    ] as const;
    for (const [type, previous, next] of invalid) {
      await expectConstraint(
        createDispatchEvent(client, scope, taskId, type, previous, next),
        "dispatch_events_assignee_shape_check",
      );
    }
    const cancelled = await createDispatchEvent(
      client,
      scope,
      taskId,
      "CANCELLED",
      null,
      null,
    );
    const first = await createDispatchEvent(
      client,
      scope,
      taskId,
      "ASSIGNED",
      null,
      member,
    );
    const second = await createDispatchEvent(
      client,
      scope,
      taskId,
      "ACCEPTED",
      null,
      member,
    );
    await client.query(
      `UPDATE dispatch_events SET occurred_at = $1 WHERE id = $2`,
      ["2026-08-12T09:59:59.000Z", cancelled],
    );
    await client.query(
      `UPDATE dispatch_events SET occurred_at = $1 WHERE id = $2`,
      ["2026-08-12T10:00:00.000Z", first],
    );
    await client.query(
      `UPDATE dispatch_events SET occurred_at = $1 WHERE id = $2`,
      ["2026-08-12T10:00:01.000Z", second],
    );
    for (const predicate of ["task_id = $1", "valet_session_id = $1"]) {
      const value = predicate.startsWith("task")
        ? taskId
        : scope.valetSessionId;
      const rows = await client.query<{ id: string }>(
        `SELECT id FROM dispatch_events WHERE ${predicate}
         ORDER BY occurred_at, id`,
        [value],
      );
      expect(rows.rows.slice(-2).map((row) => row.id)).toEqual([first, second]);
    }
  });
});
