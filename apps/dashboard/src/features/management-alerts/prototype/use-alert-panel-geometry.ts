"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

import type { Locale } from "./types";

export interface AlertPanelGeometry {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly maxHeight: number;
}

export function useAlertPanelGeometry(
  open: boolean,
  anchorRef: RefObject<HTMLButtonElement | null>,
  locale: Locale,
): { readonly geometry: AlertPanelGeometry | null; readonly resetGeometry: () => void } {
  const [geometry, setGeometry] = useState<AlertPanelGeometry | null>(null);
  const resetGeometry = useCallback(() => setGeometry(null), []);

  useEffect(() => {
    if (!open) return;
    function fitPanelToViewport() {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const inset = 16;
      const gap = 8;
      const width = Math.max(0, Math.min(416, viewportWidth - inset * 2));
      const below = Math.max(0, viewportTop + viewportHeight - anchor.bottom - gap - inset);
      const above = Math.max(0, anchor.top - viewportTop - gap - inset);
      const placeAbove = below < Math.min(280, above) && above > below;
      const available = placeAbove ? above : below;
      const maxHeight = Math.floor(Math.min(544, viewportHeight * 0.72, available));
      const preferredLeft = locale === "ar" ? anchor.left : anchor.right - width;
      const left = Math.min(
        Math.max(preferredLeft, viewportLeft + inset),
        viewportLeft + viewportWidth - width - inset,
      );
      const top = placeAbove
        ? Math.max(viewportTop + inset, anchor.top - maxHeight - gap)
        : anchor.bottom + gap;
      setGeometry({ left, top, width, maxHeight });
    }
    const frame = window.requestAnimationFrame(fitPanelToViewport);
    window.addEventListener("resize", fitPanelToViewport);
    window.addEventListener("scroll", fitPanelToViewport, true);
    window.visualViewport?.addEventListener("resize", fitPanelToViewport);
    window.visualViewport?.addEventListener("scroll", fitPanelToViewport);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", fitPanelToViewport);
      window.removeEventListener("scroll", fitPanelToViewport, true);
      window.visualViewport?.removeEventListener("resize", fitPanelToViewport);
      window.visualViewport?.removeEventListener("scroll", fitPanelToViewport);
    };
  }, [open, anchorRef, locale]);

  return { geometry: open ? geometry : null, resetGeometry };
}
