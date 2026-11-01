"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SharedRead {
  abortRevision: number;
  readonly controller: AbortController;
  consumers: number;
  readonly promise: Promise<unknown>;
}

const sharedReads = new Map<string, SharedRead>();

function acquireRead<T>(
  requestKey: string,
  load: (signal: AbortSignal) => Promise<T>,
): { readonly promise: Promise<T>; readonly release: () => void } {
  let entry = sharedReads.get(requestKey);
  if (entry === undefined) {
    const controller = new AbortController();
    entry = {
      abortRevision: 0,
      controller,
      consumers: 0,
      promise: load(controller.signal),
    };
    sharedReads.set(requestKey, entry);
  }
  entry.consumers += 1;
  entry.abortRevision += 1;
  const acquired = entry;
  return {
    promise: acquired.promise as Promise<T>,
    release: () => {
      acquired.consumers -= 1;
      const abortRevision = ++acquired.abortRevision;
      queueMicrotask(() => {
        if (
          sharedReads.get(requestKey) === acquired &&
          acquired.consumers === 0 &&
          acquired.abortRevision === abortRevision
        ) {
          acquired.controller.abort();
          sharedReads.delete(requestKey);
        }
      });
    },
  };
}

export interface AuthoritativeReadState<T> {
  readonly data: T | null;
  readonly error: Error | null;
  readonly loading: boolean;
  readonly replace: (data: T) => void;
  readonly refresh: () => void;
}

export function useAuthoritativeRead<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
  enabled = true,
  retainDataOnError = false,
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
    baseKey: "",
    data: null,
    error: null,
    requestKey: "",
  });

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    let disposed = false;
    if (!enabled) return;
    const read = acquireRead(requestKey, load);
    void read.promise.then(
      (data) => {
        if (!disposed && generation === generationRef.current) {
          setState({ baseKey: key, data, error: null, requestKey });
        }
      },
      (reason: unknown) => {
        if (disposed || generation !== generationRef.current) return;
        setState((previous) => ({
          baseKey: key,
          data:
            retainDataOnError && previous.baseKey === key
              ? previous.data
              : null,
          error:
            reason instanceof Error ? reason : new Error("Request failed."),
          requestKey,
        }));
      },
    );
    return () => {
      disposed = true;
      read.release();
    };
  }, [enabled, key, load, requestKey, retainDataOnError]);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const replace = useCallback(
    (data: T) => setState({ baseKey: key, data, error: null, requestKey }),
    [key, requestKey],
  );
  if (!enabled)
    return { data: null, error: null, loading: false, refresh, replace };
  if (state.requestKey !== requestKey) {
    if (state.baseKey === key) {
      return { data: state.data, error: null, loading: true, refresh, replace };
    }
    return { data: null, error: null, loading: true, refresh, replace };
  }
  return {
    data: state.data,
    error: state.error,
    loading: false,
    refresh,
    replace,
  };
}
