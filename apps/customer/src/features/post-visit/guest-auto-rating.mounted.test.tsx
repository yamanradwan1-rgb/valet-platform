import React, { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installTestDom,
  type TestElement,
} from "../../app/guest-refresh-mounted.test-host";
import type { GuestApiClient } from "../../lib/api/guest-api-client";
import type { GuestSafeSession } from "../../lib/api/guest-api-types";
import { LocaleProvider } from "../../i18n/locale-provider";
import { GuestPostVisitScreen } from "./guest-post-visit-screen";
import { useGuestPostVisit } from "./use-guest-post-visit";

const A = "123e4567-e89b-12d3-a456-426614174000";
const B = "223e4567-e89b-12d3-a456-426614174000";
const snapshot = (
  state: GuestSafeSession["state"] = "COMPLETED",
  id = A,
): GuestSafeSession => ({
  valetSessionId: id,
  state,
  readyAt: null,
  vehicle: { make: "Toyota", model: "Camry", color: "Black" },
});
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}

describe("#312 mounted presentation and latest authorization", () => {
  let root: Root;
  let container: TestElement;
  let api: GuestApiClient;
  let current: GuestSafeSession;
  let allowed: boolean;
  let controller: ReturnType<typeof useGuestPostVisit>;
  const persisted = new Map<string, string>();

  function Harness() {
    controller = useGuestPostVisit({
      client: api,
      session: current,
      canEnter: allowed && current.state === "COMPLETED",
      canRemain: allowed && current.state === "COMPLETED",
    });
    return (
      <LocaleProvider initialLocale="en">
        {controller.selection ? (
          <GuestPostVisitScreen
            client={api}
            session={current}
            surface={controller.selection.surface}
            onBack={controller.back}
            onAuthorized={controller.authorized}
          />
        ) : (
          <span>Completed/vehicle</span>
        )}
      </LocaleProvider>
    );
  }
  async function render() {
    await act(async () => {
      root.render(
        <StrictMode>
          <Harness />
        </StrictMode>,
      );
      await flush();
    });
  }
  beforeEach(() => {
    const dom = installTestDom();
    Object.assign(dom.document, {
      cookie: "__Host-vaylet_guest_context=vgc1." + "a".repeat(32),
    });
    Object.assign(dom.window, {
      sessionStorage: {
        getItem: (key: string) => persisted.get(key) ?? null,
        setItem: (key: string, value: string) => {
          persisted.set(key, value);
        },
      },
    });
    persisted.clear();
    container = dom.document.createElement("div");
    dom.document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
    current = snapshot();
    allowed = true;
    api = {
      loadSession: vi.fn(async () => current),
      submitRating: vi.fn(),
    } as unknown as GuestApiClient;
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
  });

  it.each(["PARKED", "READY", "HANDOFF_PENDING"] as const)(
    "auto opens on %s to COMPLETED without a POST",
    async (state) => {
      current = snapshot(state);
      await render();
      expect(container.textContent).not.toContain("Submit rating");
      current = snapshot();
      await render();
      expect(container.textContent).toContain("Submit rating");
      expect(api.submitRating).not.toHaveBeenCalled();
      const reads = vi.mocked(api.loadSession).mock.calls.length;
      await render();
      await render();
      expect(api.loadSession).toHaveBeenCalledTimes(reads);
    },
  );

  it("opens cold COMPLETED; Back suppresses polls, rerenders and refresh; manual reentry works", async () => {
    await render();
    expect(container.textContent).toContain("Submit rating");
    await act(async () => {
      controller.back();
      await flush();
    });
    current = { ...current };
    await render();
    expect(controller.selection).toBeNull();
    await act(async () => root.unmount());
    root = createRoot(container as unknown as Element);
    await render();
    expect(controller.selection).toBeNull();
    await act(async () => {
      controller.open("rating");
      await flush();
    });
    expect(container.textContent).toContain("Submit rating");
    expect(api.submitRating).not.toHaveBeenCalled();
  });

  it("retains contextual payment after dismissal and does not override it", async () => {
    api.loadPaymentProjection = vi.fn(async () => ({
      releaseRequiresPayment: false,
      releaseSatisfied: true,
      payment: null,
      refunds: [],
    }));
    await render();
    await act(async () => {
      controller.back();
      controller.open("payment");
      await flush();
    });
    expect(container.textContent).toContain("Payment summary");
    await render();
    expect(controller.selection?.surface).toBe("payment");
  });

  it.each(["bootstrap", "expired", "missing", "network", "ambiguous"])(
    "blocks %s authority",
    async () => {
      allowed = false;
      await render();
      expect(controller.selection).toBeNull();
      expect(api.loadSession).not.toHaveBeenCalled();
    },
  );

  it("blocks cancelled and non-completed visits", async () => {
    // Hostile snapshot: the real API parser rejects CANCELLED before routing.
    current = snapshot("CANCELLED" as GuestSafeSession["state"]);
    await render();
    expect(controller.selection).toBeNull();
    expect(api.loadSession).not.toHaveBeenCalled();
  });

  it("waits for independent authorization; a different visit never mounts rating", async () => {
    const pending = deferred<GuestSafeSession>();
    api.loadSession = vi.fn(() => pending.promise);
    await render();
    expect(container.textContent).not.toContain("Submit rating");
    await act(async () => {
      pending.resolve(snapshot("COMPLETED", B));
      await flush();
    });
    expect(container.textContent).toBe("Back");
    expect(api.submitRating).not.toHaveBeenCalled();
  });

  it("fails closed on network failure during authorization", async () => {
    api.loadSession = vi.fn(async () => {
      throw Error("offline");
    });
    await render();
    expect(container.textContent).toBe("Back");
    expect(api.submitRating).not.toHaveBeenCalled();
  });

  it("dismisses pending authorization without resurrection by its late response", async () => {
    const pending = deferred<GuestSafeSession>();
    api.loadSession = vi.fn(() => pending.promise);
    await render();
    await act(async () => {
      controller.back();
      pending.resolve(snapshot());
      await flush();
    });
    expect(controller.selection).toBeNull();
    expect(container.textContent).not.toContain("Submit rating");
  });

  it("fences late Visit A authorization after client/visit B replacement", async () => {
    const pending = deferred<GuestSafeSession>();
    api.loadSession = vi.fn(() => pending.promise);
    await render();
    api = {
      loadSession: vi.fn(async () => snapshot("PARKED", B)),
      submitRating: vi.fn(),
    } as unknown as GuestApiClient;
    current = snapshot("PARKED", B);
    await render();
    await act(async () => {
      pending.resolve(snapshot());
      await flush();
    });
    expect(controller.selection).toBeNull();
    expect(container.textContent).not.toContain("Submit rating");
    current = snapshot("COMPLETED", B);
    await render();
    expect(container.textContent).toBe("Back"); // latest API still says PARKED
  });

  it("does not carry Visit A dismissal into B", async () => {
    await render();
    await act(async () => {
      controller.back();
      await flush();
    });
    current = snapshot("COMPLETED", B);
    api = {
      loadSession: vi.fn(async () => current),
      submitRating: vi.fn(),
    } as unknown as GuestApiClient;
    await render();
    expect(container.textContent).toContain("Submit rating");
  });
});
