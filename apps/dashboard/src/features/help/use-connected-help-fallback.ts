"use client";

import { useMemo, type RefObject } from "react";

// Fallback is resolved during cleanup so a departed route never receives focus.
export function useConnectedHelpFallback(): RefObject<HTMLElement | null> {
  return useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        if (typeof document === "undefined") return null;
        const candidates = document.querySelectorAll<HTMLElement>(
          ".topbar button:not([disabled]), main button:not([disabled]), " +
          "main input:not([disabled])",
        );
        return Array.from(candidates).find((element) => {
          if (!element.isConnected || element.tabIndex < 0 ||
              element.closest('[inert], [aria-hidden="true"]')) return false;
          const style = window.getComputedStyle(element);
          return style.display !== "none" && style.visibility === "visible" &&
            style.opacity !== "0" && element.getClientRects().length > 0;
        }) ?? null;
      },
    }),
    [],
  );
}
