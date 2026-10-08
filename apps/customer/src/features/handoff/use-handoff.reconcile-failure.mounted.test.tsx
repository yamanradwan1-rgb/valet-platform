import React, { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { installTestDom } from "../../app/guest-refresh-mounted.test-host";
import { GuestApiError } from "../../lib/api/api-error";
import type { GuestApiClient } from "../../lib/api/guest-api-client";
import type {
  GuestHandoffMaterial,
  GuestSafeSession,
} from "../../lib/api/guest-api-types";
import {
  GuestRequestCoordinator,
  type GuestCoordinatorState,
} from "../session/guest-request-coordinator";
import { GuestSessionContext } from "../session/use-guest-session";

const auth = vi.hoisted(() => ({ client: null as GuestApiClient | null }));
vi.mock("../auth/guest-auth-context", () => ({
  useGuestAuth: () => ({ client: auth.client }),
}));
vi.mock("../../i18n/use-translation", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { useHandoff } from "./use-handoff";

const VISIT = "11111111-1111-4111-8111-111111111111";
const pending: GuestSafeSession = {
  valetSessionId: VISIT,
  state: "HANDOFF_PENDING",
  readyAt: null,
  vehicle: { make: "Toyota", model: "Camry", color: "White" },
};
const proof: GuestHandoffMaterial = {
  valetSessionId: VISIT,
  state: "HANDOFF_PENDING",
  method: "PICKUP_CODE",
  pickupCode: "1234",
  expiresAt: "2099-01-01T00:00:00.000Z",
};

describe("mounted handoff POST success / canonical GET failure", () => {
  let root: Root | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    auth.client = null;
    vi.unstubAllGlobals();
  });

  it("never resurrects a successful issue proof after reconciliation fails then GET recovers", async () => {
    const dom = installTestDom();
    const container = dom.document.createElement("div");
    dom.document.body.appendChild(container);

    const loadSession = vi.fn()
      .mockResolvedValueOnce(pending)
      .mockRejectedValueOnce(new GuestApiError({
        status: 503,
        code: "SERVICE_UNAVAILABLE",
        message: "Reconciliation temporarily unavailable",
      }))
      .mockResolvedValueOnce(pending);
    const issueHandoff = vi.fn().mockResolvedValue(proof);
    const rotateHandoff = vi.fn();
    const client = {
      loadSession, issueHandoff, rotateHandoff,
    } as unknown as GuestApiClient;
    auth.client = client;

    let publish: ((snapshot: GuestCoordinatorState) => void) | null = null;
    const coordinator = new GuestRequestCoordinator(
      client, (snapshot) => publish?.(snapshot), () => {},
    );
    const latest = { current: null as ReturnType<typeof useHandoff> | null };
    const displayed: Array<GuestHandoffMaterial | null> = [];

    function ProofProbe() {
      const state = useHandoff();
      latest.current = state;
      displayed.push(state.material);
      return null;
    }
    function MountedIntegration() {
      const [snapshot, setSnapshot] = useState(coordinator.snapshot);
      useEffect(() => {
        publish = setSnapshot;
        return () => { publish = null; };
      }, []);
      return (
        <GuestSessionContext.Provider value={{
          session: snapshot.session,
          isFresh: coordinator.isTrusted,
          isLoading: false,
          error: null,
          isNetworkError: false,
          failureKind: null,
          isExpired: snapshot.isExpired,
          isRefreshing: snapshot.isReading,
          isStale: !coordinator.isTrusted,
          isMutating: snapshot.isMutating,
          cooldownSeconds: 0,
          beginMutation: () => coordinator.beginMutation(),
          refreshSession: () => coordinator.read(),
          updateSession: (session) => coordinator.updateSession(session),
        }}>
          <ProofProbe />
        </GuestSessionContext.Provider>
      );
    }

    root = createRoot(container as unknown as Element);
    await act(async () => root?.render(<MountedIntegration />));
    await act(async () => { await coordinator.read(); });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await act(async () => { await Promise.resolve(); });
    }

    expect(issueHandoff).toHaveBeenCalledTimes(1);
    expect(loadSession).toHaveBeenCalledTimes(2);
    expect(coordinator.snapshot.session?.state).toBe("HANDOFF_PENDING");
    expect(coordinator.snapshot.error).toBeInstanceOf(GuestApiError);
    expect(coordinator.snapshot.lastAuthoritativeAt).toBeNull();
    expect(coordinator.isTrusted).toBe(false);
    expect(latest.current?.material).toBeNull();
    expect(displayed.every((value) => value === null)).toBe(true);

    await act(async () => { await coordinator.read(); });
    expect(loadSession).toHaveBeenCalledTimes(3);
    expect(coordinator.snapshot.error).toBeNull();
    expect(coordinator.isTrusted).toBe(true);
    expect(latest.current?.material).toBeNull();
    expect(displayed.every((value) => value === null)).toBe(true);
    expect(issueHandoff).toHaveBeenCalledTimes(1);
    expect(rotateHandoff).not.toHaveBeenCalled();
    coordinator.dispose();
  });
});
