"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface OperationsReadState<T> {
  readonly data: T | null;
  readonly error: Error | null;
  readonly loading: boolean;
  readonly refresh: () => void;
}

export function useOperationsRead<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  enabled = true,
): OperationsReadState<T> {
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const requestKey = `${key}:${revision}:${enabled ? "on" : "off"}`;
  const [state, setState] = useState<{
    readonly baseKey: string;
    readonly requestKey: string;
    readonly data: T | null;
    readonly error: Error | null;
  }>({ baseKey: "", requestKey: "", data: null, error: null });

  useEffect(() => {
    generation.current += 1;
    const current = generation.current;
    const controller = new AbortController();
    let disposed = false;
    if (!enabled) return () => controller.abort();
    void load(controller.signal).then(
      (data) => {
        if (!disposed && current === generation.current) {
          setState({ baseKey: key, requestKey, data, error: null });
        }
      },
      (reason: unknown) => {
        if (disposed || controller.signal.aborted || current !== generation.current) return;
        setState({
          baseKey: key,
          requestKey,
          data: null,
          error: reason instanceof Error ? reason : new Error("Request failed."),
        });
      },
    );
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [enabled, key, load, requestKey]);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  if (!enabled) return { data: null, error: null, loading: false, refresh };
  if (state.requestKey !== requestKey) {
    return {
      data: state.baseKey === key ? state.data : null,
      error: null,
      loading: true,
      refresh,
    };
  }
  return { data: state.data, error: state.error, loading: false, refresh };
}
