"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { PresenceCopyKey } from "./shift-presence-copy";

/** One foreground proposal; never stores, logs, saves or derives radius. */
export function useAttendanceZoneLocation(
  onCenter: (center: { lat: number; lng: number }) => void,
) {
  const generation = useRef({ ticket: 0 });
  const alive = useRef(false);
  const busy = useRef(false);
  const [state, setState] = useState<{
    locating: boolean;
    accuracy: number | null;
    message: PresenceCopyKey | null;
  }>({ locating: false, accuracy: null, message: null });
  useLayoutEffect(() => {
    alive.current = true;
    const lifetime = generation.current;
    lifetime.ticket++;
    const background = () => {
      if (document.visibilityState === "visible") return;
      lifetime.ticket++;
      busy.current = false;
      setState({ locating: false, accuracy: null, message: null });
    };
    document.addEventListener("visibilitychange", background);
    return () => {
      document.removeEventListener("visibilitychange", background);
      alive.current = false;
      lifetime.ticket++;
    };
  }, []);
  function locate() {
    if (
      !alive.current ||
      busy.current ||
      document.visibilityState !== "visible"
    )
      return;
    if (!window.isSecureContext || !navigator.geolocation) {
      setState({ locating: false, accuracy: null, message: "geoUnsupported" });
      return;
    }
    busy.current = true;
    const ticket = ++generation.current.ticket;
    const current = () =>
      alive.current &&
      generation.current.ticket === ticket &&
      document.visibilityState === "visible";
    setState({ locating: true, accuracy: null, message: null });
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!current()) return;
          busy.current = false;
          const { latitude: lat, longitude: lng, accuracy } = position.coords;
          if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            Math.abs(lat) > 90 ||
            Math.abs(lng) > 180
          ) {
            setState({
              locating: false,
              accuracy: null,
              message: "geoUnavailable",
            });
            return;
          }
          onCenter({ lat, lng });
          setState({
            locating: false,
            accuracy:
              Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
            message: null,
          });
        },
        (error) => {
          if (!current()) return;
          busy.current = false;
          setState({
            locating: false,
            accuracy: null,
            message:
              error.code === 1
                ? "geoDenied"
                : error.code === 3
                  ? "geoTimeout"
                  : "geoUnavailable",
          });
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
      );
    } catch {
      if (!current()) return;
      busy.current = false;
      setState({ locating: false, accuracy: null, message: "geoUnavailable" });
    }
  }
  function retire(clearFeedback = true) {
    generation.current.ticket++;
    busy.current = false;
    setState((value) =>
      clearFeedback
        ? { locating: false, accuracy: null, message: null }
        : { ...value, locating: false },
    );
  }
  return { ...state, locate, retire };
}
