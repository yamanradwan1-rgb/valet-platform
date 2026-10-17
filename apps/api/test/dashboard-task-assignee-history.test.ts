import { describe, expect, it } from "vitest";

import {
  dashboardTasksHistoricalAssigneeJoins,
  operationalAssigneeColumn,
  operationalAssigneeJoins,
} from "../src/modules/dashboard/operational-assignee-projection";

describe("#299 Tasks historical assignee projection", () => {
  it("shows the persisted, granted assignee for a completed Task without claiming a completion actor", () => {
    const join = dashboardTasksHistoricalAssigneeJoins();
    expect(join).toContain(
      "task.status IN ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED')",
    );
    expect(join).toContain(
      "assignee_member.id = task.current_assignee_membership_id",
    );
    expect(join).not.toContain("'QUEUED'");
    expect(join).not.toContain("'CANCELLED'");
    expect(join).not.toContain("dispatch_events");
    expect(join).not.toContain("completed_by");
  });

  it("retains exact tenant and task-Location membership-grant guards", () => {
    const join = dashboardTasksHistoricalAssigneeJoins();
    expect(join).toContain(
      "assignee_member.organization_id = task.organization_id",
    );
    expect(join).toContain(
      "assignee_access.organization_id = task.organization_id",
    );
    expect(join).toContain(
      "assignee_access.membership_id = assignee_member.id",
    );
    expect(join).toContain(
      "assignee_access.location_id = task.location_id",
    );
    expect(operationalAssigneeColumn).toContain(
      "CASE WHEN assignee_user.id IS NULL THEN NULL",
    );
  });

  it("preserves active-only projection for Live Operations and the Retrieval queue", () => {
    for (const alias of ["task", "current_task"] as const) {
      const join = operationalAssigneeJoins(alias);
      expect(join).toContain(
        `${alias}.status IN ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS')`,
      );
      expect(join).not.toContain("'COMPLETED'");
      expect(join).not.toContain("'QUEUED'");
      expect(join).not.toContain("'CANCELLED'");
      expect(join).toContain(
        `assignee_access.location_id = ${alias}.location_id`,
      );
    }
  });
});
