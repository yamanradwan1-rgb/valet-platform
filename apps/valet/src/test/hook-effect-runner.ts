import React from "react";

export interface HookHarness<TProps, TResult> {
  readonly current: TResult;
  readonly rerender: (newProps?: TProps) => void;
  readonly unmount: () => void;
}

interface EffectEntry {
  effect: () => void | (() => void);
  deps?: unknown[] | undefined;
  cleanup?: (() => void) | undefined;
  shouldRun: boolean;
}

interface MemoEntry {
  value: unknown;
  deps?: unknown[] | undefined;
}

interface ReactInternalDispatcher {
  H?: Record<string, unknown>;
}

export function renderHookWithEffects<TProps, TResult>(
  hookFn: (props: TProps) => TResult,
  initialProps: TProps,
): HookHarness<TProps, TResult> {
  let currentProps = initialProps;
  let result: TResult;

  let stateIndex = 0;
  const states: unknown[] = [];
  const stateSetters: Array<(val: unknown) => void> = [];

  let effectIndex = 0;
  const effects: EffectEntry[] = [];

  let memoIndex = 0;
  const memos: MemoEntry[] = [];

  let refIndex = 0;
  const refs: Array<{ current: unknown }> = [];

  const customDispatcher = {
    useState: (initial: unknown) => {
      const idx = stateIndex++;
      if (states.length <= idx) {
        states[idx] =
          typeof initial === "function"
            ? (initial as () => unknown)()
            : initial;
        stateSetters[idx] = (newVal: unknown) => {
          states[idx] =
            typeof newVal === "function"
              ? (newVal as (prev: unknown) => unknown)(states[idx])
              : newVal;
        };
      }
      return [states[idx], stateSetters[idx]];
    },
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      const idx = effectIndex++;
      const prev = effects[idx];
      const hasChanged =
        !prev ||
        !deps ||
        !prev.deps ||
        deps.length !== prev.deps.length ||
        deps.some((d, i) => !Object.is(d, prev.deps?.[i]));

      if (hasChanged) {
        effects[idx] = {
          effect,
          deps,
          cleanup: prev?.cleanup,
          shouldRun: true,
        };
      } else {
        effects[idx] = {
          effect,
          deps,
          cleanup: prev?.cleanup,
          shouldRun: false,
        };
      }
    },
    useMemo: (factory: () => unknown, deps?: unknown[]) => {
      const idx = memoIndex++;
      const prev = memos[idx];
      const hasChanged =
        !prev ||
        !deps ||
        !prev.deps ||
        deps.length !== prev.deps.length ||
        deps.some((d, i) => !Object.is(d, prev.deps?.[i]));

      if (hasChanged) {
        memos[idx] = { value: factory(), deps };
      }
      return memos[idx]!.value;
    },
    useRef: (initial: unknown) => {
      const idx = refIndex++;
      if (refs.length <= idx) {
        refs[idx] = { current: initial };
      }
      return refs[idx];
    },
    useCallback: (fn: unknown, deps?: unknown[]) => {
      const idx = memoIndex++;
      const prev = memos[idx];
      const hasChanged =
        !prev ||
        !deps ||
        !prev.deps ||
        deps.length !== prev.deps.length ||
        deps.some((d, i) => !Object.is(d, prev.deps?.[i]));

      if (hasChanged) {
        memos[idx] = { value: fn, deps };
      }
      return memos[idx]!.value;
    },
    useContext: (ctx: { _currentValue?: unknown }) => {
      return ctx._currentValue ?? null;
    },
  };

  const internals = (
    React as unknown as {
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: ReactInternalDispatcher;
    }
  ).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const originalDispatcher = internals?.H;

  const runRender = () => {
    stateIndex = 0;
    effectIndex = 0;
    memoIndex = 0;
    refIndex = 0;

    if (internals) {
      internals.H = customDispatcher;
    }

    try {
      result = hookFn(currentProps);
    } finally {
      if (internals && originalDispatcher) {
        internals.H = originalDispatcher;
      }
    }

    // Execute effect callbacks whose deps changed
    for (let i = 0; i < effects.length; i++) {
      const entry = effects[i];
      if (entry && entry.shouldRun) {
        entry.shouldRun = false;
        if (entry.cleanup) {
          entry.cleanup();
          entry.cleanup = undefined;
        }
        const cleanup = entry.effect();
        if (typeof cleanup === "function") {
          entry.cleanup = cleanup;
        }
      }
    }
  };

  runRender();

  return {
    get current() {
      return result;
    },
    rerender: (newProps?: TProps) => {
      if (newProps !== undefined) {
        currentProps = newProps;
      }
      runRender();
    },
    unmount: () => {
      for (const entry of effects) {
        if (entry?.cleanup) {
          entry.cleanup();
          entry.cleanup = undefined;
        }
      }
    },
  };
}
