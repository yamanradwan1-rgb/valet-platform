"use client";

import { useEffect, useRef, useState } from "react";
import { SYNTHETIC_INCIDENT_TARGET_ID } from "./types";

export function useSyntheticDestinationHashRestore(
  open: boolean,
  geometryReady: boolean,
  hasAvailableDestination: boolean,
  onOpenChange: (open: boolean) => void,
) {
  const initialHashChecked = useRef(false);
  const pendingFocus = useRef(false);
  const openedFromHash = useRef(false);
  const lastHandledHash = useRef<string | null>(null);
  const wasOpen = useRef(open);
  const [focusRequestVersion, setFocusRequestVersion] = useState(0);

  useEffect(() => {
    if (wasOpen.current && !open) {
      pendingFocus.current = false;
      openedFromHash.current = false;
    }
    wasOpen.current = open;

    function restoreFromHistory() {
      const currentHash = window.location.hash;
      if (lastHandledHash.current === currentHash) return;
      lastHandledHash.current = currentHash;
      const matchesTarget = currentHash === `#${SYNTHETIC_INCIDENT_TARGET_ID}`;
      if (matchesTarget) {
        pendingFocus.current = true;
        setFocusRequestVersion((version) => version + 1);
        if (!open) {
          openedFromHash.current = true;
          onOpenChange(true);
        }
        return;
      }

      pendingFocus.current = false;
      if (openedFromHash.current) {
        openedFromHash.current = false;
        onOpenChange(false);
      }
    }

    window.addEventListener("hashchange", restoreFromHistory);
    window.addEventListener("popstate", restoreFromHistory);
    if (!initialHashChecked.current) {
      initialHashChecked.current = true;
      restoreFromHistory();
    }
    return () => {
      window.removeEventListener("hashchange", restoreFromHistory);
      window.removeEventListener("popstate", restoreFromHistory);
    };
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!pendingFocus.current || !open || !geometryReady || !hasAvailableDestination) return;
    const target = document.getElementById(SYNTHETIC_INCIDENT_TARGET_ID);
    if (!target) return;
    pendingFocus.current = false;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ behavior: "auto", block: "nearest" });
  }, [open, geometryReady, hasAvailableDestination, focusRequestVersion]);
}
