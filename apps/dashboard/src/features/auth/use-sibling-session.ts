"use client";

import { useEffect } from "react";

import { computeRefreshDelayMs } from "./access-schedule";
import { subscribeSessionEvents } from "./cross-tab-session";
import { reduceSiblingEvent } from "./sibling-session";
import {
  clearRefreshTimer,
  clearStaffSession,
  getStaffSession,
  getStaffSessionClaimedAtMs,
  scheduleProactiveRefresh,
  setStaffSession,
  triggerStaffRefresh,
  type StaffSessionView,
} from "./auth-runtime";

/**
 * Reaction policy for session events published by sibling tabs.
 *
 * Owns everything that happens when this tab RECEIVES coordination traffic:
 * freshness/dominance decisions (pure, in `reduceSiblingEvent`) plus the
 * state updates they drive here — adopting a sibling rotation preserves THIS
 * tab's principal view (the wire carries no identity facts), while
 * ended/replaced events tear the local UI session down truthfully. Arrival
 * order is never trusted.
 *
 * Structural teardown guarantee: every end-local path flips the provider
 * status away from `authenticated`, which unmounts the entire authenticated
 * subtree (LocationProvider and all feature data) without any feature-level
 * listener.
 */
export function useSiblingSessionEvents(callbacks: {
  setSession: (session: StaffSessionView | null) => void;
  setStatus: (status: "authenticated" | "unauthenticated" | "expired" | "restoring") => void;
}): void {
  const { setSession, setStatus } = callbacks;

  useEffect(
    () =>
      subscribeSessionEvents((event) => {
        const current = getStaffSession();
        const resolution = reduceSiblingEvent({
          claimedAtMs: getStaffSessionClaimedAtMs(),
          currentAccessExpiresAtMs:
            current === null ? null : Date.parse(current.accessExpiresAt),
          event,
          hasLiveSession: current !== null,
          nowMs: Date.now(),
        });
        if (resolution.action === "ignore") return;
        if (resolution.action === "end-local") {
          clearRefreshTimer();
          clearStaffSession();
          setSession(null);
          setStatus(resolution.status);
          return;
        }
        // Adoption keeps THIS tab's principal view (known login email or the
        // neutral post-reload unknown); it is never taken from the wire.
        const view: StaffSessionView = {
          email: current?.email ?? "",
          accessExpiresAt: resolution.accessExpiresAt,
          sessionExpiresAt: resolution.sessionExpiresAt,
        };
        setStaffSession(view, resolution.accessToken);
        setSession(view);
        scheduleProactiveRefresh(
          computeRefreshDelayMs(Date.now(), Date.parse(view.accessExpiresAt)),
          () => void triggerStaffRefresh(),
        );
      }),
    [setSession, setStatus],
  );
}
