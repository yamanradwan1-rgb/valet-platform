import { readFileSync } from "node:fs";
import vm from "node:vm";

import { describe, expect, it, vi } from "vitest";

const source = readFileSync(
  new URL("../../../public/sw.js", import.meta.url),
  "utf8",
);
const IDENTITY =
  "11111111-1111-4111-8111-111111111111:2026-08-29T20:00:00.000Z";

class Channel {
  port1: { onmessage?: (event: { data: unknown }) => void } = {};
  port2 = {
    postMessage: (data: unknown) => this.port1.onmessage?.({ data }),
  };
}

function candidate(response: boolean | null) {
  const focus = vi.fn().mockResolvedValue(undefined);
  return {
    focus,
    postMessage: vi.fn(
      (
        _message: unknown,
        ports?: Array<{ postMessage(data: unknown): void }>,
      ) => {
        if (response !== null) {
          ports?.[0]?.postMessage({
            authorized: response,
            type: "VAYLET_CUSTOMER_AUTH_RESULT",
          });
        }
      },
    ),
    url: "https://customer.example.test/",
  };
}

describe("Customer notification multi-tab routing", () => {
  it("focuses only the tab proving exact-session in-memory authority", async () => {
    const handlers = new Map<
      string,
      (event: Record<string, unknown>) => void
    >();
    const wrong = candidate(false);
    const stale = candidate(null);
    const exact = candidate(true);
    const openWindow = vi.fn();
    const worker = {
      addEventListener: (
        type: string,
        handler: (event: Record<string, unknown>) => void,
      ) => handlers.set(type, handler),
      clients: {
        claim: vi.fn(),
        matchAll: vi.fn().mockResolvedValue([wrong, stale, exact]),
        openWindow,
      },
      location: { origin: "https://customer.example.test" },
      registration: { showNotification: vi.fn() },
      skipWaiting: vi.fn(),
    };
    vm.runInNewContext(source, {
      MessageChannel: Channel,
      URL,
      caches: { keys: vi.fn().mockResolvedValue([]) },
      clearTimeout,
      self: worker,
      setTimeout,
    });
    let pending = Promise.resolve();
    handlers.get("notificationclick")?.({
      notification: {
        close: vi.fn(),
        data: { identity: IDENTITY, route: "GUEST_HOME" },
      },
      waitUntil: (work: Promise<unknown>) => {
        pending = work.then(() => undefined);
      },
    });
    await pending;
    expect(wrong.focus).not.toHaveBeenCalled();
    expect(stale.focus).not.toHaveBeenCalled();
    expect(exact.focus).toHaveBeenCalledOnce();
    expect(exact.postMessage).toHaveBeenLastCalledWith({
      identity: IDENTITY,
      route: "GUEST_HOME",
      type: "VAYLET_CUSTOMER_NOTIFICATION_CLICK",
    });
    expect(openWindow).not.toHaveBeenCalled();
  });
});
