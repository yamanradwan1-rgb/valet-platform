import { useCallback, useEffect, useRef, useState } from "react";

import { AndroidBatteryOptimizationAdapter } from "./native-battery-platform";
import { NativeBatteryStatusOwner } from "./native-battery-status";

export function useNativeBatteryStatus(enabled: boolean, authGeneration: number) {
  const [owner] = useState(
    () => new NativeBatteryStatusOwner(new AndroidBatteryOptimizationAdapter()),
  );
  const [status, setStatus] = useState(owner.current);
  const actualForeground = useRef(false);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    // Keep the production AppState listener stable across login/workspace changes.
    enabledRef.current = enabled;
  }, [enabled]);

  const onAppActive = useCallback((foreground: boolean) => {
    actualForeground.current = foreground;
    owner.setForeground(foreground && enabledRef.current);
  }, [owner]);

  useEffect(() => {
    const unsubscribe = owner.subscribe(setStatus);
    owner.start(false);
    return () => {
      unsubscribe();
      owner.dispose();
    };
  }, [owner]);

  useEffect(() => {
    // Auth generation/workspace changes fence any response from the prior actor.
    owner.setForeground(false);
    owner.setForeground(enabled && actualForeground.current);
  }, [enabled, authGeneration, owner]);

  return { status, onAppActive, openSettings: () => owner.openSettings() } as const;
}
