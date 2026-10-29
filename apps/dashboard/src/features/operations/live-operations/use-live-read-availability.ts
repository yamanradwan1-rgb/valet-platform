"use client";

import { useEffect, useRef, useState } from "react";

// One bounded refresh on returning to a usable foreground state. No polling.
export function useLiveReadAvailability() {
  const [available, setAvailable] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [resumeRevision, setResumeRevision] = useState(0);
  const wasAvailable = useRef(false);
  const lostFocus = useRef(false);

  useEffect(() => {
    const update = () => {
      const next = document.visibilityState === "visible" && navigator.onLine;
      if (next && !wasAvailable.current) {
        setResumeRevision((revision) => revision + 1);
        lostFocus.current = false;
      }
      wasAvailable.current = next;
      setAvailable(next);
      setInitialized(true);
    };
    const onBlur = () => {
      lostFocus.current = true;
    };
    const onFocus = () => {
      const refreshForFocus = lostFocus.current && wasAvailable.current;
      update();
      if (refreshForFocus && wasAvailable.current) {
        setResumeRevision((revision) => revision + 1);
      }
      lostFocus.current = false;
    };
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return { available, initialized, resumeRevision };
}
