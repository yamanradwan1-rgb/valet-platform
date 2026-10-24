import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  installTestDom,
  type TestElement,
} from "../../app/guest-refresh-mounted.test-host";
import { GUEST_CONTEXT_CHANGED_EVENT } from "../../lib/api/guest-api-client";
import { GuestAuthProvider, useGuestAuth } from "./guest-auth-context";

const TOKEN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012345678-_";
const rateLimited = () =>
  new Response(JSON.stringify({ code: "GUEST_ACCESS_RATE_LIMITED" }), {
    status: 429,
    headers: { "Retry-After": "1", "Content-Type": "application/json" },
  });
const longRateLimit = () =>
  new Response(JSON.stringify({ code: "GUEST_ACCESS_RATE_LIMITED" }), {
    status: 429,
    headers: { "Retry-After": "40", "Content-Type": "application/json" },
  });
const ready = () =>
  new Response(JSON.stringify({ result: "ENROLLMENT_READY" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

let observed: ReturnType<typeof useGuestAuth> | null = null;
function Probe() {
  const auth = useGuestAuth();
  React.useEffect(() => {
    observed = auth;
  }, [auth]);
  return <span>{auth.isTokenBootstrapComplete ? "complete" : "pending"}</span>;
}

async function flush() {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

describe("Guest Auth mounted 429 first navigation", () => {
  let root: Root | null;
  let container: TestElement;
  let localWindow: Record<string, unknown>;
  let scrubbed: ReturnType<typeof vi.fn>;
  const originalEnrollment =
    process.env.NEXT_PUBLIC_GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED;

  beforeEach(() => {
    const dom = installTestDom();
    Object.defineProperty(dom.document, "cookie", {
      configurable: true,
      value: "",
    });
    localWindow = dom.window;
    container = dom.document.createElement("div");
    dom.document.body.appendChild(container);
    const location = {
      hash: `#guestToken=${TOKEN}`,
      pathname: "/",
      search: "",
    };
    scrubbed = vi.fn(() => {
      location.hash = "";
    });
    localWindow.location = location;
    localWindow.history = { replaceState: scrubbed };
    process.env.NEXT_PUBLIC_GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED = "true";
    observed = null;
    root = createRoot(container as unknown as Element);
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalEnrollment === undefined) {
      delete process.env.NEXT_PUBLIC_GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED =
        originalEnrollment;
    }
  });

  it("scrubs fragment immediately, keeps first 429 pending then establishes cookie authority", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(ready())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await act(async () => {
      root?.render(
        <GuestAuthProvider>
          <Probe />
        </GuestAuthProvider>,
      );
      await flush();
    });
    expect(scrubbed).toHaveBeenCalledTimes(1);
    expect((localWindow.location as { hash: string }).hash).toBe("");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(observed).toMatchObject({ isTokenBootstrapComplete: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await flush();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(observed).toMatchObject({
      token: null,
      isTokenBootstrapComplete: true,
      isBootstrapTemporarilyUnavailable: false,
    });
  });

  it("discards a deferred 429 retry after browser context changes", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(rateLimited());
    await act(async () => {
      root?.render(
        <GuestAuthProvider>
          <Probe />
        </GuestAuthProvider>,
      );
      await flush();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await act(async () => {
      (localWindow.dispatchEvent as (event: Event) => boolean)(
        new Event(GUEST_CONTEXT_CHANGED_EVENT),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await flush();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(observed).toMatchObject({
      token: null,
      isTokenBootstrapComplete: true,
    });
  });

  it("keeps the scrubbed stage available and schedules an explicit retry for the full 40s", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(longRateLimit())
      .mockResolvedValueOnce(ready())
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await act(async () => {
      root?.render(
        <GuestAuthProvider>
          <Probe />
        </GuestAuthProvider>,
      );
      await flush();
    });
    expect(observed).toMatchObject({
      token: TOKEN,
      isTokenBootstrapComplete: true,
      isBootstrapTemporarilyUnavailable: true,
    });
    expect(scrubbed).toHaveBeenCalledTimes(1);
    let retried: Promise<void> | undefined;
    await act(async () => {
      retried = observed!.retryBootstrap();
      await flush();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(39_999);
      await flush();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await flush();
    });
    await retried;
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(observed).toMatchObject({
      token: null,
      isTokenBootstrapComplete: true,
      isBootstrapTemporarilyUnavailable: false,
    });
  });

  it("cancels a long scheduled retry when the cookie context changes", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(longRateLimit());
    await act(async () => {
      root?.render(
        <GuestAuthProvider>
          <Probe />
        </GuestAuthProvider>,
      );
      await flush();
    });
    let retried: Promise<void> | undefined;
    await act(async () => {
      retried = observed!.retryBootstrap();
      await flush();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    await act(async () => {
      (localWindow.dispatchEvent as (event: Event) => boolean)(
        new Event(GUEST_CONTEXT_CHANGED_EVENT),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await retried;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(observed).toMatchObject({
      token: null,
      isTokenBootstrapComplete: true,
      isBootstrapTemporarilyUnavailable: false,
    });
  });
});
