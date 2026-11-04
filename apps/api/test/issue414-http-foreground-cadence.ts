/**
 * Deterministic, simulated foreground browser tabs; no browser or PG calls.
 * A 60s nominal cadence is independent of the number of tabs. A bounded
 * 0–3s jitter and staggered tab phases approximate steady foreground polling.
 */
export type Issue414TabCohort = 25 | 100 | 200;
export type Issue414Audience = "CA" | "LM";

export interface PlannedForegroundGet {
  readonly tab: number;
  readonly cycle: 0 | 1;
  readonly audience: Issue414Audience;
  readonly dueMs: number;
  readonly measured: boolean;
}

export interface ForegroundGetResult<T> {
  readonly request: PlannedForegroundGet;
  readonly startedMs: number;
  readonly completedMs: number;
  readonly outcome:
    | { readonly kind: "ok"; readonly value: T }
    | { readonly kind: "error"; readonly reason: string };
}

export interface ForegroundGetSkipped {
  readonly request: PlannedForegroundGet;
  readonly reason: "IN_FLIGHT_SAME_TAB";
}

function jitter(tab: number, cycle: number, maxMs: number): number {
  if (maxMs === 0) return 0;
  const mixed =
    (Math.imul(tab + 1, 0x9e3779b1) ^ Math.imul(cycle + 1, 0x5f356495)) >>> 0;
  return mixed % (maxMs + 1);
}

export function planIssue414ForegroundGets(
  tabs: Issue414TabCohort,
  jitterMaxMs = 3000,
): PlannedForegroundGet[] {
  if (
    ![25, 100, 200].includes(tabs) ||
    !Number.isSafeInteger(jitterMaxMs) ||
    jitterMaxMs < 0 ||
    jitterMaxMs > 3000
  ) {
    throw new Error("Unsupported safe Issue414 foreground tab profile.");
  }
  const result: PlannedForegroundGet[] = [];
  for (const cycle of [0, 1] as const) {
    for (let tab = 0; tab < tabs; tab += 1) {
      // Spread initial tab phases over a 60-second window. Not a real
      // browser visibility/polling-controller simulation.
      const phaseMs = Math.floor(((tab + 0.5) * 60_000) / tabs);
      result.push({
        tab,
        cycle,
        audience: tab % 2 === 0 ? "CA" : "LM",
        dueMs: cycle * 60_000 + phaseMs + jitter(tab, cycle, jitterMaxMs),
        measured: cycle === 1,
      });
    }
  }
  return result.sort((a, b) => a.dueMs - b.dueMs || a.tab - b.tab);
}

/** Arithmetic offered rate, NEVER an observed capacity measurement. */
export function arithmeticIssue414GetsPerSecond(
  tabs: Issue414TabCohort,
): number {
  return tabs / 60;
}

/**
 * Scheduling and completion are separate. The same tab is never issued
 * another GET until its prior request settles; a missed tick is recorded,
 * never silently counted as a successful request.
 */
export async function dispatchIssue414ForegroundGets<T>(
  schedule: readonly PlannedForegroundGet[],
  clock: {
    readonly nowMs: () => number;
    readonly waitUntilMs: (dueMs: number) => Promise<void>;
  },
  execute: (request: PlannedForegroundGet) => Promise<T>,
): Promise<{
  readonly completed: ForegroundGetResult<T>[];
  readonly skipped: ForegroundGetSkipped[];
}> {
  const active = new Set<number>();
  const completed: ForegroundGetResult<T>[] = [];
  const skipped: ForegroundGetSkipped[] = [];
  const inFlight: Promise<void>[] = [];
  for (const request of schedule) {
    await clock.waitUntilMs(request.dueMs);
    if (active.has(request.tab)) {
      skipped.push({ request, reason: "IN_FLIGHT_SAME_TAB" });
      continue;
    }
    active.add(request.tab);
    const startedMs = clock.nowMs();
    const pending = Promise.resolve()
      .then(() => execute(request))
      .then(
        (value): ForegroundGetResult<T> => ({
          request,
          startedMs,
          completedMs: clock.nowMs(),
          outcome: { kind: "ok", value },
        }),
        (error: unknown): ForegroundGetResult<T> => ({
          request,
          startedMs,
          completedMs: clock.nowMs(),
          outcome: {
            kind: "error",
            reason: error instanceof Error ? error.name : "UNKNOWN",
          },
        }),
      )
      .then((result) => {
        completed.push(result);
      })
      .finally(() => {
        active.delete(request.tab);
      });
    inFlight.push(pending);
  }
  await Promise.all(inFlight);
  return { completed, skipped };
}

export function issue414Percentiles(
  samples: readonly number[],
): { p50Ms: number; p95Ms: number; maxMs: number } | null {
  if (samples.length === 0) return null;
  const values = [...samples].sort((a, b) => a - b);
  const at = (p: number) =>
    Number(values[Math.ceil(values.length * p) - 1]!.toFixed(3));
  return { p50Ms: at(0.5), p95Ms: at(0.95), maxMs: at(1) };
}
