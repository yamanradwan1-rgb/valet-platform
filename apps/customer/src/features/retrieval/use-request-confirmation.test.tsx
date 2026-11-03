import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installTestDom } from "../../app/guest-refresh-mounted.test-host";
import { GuestApiClient } from "../../lib/api/guest-api-client";
import type { GuestSafeSession } from "../../lib/api/guest-api-types";
import { useRequestConfirmation } from "./use-request-confirmation";

type Context = Parameters<typeof useRequestConfirmation>[0];
const parked: GuestSafeSession = {
  valetSessionId: "123e4567-e89b-12d3-a456-426614174000",
  state: "PARKED",
  readyAt: null,
  vehicle: { make: "Toyota", model: "Camry", color: "White" },
};

describe("confirmation intent ownership boundary", () => {
  let root: Root;
  let context: Context;
  let intent: ReturnType<typeof useRequestConfirmation>;
  const request = vi.fn(async () => true);

  function Probe({ value }: { value: Context }) {
    intent = useRequestConfirmation(value);
    return <span>{intent.isOpen ? "open" : "closed"}</span>;
  }
  async function render(value = context) {
    context = value;
    await act(async () => {
      root.render(<Probe value={context} />);
    });
  }
  beforeEach(() => {
    const dom = installTestDom();
    const container = dom.document.createElement("div");
    dom.document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
    request.mockClear();
    context = {
      client: new GuestApiClient("token-a"),
      session: parked,
      hasBrowserSession: false,
      hasAuthority: true,
      isFresh: true,
      isMutating: false,
      requestVehicle: request,
    };
  });
  afterEach(async () => {
    await act(async () => root.unmount());
  });

  // Same-client visit replacement cannot pass the real coordinator. Exercise
  // the hook defensively as well, without claiming this is a supported swap.
  it.each(["client", "visit", "loading", "authority", "lifecycle"] as const)(
    "permanently invalidates on %s change, including A -> unavailable -> A",
    async (change) => {
      await render();
      const original = context;
      await act(async () => intent.open());
      const stale = intent;
      expect(intent.isOpen).toBe(true);
      const changed: Context = {
        ...context,
        ...(change === "client"
          ? { client: new GuestApiClient("token-b") }
          : {}),
        ...(change === "visit"
          ? { session: { ...parked, valetSessionId: "visit-b" } }
          : {}),
        ...(change === "loading" ? { session: null } : {}),
        ...(change === "authority" ? { hasAuthority: false } : {}),
        ...(change === "lifecycle"
          ? { session: { ...parked, state: "REQUESTED" } }
          : {}),
      };
      await render(changed);
      expect(intent.isOpen).toBe(false);
      await act(async () => stale.confirm());
      expect(request).not.toHaveBeenCalled();
      await render(original);
      expect(intent.isOpen).toBe(false);
      await act(async () => stale.confirm());
      expect(request).not.toHaveBeenCalled();
      await act(async () => intent.open());
      expect(intent.isOpen).toBe(true);
      // A retained close/open handler cannot dismiss/replace the newer intent.
      await act(async () => {
        stale.close();
        stale.open();
      });
      expect(intent.isOpen).toBe(true);
      await act(async () => intent.confirm());
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["stale", "mutating"] as const)(
    "preserves the existing %s mutation gate",
    async (gate) => {
      await render();
      await act(async () => intent.open());
      const staleConfirm = intent.confirm;
      await render({
        ...context,
        isFresh: gate !== "stale",
        isMutating: gate === "mutating",
      });
      await act(async () => staleConfirm());
      expect(request).not.toHaveBeenCalled();
      expect(intent.isOpen).toBe(false);
    },
  );

  it("cannot confirm after unmount", async () => {
    await render();
    await act(async () => intent.open());
    const staleConfirm = intent.confirm;
    await act(async () => root.unmount());
    await act(async () => staleConfirm());
    expect(request).not.toHaveBeenCalled();
  });

  it("does not let a previous successful continuation close a reopened intent", async () => {
    let finish!: (value: boolean) => void;
    context = {
      ...context,
      requestVehicle: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    };
    await render();
    await act(async () => intent.open());
    let pending!: Promise<void>;
    await act(async () => {
      pending = intent.confirm();
    });
    await act(async () => intent.close());
    await act(async () => intent.open());
    await act(async () => {
      finish(true);
      await pending;
    });
    expect(intent.isOpen).toBe(true);
  });
});
