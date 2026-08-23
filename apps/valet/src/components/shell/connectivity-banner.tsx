"use client";

import { useEffect, useRef, useState, type JSX } from "react";

export interface ConnectivityBannerProps {
  /** Called once when connectivity is restored, for safe revalidation. */
  readonly onReconnect?: (() => void) | undefined;
  /** Test/SSR override of navigator.onLine. Undefined = browser-driven. */
  readonly onlineOverride?: boolean | undefined;
}

function useBrowserOnline(): boolean {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const goOffline = () => setOnline(false);
    const goOnline = () => {
      setOnline(true);
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  return online !== false;
}

/**
 * DEC-058 §7: truthful connectivity HINT only. Never claims actions were
 * queued, will auto-sync, or that the server is healthy because the browser
 * reports online again. Reconnect triggers existing authoritative
 * revalidation; it never marks any operation successful.
 */
export function ConnectivityBanner({
  onReconnect,
  onlineOverride,
}: ConnectivityBannerProps): JSX.Element | null {
  const browserOnline = useBrowserOnline();
  const online = onlineOverride ?? browserOnline;
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOfflineRef.current = true;
      return;
    }
    if (wasOfflineRef.current) {
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
      No network connection. Reconnect to refresh and continue.
    </div>
  );
}

