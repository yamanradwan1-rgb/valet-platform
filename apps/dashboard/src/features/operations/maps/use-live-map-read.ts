"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  LiveMapRefreshOwner,
  type LiveMapRefreshState,
} from "./live-map-refresh-owner";

export interface LiveMapReadState<T> extends LiveMapRefreshState<T> {
  readonly refresh: () => Promise<void>;
}

const emptyState = { data: null, error: null, loading: false } as const;

export function useLiveMapRead<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  enabled: boolean,
): LiveMapReadState<T> {
  const owner = useRef<LiveMapRefreshOwner<T> | null>(null);
  const [state, setState] = useState<{
    readonly key: string;
    readonly value: LiveMapRefreshState<T>;
  }>({ key: "", value: emptyState });

  useEffect(() => {
    const current = new LiveMapRefreshOwner<T>({
      load,
      onState: (value) => setState({ key, value }),
    });
    owner.current = current;
    const visible = document.visibilityState === "visible";
    current.setVisible(visible);
    current.setActive(enabled);
    const onVisibility = () => {
      current.setVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      current.dispose();
      if (owner.current === current) owner.current = null;
    };
  }, [enabled, key, load]);

  const refresh = useCallback(
    () => owner.current?.refresh() ?? Promise.resolve(),
    [],
  );
  const current = state.key === key ? state.value : emptyState;
  return enabled ? { ...current, refresh } : { ...emptyState, refresh };
}
