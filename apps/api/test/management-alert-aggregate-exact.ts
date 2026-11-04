import { expect } from "vitest";
import type { PostgresPool } from "../src/common/database/postgres";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { readManagementAlertSourceDetail } from "../src/modules/dashboard/management-alert-source-detail-query";

/** Global CRITICAL-first top-20 may hide the Task families: prove off-page
 * ALT02 and ALT03 current episodes through their real exact authorized API. */
export async function assertCurrentMixedTaskReasons(
  pool: PostgresPool,
  scenarios: readonly {
    readonly locationId: string;
    readonly ca: StaffSessionContext;
    readonly lm: StaffSessionContext;
    readonly alt02TaskId: string;
    readonly alt03TaskId: string;
  }[],
) {
  for (const scenario of scenarios) {
    for (const role of ["ca", "lm"] as const) {
      for (const [category, taskId, version] of [
        ["ALT-02", scenario.alt02TaskId, 1],
        ["ALT-03", scenario.alt03TaskId, 3],
      ] as const) {
        const detail = await readManagementAlertSourceDetail(pool, {
          category,
          context: scenario[role],
          locationId: scenario.locationId,
          sourceId: taskId,
          episodeId: `${taskId}:${version}`,
        });
        expect(detail.item).toMatchObject({ category, sourceId: taskId });
      }
    }
  }
}
