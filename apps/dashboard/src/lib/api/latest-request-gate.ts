import { DashboardApiError } from "./api-error";

/**
 * Latest-request-wins loader core for single-shot dashboard reads.
 *
 * The subtle location/period race rules live here (framework-free, directly
 * unit-testable) instead of inside React effects:
 *
 * - every `load(identity)` bumps a monotonic sequence, aborts any in-flight
 *   request and commits a LOADING snapshot whose data is null, so stale data
 *   from the previous identity is cleared immediately and can never be shown
 *   under a new selected location or period;
 * - a response is committed only while its sequence is still current and the
 *   gate was not disposed — a late Location A / old-period response is
 *   dropped silently;
 * - rejections are normalized into DashboardApiError; aborts caused by a
 *   superseding load are never surfaced as errors;
 * - `retry()` re-runs exactly the last requested identity.
 */

export type LatestRequestPhase = "idle" | "loading" | "ready" | "error";

/**
 * Discriminated by phase: `data` is non-null ONLY while ready and `error`
 * is non-null ONLY while errored, so consumers get honest compile-time
 * narrowing instead of null-guarding every render branch.
 */
export type LatestRequestSnapshot<T> =
  | { readonly phase: "idle"; readonly data: null; readonly error: null }
  | { readonly phase: "loading"; readonly data: null; readonly error: null }
  | { readonly phase: "ready"; readonly data: T; readonly error: null }
  | {
      readonly phase: "error";
      readonly data: null;
      readonly error: DashboardApiError;
    };

export function idleLatestRequestSnapshot<T>(): LatestRequestSnapshot<T> {
  return { phase: "idle", data: null, error: null };
}

export interface LatestRequestGateOptions<T> {
  fetcher: (identity: readonly string[], signal: AbortSignal) => Promise<T>;
  onChange: (snapshot: LatestRequestSnapshot<T>) => void;
  /**
   * Diagnostic code used when a non-DashboardApiError value is thrown.
   * DashboardApiError instances always pass through unchanged.
   */
  unexpectedErrorCode?: string | undefined;
}

export interface LatestRequestGate {
  load: (identity: readonly string[]) => void;
  retry: () => void;
  dispose: () => void;
}

function defaultUnexpectedError(code: string): DashboardApiError {
  return new DashboardApiError({
    kind: "server",
    status: 0,
    code,
    message: "The request failed for an unexpected reason.",
  });
}

export function createLatestRequestGate<T>(
  options: LatestRequestGateOptions<T>,
): LatestRequestGate {
  let sequence = 0;
  let disposed = false;
  let inflight: AbortController | null = null;
  let lastIdentity: readonly string[] | null = null;

  const normalizeError = (error: unknown): DashboardApiError => {
    if (error instanceof DashboardApiError) return error;
    return defaultUnexpectedError(
      options.unexpectedErrorCode ?? "UNEXPECTED_REQUEST_FAILURE",
    );
  };

  const abortInflight = (): void => {
    if (inflight !== null) {
      inflight.abort();
      inflight = null;
    }
  };

  const isCurrentAttempt = (
    attempt: number,
    controller: AbortController,
  ): boolean =>
    !disposed && attempt === sequence && !controller.signal.aborted;

  const load = (identity: readonly string[]): void => {
    if (disposed) return;
    sequence += 1;
    lastIdentity = [...identity];
    abortInflight();
    const controller = new AbortController();
    inflight = controller;
    const attempt = sequence;
    // Old identity data is dropped HERE, synchronously, so a location or
    // period switch can never keep rendering previous facts.
    options.onChange({ phase: "loading", data: null, error: null });
    void options
      .fetcher(lastIdentity, controller.signal)
      .then(
        (data: T): void => {
          if (!isCurrentAttempt(attempt, controller)) return;
          inflight = null;
          options.onChange({ phase: "ready", data, error: null });
        },
        (error: unknown): void => {
          if (!isCurrentAttempt(attempt, controller)) return;
          inflight = null;
          options.onChange({
            phase: "error",
            data: null,
            error: normalizeError(error),
          });
        },
      );
  };

  return {
    load,
    retry: (): void => {
      if (disposed || lastIdentity === null) return;
      load(lastIdentity);
    },
    dispose: (): void => {
      disposed = true;
      abortInflight();
    },
  };
}
