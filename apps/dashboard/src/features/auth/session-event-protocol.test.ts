import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseSessionEvent,
  publishSessionEvent,
  resetCrossTabSessionBus,
  subscribeSessionEvents,
  type SessionEvent,
} from "./cross-tab-session";

const VALID_REFRESHED: SessionEvent = {
  accessExpiresAt: "2025-01-01T00:10:00Z",
  accessToken: `vsa1.${"A".repeat(43)}`,
  sessionExpiresAt: "2025-01-31T00:00:00Z",
  type: "refreshed",
};

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];

  readonly name: string;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(message: unknown): void {
    // Same-origin siblings only; a channel never hears itself.
    for (const instance of FakeBroadcastChannel.instances) {
      if (instance !== this) {
        queueMicrotask(() => instance.onmessage?.({ data: message }));
      }
    }
  }

  close(): void {
    FakeBroadcastChannel.instances = FakeBroadcastChannel.instances.filter(
      (instance) => instance !== this,
    );
  }
}

beforeEach(() => {
  FakeBroadcastChannel.instances = [];
  vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
});

afterEach(() => {
  resetCrossTabSessionBus();
  vi.unstubAllGlobals();
});

describe("parseSessionEvent", () => {
  it("accepts a well-formed refreshed event", () => {
    expect(parseSessionEvent({ ...VALID_REFRESHED })).toEqual(VALID_REFRESHED);
  });

  it("accepts ended events only with known reasons and finite timestamps", () => {
    expect(
      parseSessionEvent({
        occurredAtMs: 1000,
        reason: "signed-out",
        type: "ended",
      }),
    ).toEqual({ occurredAtMs: 1000, reason: "signed-out", type: "ended" });
    expect(parseSessionEvent({ reason: "expired", type: "ended" })).toBeNull();
    expect(
      parseSessionEvent({
        occurredAtMs: Number.NaN,
        reason: "expired",
        type: "ended",
      }),
    ).toBeNull();
    expect(
      parseSessionEvent({ occurredAtMs: -5, reason: "expired", type: "ended" }),
    ).toBeNull();
  });

  it("accepts replacement events with finite timestamps", () => {
    expect(parseSessionEvent({ occurredAtMs: 42, type: "replaced" })).toEqual({
      occurredAtMs: 42,
      type: "replaced",
    });
    expect(parseSessionEvent({ type: "replaced" })).toBeNull();
  });

  it("rejects foreign or malformed payloads", () => {
    expect(parseSessionEvent(null)).toBeNull();
    expect(parseSessionEvent("refreshed")).toBeNull();
    expect(
      parseSessionEvent({
        ...VALID_REFRESHED,
        accessToken: `vsr1.${"A".repeat(43)}`,
      }),
    ).toBeNull();
    expect(
      parseSessionEvent({ ...VALID_REFRESHED, accessExpiresAt: "not-a-date" }),
    ).toBeNull();
  });
});

describe("session event bus", () => {
  function receiveFromSibling(data: unknown): void {
    // The shared channel belongs to this tab; a SIBLING tab's broadcast
    // arrives through its onmessage handler.
    for (const instance of FakeBroadcastChannel.instances) {
      instance.onmessage?.({ data });
    }
  }

  it("delivers inbound sibling events to subscribers", async () => {
    const received: SessionEvent[] = [];
    const unsubscribe = subscribeSessionEvents((event) => received.push(event));
    receiveFromSibling({ ...VALID_REFRESHED });
    await flush();
    expect(received).toEqual([VALID_REFRESHED]);
    unsubscribe();
  });

  it("never delivers a publisher its own event", async () => {
    const received: SessionEvent[] = [];
    const unsubscribe = subscribeSessionEvents((event) => received.push(event));
    publishSessionEvent(VALID_REFRESHED);
    await flush();
    // Only sibling channels receive broadcasts; the local tab applies its
    // own state directly.
    expect(received).toEqual([]);
    unsubscribe();
  });

  it("stops delivery after unsubscribe and drops malformed broadcasts", async () => {
    const received: SessionEvent[] = [];
    const unsubscribe = subscribeSessionEvents((event) => received.push(event));
    unsubscribe();
    receiveFromSibling({ ...VALID_REFRESHED });
    receiveFromSibling({ data: { type: "replaced", occurredAtMs: "x" } });
    await flush();
    expect(received).toEqual([]);
  });

  it("keeps dispatching when one listener throws", async () => {
    const received: string[] = [];
    subscribeSessionEvents(() => {
      throw new Error("listener bug");
    });
    const unsubscribe = subscribeSessionEvents((event) => {
      received.push(event.type);
    });
    receiveFromSibling({ ...VALID_REFRESHED });
    await flush();
    expect(received).toEqual(["refreshed"]);
    unsubscribe();
  });

  it("publishing stays safe when BroadcastChannel is unsupported", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    resetCrossTabSessionBus();
    expect(() =>
      publishSessionEvent({
        occurredAtMs: 1,
        reason: "expired",
        type: "ended",
      }),
    ).not.toThrow();
    const received: SessionEvent[] = [];
    const unsubscribe = subscribeSessionEvents((event) => received.push(event));
    publishSessionEvent(VALID_REFRESHED);
    await flush();
    expect(received).toEqual([]);
    unsubscribe();
  });

  it("uses the dedicated same-origin session channel name", () => {
    subscribeSessionEvents(() => {});
    expect(FakeBroadcastChannel.instances).toHaveLength(1);
    expect(FakeBroadcastChannel.instances[0]?.name).toBe(
      "vaylet.staff.session.v1",
    );
  });
});
