"use client";

import { useEffect, useRef, useSyncExternalStore, type JSX } from "react";

import { useEmployeeI18n } from "./employee-i18n";

export interface ConnectivityBannerProps {
  readonly onReconnect?: (() => void) | undefined;
  /** Test/SSR override of navigator.onLine. Undefined = browser-driven. */
  readonly onlineOverride?: boolean | undefined;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("offline", callback);
  window.addEventListener("online", callback);
  return () => {
    window.removeEventListener("offline", callback);
    window.removeEventListener("online", callback);
  };
}

const getSnapshot = (): boolean => navigator.onLine;
const getServerSnapshot = (): boolean => true;

/**
 * DEC-058 §7: truthful connectivity HINT only. Never claims actions were
 * queued, will auto-sync, or that the server is healthy because the browser
 * reports online again. Uses useSyncExternalStore so the initial mount reads
 * navigator.onLine immediately without a cascading-render effect.
 */
export function ConnectivityBanner({
  onReconnect,
  onlineOverride,
}: ConnectivityBannerProps): JSX.Element | null {
  const { t } = useEmployeeI18n();
  const browserOnline = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const online = onlineOverride ?? browserOnline;

  // Track offline→online transition to fire revalidation exactly once.
  const wasOfflineRef = useRef(false);
  useEffect(() => {
    if (online === false) {
      wasOfflineRef.current = true;
    } else if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      onReconnect?.();
    }
  }, [online, onReconnect]);

  if (online) return null;

  return (
    <div
      className="bg-vdanger text-white text-xs font-semibold text-center px-4 py-2"
      role="status"
    >
      {t.noNetworkMessage}
    </div>
  );
}
