import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearEmployeePushIdentities,
  handleEmployeePushClientMessage,
  subscribeEmployeePushIdentity,
} from "./employee-push-identity-bridge";
import {
  createRetrievalAlertTracker,
  observeRetrievalIdentity,
} from "../retrieval-alert/retrieval-alert-tracker";
import { createEmployeePushTasksHandler } from "./use-employee-push-client-messages";

const TASK_ID = "11111111-1111-4111-8111-111111111111";

describe("Employee push identity bridge", () => {
  beforeEach(clearEmployeePushIdentities);

  it("records a safe observed identity for foreground sound dedupe", () => {
    const tracker = createRetrievalAlertTracker();
    const unsubscribe = subscribeEmployeePushIdentity((identity) =>
      observeRetrievalIdentity(tracker, identity),
    );
    handleEmployeePushClientMessage({
      identity: TASK_ID,
      route: "TASKS",
      type: "VAYLET_EMPLOYEE_PUSH_OBSERVED",
    });
    expect(tracker.observedTaskIds.has(TASK_ID)).toBe(true);
    unsubscribe();
  });

  it("routes only validated click messages and still records identity", () => {
    const onTasks = vi.fn();
    expect(
      handleEmployeePushClientMessage(
        {
          identity: TASK_ID,
          route: "TASKS",
          type: "VAYLET_EMPLOYEE_NOTIFICATION_CLICK",
        },
        onTasks,
      ),
    ).toBe(true);
    expect(onTasks).toHaveBeenCalledWith(TASK_ID);
    expect(
      handleEmployeePushClientMessage(
        { identity: TASK_ID, route: "GUEST_HOME", type: "unknown" },
        onTasks,
      ),
    ).toBe(false);
    expect(onTasks).toHaveBeenCalledOnce();
  });

  it("rejects messages carrying extra authority-looking fields", () => {
    const onTasks = vi.fn();
    expect(
      handleEmployeePushClientMessage(
        {
          identity: TASK_ID,
          locationId: "22222222-2222-4222-8222-222222222222",
          route: "TASKS",
          type: "VAYLET_EMPLOYEE_NOTIFICATION_CLICK",
        },
        onTasks,
      ),
    ).toBe(false);
    expect(onTasks).not.toHaveBeenCalled();
  });

  it("routes clicks and refetches the canonical queue without a domain mutation", () => {
    const navigate = vi.fn();
    const refresh = vi.fn();
    const handler = createEmployeePushTasksHandler(navigate, refresh);
    handleEmployeePushClientMessage(
      {
        identity: TASK_ID,
        route: "TASKS",
        type: "VAYLET_EMPLOYEE_NOTIFICATION_CLICK",
      },
      handler,
    );
    expect(navigate).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps distinct Task identities independently observed", () => {
    const seen: string[] = [];
    const second = "22222222-2222-4222-8222-222222222222";
    const unsubscribe = subscribeEmployeePushIdentity((identity) =>
      seen.push(identity),
    );
    for (const identity of [TASK_ID, second]) {
      handleEmployeePushClientMessage({
        identity,
        route: "TASKS",
        type: "VAYLET_EMPLOYEE_PUSH_OBSERVED",
      });
    }
    expect(seen).toEqual([TASK_ID, second]);
    unsubscribe();
  });
});
