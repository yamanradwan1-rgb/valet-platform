"use client";

import { useCallback, useState, type SetStateAction } from "react";

export interface RevisionedDraft<T> {
  readonly revision: number;
  readonly value: T;
}

export function reconcilePersistedDraft<T>(
  local: RevisionedDraft<T>, persisted: RevisionedDraft<T>,
): RevisionedDraft<T> {
  return local.revision === persisted.revision ? local : persisted;
}

// Keep an unsaved draft during ordinary re-renders and locale switches. When
// the server acknowledges a new revision, adopt its canonicalized values.
export function useRevisionedDraft<T>(revision: number, value: T) {
  const [state, setState] = useState<RevisionedDraft<T>>(() => ({ revision, value }));
  if (state.revision !== revision) {
    // React re-renders this component before passing the stale draft to its
    // descendants. A revision change represents committed server data.
    setState(reconcilePersistedDraft(state, { revision, value }));
  }
  const update = useCallback((next: SetStateAction<T>) => {
    setState((current) => ({
      ...current,
      value: typeof next === "function"
        ? (next as (current: T) => T)(current.value) : next,
    }));
  }, []);
  return [state.value, update] as const;
}
