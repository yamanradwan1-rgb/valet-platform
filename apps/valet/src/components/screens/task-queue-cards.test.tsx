import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { StaffTaskQueueItemViewModel } from "../../features/task-queue/task-queue-view-model";
import {
  containerAllowsNormalAction,
  LivePriorityTaskCard,
} from "./task-queue-cards";

const baseTask: StaffTaskQueueItemViewModel = {
  badgeVariant: "retrieval",
  currentAssigneeMembershipId: "cccccccc-3333-4333-8333-333333333333",
  elapsedAge: "01:00",
  isAssignedToMe: false,
  metaText: "IN_PROGRESS",
  parkingContext: null,
  sessionId: "bbbbbbbb-2222-4222-8222-222222222222",
  status: "IN_PROGRESS",
  taskId: "aaaaaaaa-1111-4111-8111-111111111111",
  taskType: "RETRIEVAL",
  timeText: "Requested just now",
  valetSessionState: "HANDOFF_PENDING",
  valetSessionVersion: 9,
  vehicleColor: "Black",
  vehicleHeading: "Audi A6",
  vehicleIdentifier: "77-99999",
  version: 6,
};

describe("supervisor override entry navigation gating", () => {
  it("never opens the normal action path from an assigned-to-other container, even when override-eligible", () => {
    expect(
      containerAllowsNormalAction({
        isActionInFlight: false,
        isAssignedToOther: true,
      }),
    ).toBe(false);
  });

  it("keeps the normal action available only for non-assigned-to-other tasks", () => {
    expect(
      containerAllowsNormalAction({
        isActionInFlight: false,
        isAssignedToOther: false,
      }),
    ).toBe(true);
    expect(
      containerAllowsNormalAction({
        isActionInFlight: true,
        isAssignedToOther: false,
      }),
    ).toBe(false);
  });

  it("renders ONLY the Override Handoff affordance for the eligible supervisor card — no normal action button exists to invoke", () => {
    const onAction = vi.fn();
    const onOverrideHandoff = vi.fn();
    const markup = renderToStaticMarkup(
      <LivePriorityTaskCard
        membershipId="dddddddd-4444-4444-8444-444444444444"
        onAction={onAction}
        onOverrideHandoff={onOverrideHandoff}
        priorityTask={baseTask}
        role="VALET_SUPERVISOR"
      />,
    );
    expect(markup).toContain("Override Handoff");
    // The normal action button (label "Assigned"/"Continue Retrieval") is
    // removed entirely for the eligible card, so no handler can fire.
    expect(markup).not.toContain("Continue Retrieval");
    expect(markup).not.toContain(">Assigned<");
  });

  it("keeps the normal disabled action for a non-eligible assigned-to-other retrieval", () => {
    const onAction = vi.fn();
    const onOverrideHandoff = vi.fn();
    const markup = renderToStaticMarkup(
      <LivePriorityTaskCard
        membershipId="dddddddd-4444-4444-8444-444444444444"
        onAction={onAction}
        onOverrideHandoff={onOverrideHandoff}
        priorityTask={{ ...baseTask, valetSessionState: "READY" }}
        role="VALET_SUPERVISOR"
      />,
    );
    expect(markup).toContain(">Assigned<");
    expect(markup).not.toContain("Override Handoff");
  });
});
