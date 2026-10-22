"use client";

import { useCallback, useState, type SetStateAction } from "react";

export interface RevisionedDraft<T> {
  readonly revision: number;
  readonly value: T;
  readonly savedValue: T;
}

export function reconcilePersistedDraft<T>(
  local: RevisionedDraft<T>, persisted: Omit<RevisionedDraft<T>, "savedValue">,
  keepUnsavedOnConflict = false,
): RevisionedDraft<T> {
  if (local.revision === persisted.revision) return local;
  const dirty = JSON.stringify(local.value) !== JSON.stringify(local.savedValue);
  return {
    revision: persisted.revision,
    value: keepUnsavedOnConflict && dirty ? local.value : persisted.value,
    savedValue: persisted.value,
  };
}

// Keep an unsaved draft during ordinary re-renders and locale switches. When
// the server acknowledges a new revision, adopt its canonicalized values.
export function useRevisionedDraft<T>(
  revision: number, value: T, keepUnsavedOnConflict = false,
) {
  const [state, setState] = useState<RevisionedDraft<T>>(() => ({
    revision, value, savedValue: value,
  }));
  if (state.revision !== revision) {
    // React re-renders this component before passing the stale draft to its
    // descendants. A revision change represents committed server data.
    setState(reconcilePersistedDraft(state, { revision, value }, keepUnsavedOnConflict));
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
