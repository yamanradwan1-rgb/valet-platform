"use client";

import { useLayoutEffect, useRef } from "react";
import { useAttendanceZoneLocation } from "../../../settings/use-attendance-zone-location";

/** A scope change retires any outstanding one-shot callback before it can edit a new draft. */
export function usePoliciesStudioZoneLocation(
  scopeKey: string,
  onCenter: (center: { lat: number; lng: number }) => void,
) {
  const callback = useRef(onCenter);
  useLayoutEffect(() => {
    callback.current = onCenter;
  }, [onCenter]);
  const location = useAttendanceZoneLocation((center) => callback.current(center));
  const retire = useRef(location.retire);
  useLayoutEffect(() => { retire.current = location.retire; }, [location.retire]);
  const previousScope = useRef(scopeKey);
  useLayoutEffect(() => {
    if (previousScope.current === scopeKey) return;
    previousScope.current = scopeKey;
    retire.current();
  }, [scopeKey]);
  return location;
}
