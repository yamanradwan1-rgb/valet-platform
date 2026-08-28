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
    (element) =>
      !element.hasAttribute("hidden") && element.offsetParent !== null,
  );
}

export function useNavigationDrawerA11y({
  panelRef,
  triggerRef,
  mainRef,
  shouldRestoreFocus,
  onEscape,
}: {
  panelRef: RefObject<HTMLElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  mainRef: RefObject<HTMLElement | null>;
  shouldRestoreFocus: () => boolean;
  onEscape: () => void;
}): void {
  const escapeRef = useRef(onEscape);
  useEffect(() => {
    escapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    const main = mainRef.current;
    const shell = document.querySelector<HTMLElement>(".dashboard-shell");
    const previousInert = shell?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    if (shell !== null) shell.inert = true;
    document.body.style.overflow = "hidden";
    (tabbables(panel ?? document.body)[0] ?? panel)?.focus();

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        escapeRef.current();
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
      if (shell !== null) shell.inert = previousInert;
      document.body.style.overflow = previousOverflow;
      if (shouldRestoreFocus() && trigger?.isConnected) {
        trigger.focus();
      } else if (panel?.contains(document.activeElement) && main?.isConnected) {
        main.focus();
      }
    };
  }, [mainRef, panelRef, shouldRestoreFocus, triggerRef]);
}
