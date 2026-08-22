import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StaffTaskQueueItem } from "@valet/contracts";

import { selectEffectiveTaskQueueItems } from "./task-queue-selectors";
import type { TaskQueueState } from "./task-queue-controller";
import { StaffAuthClient } from "../../lib/auth/staff-auth-client";
import { StaffAuthProvider } from "../../lib/auth/staff-auth-context";
import { useTaskQueue } from "./use-task-queue";

const sampleTask: StaffTaskQueueItem = {
  taskId: "11111111-1111-4111-8111-111111111111",
  valetSessionState: "REQUESTED",
  valetSessionVersion: 4,
  sessionId: "22222222-2222-4222-8222-222222222222",
  taskType: "PARKING",
  status: "QUEUED",
  currentAssigneeMembershipId: null,
  version: 1,
  createdAt: "2026-08-21T18:00:00.000Z",
  parkingZone: "Zone A",
  parkingSpot: null,
  retrievalRequestedAt: null,
  vehicle: {
    make: "Toyota",
    model: "Camry",
    color: "White",
    plateNumberRaw: "12-34567",
    temporaryDescriptor: null,
  },
};

describe("Task Queue Session Boundary & Selector Gating", () => {
  it("synchronously hides tasks when auth transitions to User B at the SAME location", () => {
    const controllerStateWithUserA: TaskQueueState = {
      sessionGeneration: 10,
      scopeLocationId: "loc-shared",
      tasks: [sampleTask],
      isLoading: false,
      isRefreshing: false,
      isHardStopped: false,
      error: null,
    };

    // User A authenticated with generation 10 at loc-shared
    const tasksUserA = selectEffectiveTaskQueueItems(
      "authenticated",
      10,
      "loc-shared",
      controllerStateWithUserA,
    );
    expect(tasksUserA).toHaveLength(1);

    // Auth switches to User B (generation 11) at SAME location loc-shared
    const tasksUserB = selectEffectiveTaskQueueItems(
      "authenticated",
      11,
      "loc-shared",
      controllerStateWithUserA,
    );

    // INVARIANT: User A tasks are immediately hidden (empty array)
    expect(tasksUserB).toEqual([]);
  });

  it("synchronously hides tasks when re-authenticating with same token value under new session generation", () => {
    const controllerStateOldSession: TaskQueueState = {
      sessionGeneration: 3,
      scopeLocationId: "loc-1",
      tasks: [sampleTask],
      isLoading: false,
      isRefreshing: false,
      isHardStopped: false,
      error: null,
    };

    const tasksNewSession = selectEffectiveTaskQueueItems(
      "authenticated",
      4,
      "loc-1",
      controllerStateOldSession,
    );

    expect(tasksNewSession).toEqual([]);
  });

  it("synchronously hides tasks when scope locationId does not match controller state", () => {
    const controllerState: TaskQueueState = {
      sessionGeneration: 1,
      scopeLocationId: "loc-A",
      tasks: [sampleTask],
      isLoading: false,
      isRefreshing: false,
      isHardStopped: false,
      error: null,
    };

    const tasksLocB = selectEffectiveTaskQueueItems(
      "authenticated",
      1,
      "loc-B",
      controllerState,
    );

    expect(tasksLocB).toEqual([]);
  });

  it("renders 0 tasks in React component when auth client is unauthenticated", () => {
    const authClient = new StaffAuthClient();

    function TestConsumer() {
      const { tasks } = useTaskQueue({ locationId: "loc-1" });
      return <div id="tasks-count">{tasks.length}</div>;
    }

    const html = renderToStaticMarkup(
      <StaffAuthProvider client={authClient}>
        <TestConsumer />
      </StaffAuthProvider>,
    );

    expect(html).toContain('<div id="tasks-count">0</div>');
  });
});
