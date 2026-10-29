"use client";

import { useEffect, useRef, useState } from "react";

// One bounded refresh on becoming foreground/online. No timer or shared cache.
export function useLiveReadAvailability() {
  const [available, setAvailable] = useState(false);
  const [resumeRevision, setResumeRevision] = useState(0);
  const wasAvailable = useRef(false);

  useEffect(() => {
    const update = () => {
      const next = document.visibilityState === "visible" && navigator.onLine;
      if (next && !wasAvailable.current) {
        setResumeRevision((revision) => revision + 1);
      }
      wasAvailable.current = next;
      setAvailable(next);
    };
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return { available, resumeRevision };
}
