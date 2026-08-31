import { readFileSync } from "node:fs";
import vm from "node:vm";

import { describe, expect, it, vi } from "vitest";

const source = readFileSync(
  new URL("../../../public/sw.js", import.meta.url),
  "utf8",
);
const IDENTITY =
  "11111111-1111-4111-8111-111111111111:2026-08-29T20:00:00.000Z";
const payload = {
  audience: "GUEST",
  body: "Your vehicle has arrived at the pickup area.",
  direction: "ltr",
  identity: IDENTITY,
  locale: "en",
  presentationType: "GUEST_VEHICLE_READY",
  route: "GUEST_HOME",
  title: "Your vehicle is ready",
  version: 1,
};

class Channel {
  port1: { onmessage?: (event: { data: unknown }) => void } = {};
  port2 = {
    postMessage: (data: unknown) => this.port1.onmessage?.({ data }),
  };
}

function harness(clients: Array<Record<string, unknown>> = []) {
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(null);
  const put = vi.fn().mockResolvedValue(undefined);
  const caches = {
    keys: vi.fn().mockResolvedValue([]),
    match: vi.fn().mockResolvedValue(undefined),
    open: vi.fn().mockResolvedValue({ put }),
  };
  const fetch = vi.fn().mockResolvedValue({
    clone: vi.fn(() => ({ body: "asset" })),
    ok: true,
    type: "basic",
  });
  const worker = {
    addEventListener: (
      type: string,
      handler: (event: Record<string, unknown>) => void,
    ) => handlers.set(type, handler),
    clients: {
      claim: vi.fn(),
      matchAll: vi.fn().mockResolvedValue(clients),
      openWindow,
    },
    location: { origin: "https://customer.example.test" },
    registration: { showNotification },
    skipWaiting: vi.fn(),
  };
  vm.runInNewContext(source, {
    MessageChannel: Channel,
    URL,
    caches,
    clearTimeout,
    fetch,
    self: worker,
    setTimeout,
  });
  return { caches, fetch, handlers, openWindow, put, showNotification };
}

async function dispatch(
  handler: ((event: Record<string, unknown>) => void) | undefined,
  event: Record<string, unknown>,
) {
  let pending = Promise.resolve();
  handler?.({
    ...event,
    waitUntil: (work: Promise<unknown>) => {
      pending = work.then(() => undefined);
    },
  });
  await pending;
}

async function dispatchFetch(
  handler: ((event: Record<string, unknown>) => void) | undefined,
  request: Request,
): Promise<{ responded: boolean }> {
  let response: Promise<unknown> | null = null;
  handler?.({
    request,
    respondWith: (value: Promise<unknown>) => {
      response = value;
    },
  });
  await response;
  return { responded: response !== null };
}

