import { useEffect, useState } from "react";
import { AppState } from "react-native";

import type { FoundationLocale } from "../foundation/foundation-locale";
import { formatNativeShiftDuration } from "../shift/native-shift-duration";

/** A scoped presentation refresh; persisted Shift time remains the only start. */
export function useNativeTaskShiftDuration(
  startedAt: string,
  locale: FoundationLocale,
): string {
  const [, setRefreshTime] = useState(Date.now);
  useEffect(() => {
    let active = AppState.currentState === "active";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.parse(startedAt);
    const stop = () => {
      clearTimeout(timer);
      timer = undefined;
    };
    const schedule = () => {
      if (!active) return;
      const elapsed = Number.isNaN(started)
        ? 0
        : Math.max(0, Date.now() - started);
      timer = setTimeout(
        () => {
          setRefreshTime(Date.now());
          schedule();
        },
        60_000 - (elapsed % 60_000),
      );
    };
    schedule();
    const subscription = AppState.addEventListener("change", (state) => {
      active = state === "active";
      stop();
      if (active) {
        setRefreshTime(Date.now());
        schedule();
      }
    });
    return () => {
      active = false;
      stop();
      subscription.remove();
    };
  }, [startedAt]);

  // Recompute on every render, including a new scope or locale, never elapsed++.
  return formatNativeShiftDuration(startedAt, locale);
}
