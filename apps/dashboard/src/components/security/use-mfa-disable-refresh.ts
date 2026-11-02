"use client";

import { useEffect, useRef, type RefObject } from "react";

// Cross-tab notification carries no identity, factor, proof or security status.
export function useMfaDisableRefresh(
  enabled: boolean,
  busy: RefObject<boolean>,
  refresh: () => Promise<void>,
) {
  const channel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      if (!busy.current && document.visibilityState === "visible")
        void refresh();
    };
    const visibility = () => {
      if (document.visibilityState === "visible") check();
    };
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel.current = new BroadcastChannel("vaylet-account-mfa");
        channel.current.onmessage = check;
      }
    } catch {
      /* Optional attention; focus/read and backend remain authoritative. */
    }
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", visibility);
      channel.current?.close();
      channel.current = null;
    };
  }, [busy, enabled, refresh]);
  return () => {
    try {
      if (channel.current) channel.current.postMessage("MFA_CHANGED");
      else if (typeof BroadcastChannel !== "undefined") {
        const signal = new BroadcastChannel("vaylet-account-mfa");
        signal.postMessage("MFA_CHANGED");
        signal.close();
      }
    } catch {
      /* No authority or proof is carried by this optional signal. */
    }
  };
}