describe("Customer Service Worker", () => {
  it("shows only a strict Guest payload with the stable identity tag", async () => {
    const item = harness();
    await dispatch(item.handlers.get("push"), {
      data: { json: () => payload },
    });
    expect(item.showNotification).toHaveBeenCalledWith(
      payload.title,
      expect.objectContaining({
        body: payload.body,
        data: { identity: IDENTITY, route: "GUEST_HOME" },
        tag: IDENTITY,
      }),
    );
  });

  it.each([
    { ...payload, audience: "EMPLOYEE" },
    { ...payload, presentationType: "EMPLOYEE_RETRIEVAL_REQUESTED" },
    { ...payload, token: "forbidden" },
    { ...payload, version: 2 },
    { ...payload, direction: "rtl" },
  ])(
    "rejects malformed, extended, or Employee payload %#",
    async (candidate) => {
      const item = harness();
      await dispatch(item.handlers.get("push"), {
        data: { json: () => candidate },
      });
      expect(item.showNotification).not.toHaveBeenCalled();
    },
  );

  it("focuses only a same-origin client that confirms in-memory GuestAccess", async () => {
    const focus = vi.fn().mockResolvedValue(undefined);
    const messages: unknown[] = [];
    const client = {
      focus,
      postMessage: vi.fn(
        (
          message: unknown,
          ports?: Array<{ postMessage(data: unknown): void }>,
        ) => {
          messages.push(message);
          if (
            (message as { type?: string }).type === "VAYLET_CUSTOMER_AUTH_PROBE"
          ) {
            expect(message).toEqual({
              identity: IDENTITY,
              type: "VAYLET_CUSTOMER_AUTH_PROBE",
            });
            ports?.[0]?.postMessage({
              authorized: true,
              type: "VAYLET_CUSTOMER_AUTH_RESULT",
            });
          }
        },
      ),
      url: "https://customer.example.test/",
    };
    const item = harness([client]);
    await dispatch(item.handlers.get("notificationclick"), {
      notification: {
        close: vi.fn(),
        data: { identity: IDENTITY, route: "GUEST_HOME" },
      },
    });
    expect(focus).toHaveBeenCalledOnce();
    expect(messages).toContainEqual({
      identity: IDENTITY,
      route: "GUEST_HOME",
      type: "VAYLET_CUSTOMER_NOTIFICATION_CLICK",
    });
    expect(item.openWindow).not.toHaveBeenCalled();
  });

  it("opens only credential-free re-entry when no authorized client remains", async () => {
    const item = harness();
    await dispatch(item.handlers.get("notificationclick"), {
      notification: {
        close: vi.fn(),
        data: { identity: IDENTITY, route: "GUEST_HOME" },
      },
    });
    expect(item.openWindow).toHaveBeenCalledWith("/re-entry");
    expect(item.openWindow.mock.calls[0]?.[0]).not.toContain(IDENTITY);
  });

  it("rejects click data with extra authority fields", async () => {
    const item = harness();
    await dispatch(item.handlers.get("notificationclick"), {
      notification: {
        close: vi.fn(),
        data: {
          generation: "forbidden",
          identity: IDENTITY,
          route: "GUEST_HOME",
        },
      },
    });
    expect(item.openWindow).not.toHaveBeenCalled();
  });

  it("rejects an extended auth result and falls back to credential-free re-entry", async () => {
    const client = {
      focus: vi.fn(),
      postMessage: vi.fn(
        (
          _message: unknown,
          ports?: Array<{ postMessage(data: unknown): void }>,
        ) => {
          ports?.[0]?.postMessage({
            authorized: true,
            generation: "forbidden",
            type: "VAYLET_CUSTOMER_AUTH_RESULT",
          });
        },
      ),
      url: "https://customer.example.test/",
    };
    const item = harness([client]);
    await dispatch(item.handlers.get("notificationclick"), {
      notification: {
        close: vi.fn(),
        data: { identity: IDENTITY, route: "GUEST_HOME" },
      },
    });
    expect(client.focus).not.toHaveBeenCalled();
    expect(item.openWindow).toHaveBeenCalledWith("/re-entry");
  });

  it("preserves safe-static-only cache exclusions", () => {
    expect(source).toMatch(/url\.pathname\.startsWith\(["']\/v1\/["']\)/);
    expect(source).toMatch(/url\.pathname\.startsWith\(["']\/api\/["']\)/);
    expect(source).toMatch(/request\.headers\.has\(["']authorization["']\)/);
    expect(source).not.toMatch(/cache\.put\([^)]*(api|v1|Authorization)/i);
  });

  it("never intercepts API or Authorization-bearing requests and still caches safe static assets", async () => {
    const item = harness();
    await expect(
      dispatchFetch(
        item.handlers.get("fetch"),
        new Request("https://customer.example.test/api/v1/guest/session"),
      ),
    ).resolves.toEqual({ responded: false });
    await expect(
      dispatchFetch(
        item.handlers.get("fetch"),
        new Request("https://customer.example.test/icons/icon-192.png", {
          headers: { Authorization: "Bearer forbidden" },
        }),
      ),
    ).resolves.toEqual({ responded: false });
    await expect(
      dispatchFetch(
        item.handlers.get("fetch"),
        new Request("https://customer.example.test/icons/icon-192.png"),
      ),
    ).resolves.toEqual({ responded: true });
    expect(item.fetch).toHaveBeenCalledOnce();
    expect(item.put).toHaveBeenCalledOnce();
  });
});
