"use client";
import { useLayoutEffect, type RefObject } from "react";

/** Restore focus after MFA/context reads without taking it from another dialog. */
export function usePresenceDialogFocus<T extends HTMLElement>(
  anchor: RefObject<T | null>,
  blocked: boolean,
) {
  useLayoutEffect(() => {
    if (blocked) return;
    let retired = false;
    queueMicrotask(() => {
      const dialog = anchor.current?.closest<HTMLElement>('[role="dialog"]');
      const top = Array.from(document.querySelectorAll('[role="dialog"]')).at(
        -1,
      );
      if (
        retired ||
        !dialog ||
        top !== dialog ||
        dialog.contains(document.activeElement)
      )
        return;
      const first = dialog.querySelector<HTMLElement>(
        "input:not([disabled]),button:not([disabled]),select:not([disabled])",
      );
      (first ?? dialog).focus();
    });
    return () => {
      retired = true;
    };
  }, [anchor, blocked]);
}
