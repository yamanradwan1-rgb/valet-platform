import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runtimePoolSnapshot } from "../src/common/database/bounded-postgres-pool";
import {
  dashboardSessionStateCounts,
  listDashboardSessions,
} from "../src/modules/dashboard/overview-sessions-query";
import { listDashboardTasks } from "../src/modules/dashboard/overview-retrieval-tasks-query";
import { listActiveShifts } from "../src/modules/dashboard/overview-shifts-keys-incidents-query";
import { createStaffOperationalContextQuery } from "../src/modules/staff/staff-operational-context-query";
import { createTaskQueueQuery } from "../src/modules/dispatch/task-queue-query";
import { StaffVehicleDirectoryService } from "../src/modules/staff/staff-vehicle-directory.service";
import { createIntakeSessionCommandExecutor } from "../src/modules/valet-sessions/intake-session-command";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

describe("small service-path PostgreSQL cost probe (not an HTTP capacity test)", () => {
  const context = new DashboardOverviewTestContext("pool_route_cost");
  beforeAll(() => context.setup(), 120_000);
  afterAll(() => context.teardown(), 60_000);

  it("records bounded numeric acquisition, query RTT and lease costs for all eight benchmark operations", async () => {
    const manager = await context.managerFixture();
    const employee = await context.createActor(manager, "VALET_EMPLOYEE");
    await context.startActiveShift(manager, employee);
    const staff = {
      authenticatedUserId: employee.userId,
      locationId: manager.locationId,
    };
    const dashboard = {
      authenticatedUserId: manager.userId,
      locationId: manager.locationId,
      limit: 100,
    };
    const paths: Array<[string, () => Promise<unknown>]> = [
      [
        "INTAKE",
        () =>
          createIntakeSessionCommandExecutor(context.runtimePool)({
            authenticatedUserId: employee.userId,
            targetLocationId: manager.locationId,
            intakeOperationId: randomUUID(),
            vehicleIdentity: {
              mode: "TEMPORARY_DESCRIPTOR",
              temporaryDescriptor: "Synthetic probe",
            },
          }),
      ],
      [
        "STATE_COUNTS",
        () => dashboardSessionStateCounts(context.runtimePool, dashboard),
      ],
      ["SESSIONS", () => listDashboardSessions(context.runtimePool, dashboard)],
      ["TASKS", () => listDashboardTasks(context.runtimePool, dashboard)],
      ["ACTIVE_SHIFTS", () => listActiveShifts(context.runtimePool, dashboard)],
      [
        "CONTEXT",
        () =>
          createStaffOperationalContextQuery(context.runtimePool)(
            employee.userId,
          ),
      ],
      ["TASK_QUEUE", () => createTaskQueueQuery(context.runtimePool)(staff)],
      [
        "DIRECTORY",
        () =>
          new StaffVehicleDirectoryService(
            context.runtimePool,
          ).getVehicleDirectory(employee.userId, manager.locationId),
      ],
    ];
    for (const [operation, run] of paths) {
      await vi.waitFor(() =>
        expect(runtimePoolSnapshot(context.runtimePool).admitted).toBe(0),
      );
      const before = runtimePoolSnapshot(context.runtimePool);
      const counts = [...before.queryCounts!];
      const times = [...before.queryMs!];
      await run();
      await vi.waitFor(() =>
        expect(runtimePoolSnapshot(context.runtimePool).admitted).toBe(0),
      );
      const after = runtimePoolSnapshot(context.runtimePool);
      const queryCounts = after.queryCounts!.map((n, i) => n - counts[i]!);
      expect(after.acquisitions! - before.acquisitions!).toBe(1);
      expect(queryCounts[0]).toBe(1);
      expect(queryCounts[3]).toBe(1);
      if (operation === "CONTEXT") expect(queryCounts).toEqual([1, 5, 0, 1]);
      // Fixed labels and numbers only; no SQL, identifiers, tokens or parameters.
      process.stdout.write(
        "POOL_COST " +
          JSON.stringify({
            operation,
            acquisitions: after.acquisitions! - before.acquisitions!,
            queryCounts,
            queryMs: after.queryMs!.map((n, i) =>
              Number((n - times[i]!).toFixed(3)),
            ),
            nativeAcquisitionMs: Number(
              (
                after.nativeAcquisitionMs! - before.nativeAcquisitionMs!
              ).toFixed(3),
            ),
            acquisitionMs: Number(
              (after.acquisitionMs! - before.acquisitionMs!).toFixed(3),
            ),
            leaseMs: Number((after.leaseMs! - before.leaseMs!).toFixed(3)),
          }) +
          "\n",
      );
    }
  });
});
