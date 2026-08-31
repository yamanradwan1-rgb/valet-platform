import { readFileSync } from "node:fs";
import vm from "node:vm";

import { describe, expect, it, vi } from "vitest";

const workerSource = readFileSync(
  new URL("../../../public/sw.js", import.meta.url),
  "utf8",
);
const TASK_ID = "11111111-1111-4111-8111-111111111111";
const validPayload = {
  audience: "EMPLOYEE",
  body: "A new retrieval request is waiting in the task queue.",
  direction: "ltr",
  identity: TASK_ID,
  locale: "en",
  presentationType: "EMPLOYEE_RETRIEVAL_REQUESTED",
  route: "TASKS",
  title: "New retrieval request",
  version: 1,
};

function harness(initialClients: Array<Record<string, unknown>> = []) {
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(null);
  const matchAll = vi.fn().mockResolvedValue(initialClients);
  const worker = {
    addEventListener: (
      type: string,
      handler: (event: Record<string, unknown>) => void,
    ) => handlers.set(type, handler),
    clients: { claim: vi.fn(), matchAll, openWindow },
    location: { origin: "https://employee.example.test" },
    registration: { showNotification },
    skipWaiting: vi.fn(),
  };
  vm.runInNewContext(workerSource, {
    URL,
    caches: { keys: vi.fn().mockResolvedValue([]) },
    self: worker,
  });
  return { handlers, matchAll, openWindow, showNotification };
}

async function dispatch(
  handler: ((event: Record<string, unknown>) => void) | undefined,
  event: Record<string, unknown>,
): Promise<void> {
  let pending = Promise.resolve();
  handler?.({
    ...event,
    waitUntil: (work: Promise<unknown>) => {
      pending = work.then(() => undefined);
    },
  });
  await pending;
}

describe("Employee root Service Worker", () => {
  it("accepts only the strict Employee payload and uses Task.id as tag", async () => {
    const postMessage = vi.fn();
    const subject = harness([
      { postMessage, url: "https://employee.example.test/tasks" },
    ]);
    await dispatch(subject.handlers.get("push"), {
      data: { json: () => validPayload },
    });
    expect(subject.showNotification).toHaveBeenCalledWith(
      validPayload.title,
      expect.objectContaining({
        body: validPayload.body,
        data: { identity: TASK_ID, route: "TASKS" },
        dir: "ltr",
        lang: "en",
        tag: TASK_ID,
      }),
    );
    expect(postMessage).toHaveBeenCalledWith({
      identity: TASK_ID,
      route: "TASKS",
      type: "VAYLET_EMPLOYEE_PUSH_OBSERVED",
    });
  });

  it.each([
    { ...validPayload, audience: "GUEST" },
    { ...validPayload, presentationType: "GUEST_VEHICLE_READY" },
    { ...validPayload, token: "forbidden" },
    { ...validPayload, identity: "not-a-uuid" },
    { ...validPayload, title: "x".repeat(81) },
    { ...validPayload, body: "x".repeat(161) },
  ])("ignores malformed or unsupported payload %#", async (payload) => {
    const subject = harness();
    await dispatch(subject.handlers.get("push"), {
      data: { json: () => payload },
    });
    expect(subject.showNotification).not.toHaveBeenCalled();
  });

  it("focuses a same-origin client and sends only TASKS plus identity", async () => {
    const postMessage = vi.fn();
    const focus = vi.fn().mockResolvedValue(undefined);
    const subject = harness([
      { focus, postMessage, url: "https://employee.example.test/tasks" },
      { url: "https://other.example.test/" },
    ]);
    const close = vi.fn();
    await dispatch(subject.handlers.get("notificationclick"), {
      notification: {
        close,
        data: { identity: TASK_ID, route: "TASKS" },
      },
    });
    expect(close).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith({
      identity: TASK_ID,
      route: "TASKS",
      type: "VAYLET_EMPLOYEE_NOTIFICATION_CLICK",
    });
    expect(subject.openWindow).not.toHaveBeenCalled();
  });

  it("opens only the safe root when no Employee client exists", async () => {
    const opened = {
      postMessage: vi.fn(),
      url: "https://employee.example.test/",
    };
    const subject = harness();
    subject.openWindow.mockResolvedValue(opened);
    await dispatch(subject.handlers.get("notificationclick"), {
      notification: {
        close: vi.fn(),
        data: { identity: TASK_ID, route: "TASKS" },
      },
    });
    expect(subject.openWindow).toHaveBeenCalledWith("/");
    expect(opened.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ identity: TASK_ID, route: "TASKS" }),
    );
  });

  it("rejects click data with extra fields", async () => {
    const subject = harness();
    await dispatch(subject.handlers.get("notificationclick"), {
      notification: {
        close: vi.fn(),
        data: { identity: TASK_ID, memberId: "forbidden", route: "TASKS" },
      },
    });
    expect(subject.openWindow).not.toHaveBeenCalled();
  });

  it("has no fetch handler or credential/domain mutation behavior", () => {
    const subject = harness();
    expect(subject.handlers.has("fetch")).toBe(false);
    expect(workerSource).not.toMatch(
      /Authorization|Cookie|GuestAccess|auto-claim/i,
    );
    expect(workerSource).not.toMatch(/fetch\s*\(/);
  });
});
