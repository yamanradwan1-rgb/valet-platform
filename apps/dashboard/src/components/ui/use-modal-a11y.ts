"use client";

import { useEffect, useRef, type RefObject } from "react";

const TABBABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function tabbables(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (element) => !element.hasAttribute("hidden") && element.offsetParent !== null,
  );
}

/** Generic focus, keyboard and inertness lifecycle for portalled Dashboard modals. */
export function useModalA11y(
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialFocus?: RefObject<HTMLElement | null>,
): void {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const app = document.querySelector<HTMLElement>(".dashboard-shell");
    const previousInert = app?.inert ?? false;
    if (app !== null) app.inert = true;
    const focusTarget = initialFocus?.current ?? tabbables(panel ?? document.body)[0] ?? panel;
    focusTarget?.focus();

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || panel === null) return;
      const targets = tabbables(panel);
      if (targets.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = targets[0]!;
      const last = targets.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (app !== null) app.inert = previousInert;
      if (opener?.isConnected) opener.focus();
    };
  }, [initialFocus, panelRef]);
}
