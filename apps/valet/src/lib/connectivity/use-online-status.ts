"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  window.addEventListener("offline", callback);
  window.addEventListener("online", callback);
  return () => {
    window.removeEventListener("offline", callback);
    window.removeEventListener("online", callback);
  };
}

const getSnapshot = (): boolean => navigator.onLine;
// Deterministic server snapshot: SSR never renders disabled-by-offline state.
const getServerSnapshot = (): boolean => true;

/**
 * Truthful browser connectivity hint per DEC-058 §7 / DEC-063. Online-only
 * Guest Access mutations disable their controls while this is false; it is a
 * hint, never proof that the server is reachable.
 */
export function useOnlineStatus(onlineOverride?: boolean | undefined): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) &&
    (onlineOverride ?? true);
}
