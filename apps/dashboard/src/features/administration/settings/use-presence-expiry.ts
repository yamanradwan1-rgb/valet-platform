"use client";

import { useEffect, useRef, useState } from "react";

/** Advisory only: one canonical refresh at each displayed pending deadline. */
export function usePresenceExpiry(
  deadlines: readonly string[],
  refresh: () => void,
) {
  const [now, setNow] = useState(() => Date.now());
  const refreshed = useRef(new Set<number>());
  const key = deadlines.join("|");
  useEffect(() => {
    const current = Date.now();
    const pending = key
      .split("|")
      .map(Date.parse)
      .filter((time) => Number.isFinite(time) && !refreshed.current.has(time));
    if (!pending.length) return;
    const deadline = Math.min(...pending);
    const delay = Math.max(0, deadline - current);
    const timer = window.setTimeout(
      () => {
        if (Date.now() < deadline) return;
        pending
          .filter((time) => time <= Date.now())
          .forEach((time) => refreshed.current.add(time));
        setNow(Date.now());
        refresh();
      },
      Math.min(delay + 1, 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [key, refresh, now]);
  useEffect(() => {
    const foreground = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    window.addEventListener("focus", foreground);
    document.addEventListener("visibilitychange", foreground);
    return () => {
      window.removeEventListener("focus", foreground);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, []);
  return now;
}
