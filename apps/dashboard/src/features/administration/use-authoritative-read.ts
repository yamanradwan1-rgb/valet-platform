"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AuthoritativeReadState<T> {
  readonly data: T | null;
  readonly error: Error | null;
  readonly loading: boolean;
  readonly refresh: () => void;
}

export function useAuthoritativeRead<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  enabled = true,
): AuthoritativeReadState<T> {
  const [revision, setRevision] = useState(0);
  const generationRef = useRef(0);
  const requestKey = `${key}:${revision}:${enabled ? "enabled" : "disabled"}`;
  const [state, setState] = useState<{
    baseKey: string;
    data: T | null;
    error: Error | null;
    requestKey: string;
  }>({
    baseKey: "", data: null, error: null, requestKey: "",
  });

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    const controller = new AbortController();
    let disposed = false;
    if (!enabled) return () => controller.abort();
    void load(controller.signal).then(
      (data) => {
        if (!disposed && generation === generationRef.current) {
          setState({ baseKey: key, data, error: null, requestKey });
        }
      },
      (reason: unknown) => {
        if (controller.signal.aborted || disposed || generation !== generationRef.current) return;
        setState({
          baseKey: key,
          data: null,
          error: reason instanceof Error ? reason : new Error("Request failed."),
          requestKey,
        });
      },
    );
    return () => { disposed = true; controller.abort(); };
  }, [enabled, key, load, requestKey]);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  if (!enabled) return { data: null, error: null, loading: false, refresh };
  if (state.requestKey !== requestKey) {
    if (state.baseKey === key) {
      return { data: state.data, error: null, loading: true, refresh };
    }
    return { data: null, error: null, loading: true, refresh };
  }
  return { data: state.data, error: state.error, loading: false, refresh };
}
