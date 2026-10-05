"use client";
import { useEffect } from "react";

/** A bounded read when the user returns; no polling or per-row requests. */
export function usePresenceForeground(refresh: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const foreground = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", foreground);
    document.addEventListener("visibilitychange", foreground);
    return () => {
      window.removeEventListener("focus", foreground);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, [refresh, enabled]);
}
