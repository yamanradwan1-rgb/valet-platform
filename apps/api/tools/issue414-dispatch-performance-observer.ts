import type { Pool } from "pg";

export interface ObservedWaits {
  readonly sampleCount: number;
  readonly lockPositiveSamples: number;
  readonly peakLockedBackends: number;
  readonly peakActiveBackends: number;
  readonly samplingErrors: string[];
  readonly intervalMs: number;
}

/**
 * Best-effort 25ms pg_stat_activity sampling. Zero observed lock samples
 * DOES NOT establish that no shorter lock wait occurred.
 */
export async function sampleRuntimeWaits(
  adminPool: Pool,
  role: string,
): Promise<() => Promise<ObservedWaits>> {
  const client = await adminPool.connect();
  let stopped = false;
  let pending: Promise<void> | null = null;
  const errors = new Set<string>();
  let samples = 0;
  let positive = 0;
  let peakLocked = 0;
  let peakActive = 0;
  const poll = () => {
    if (stopped || pending !== null) return;
    pending = client
      .query<{
        locked: string;
        active: string;
      }>(
        `SELECT
           count(*) FILTER (WHERE wait_event_type='Lock')::text AS locked,
           count(*) FILTER (WHERE state='active')::text AS active
         FROM pg_stat_activity
         WHERE datname=current_database() AND usename=$1`,
        [role],
      )
      .then((result) => {
        const locked = Number(result.rows[0]?.locked ?? 0);
        const active = Number(result.rows[0]?.active ?? 0);
        samples += 1;
        if (locked > 0) positive += 1;
        peakLocked = Math.max(peakLocked, locked);
        peakActive = Math.max(peakActive, active);
      })
      .catch((error: unknown) => {
        const typed = error as { code?: string; message?: string };
        errors.add(typed.code ?? typed.message ?? "unknown");
      })
      .finally(() => {
        pending = null;
      });
  };
  const intervalMs = 25;
  const timer = setInterval(poll, intervalMs);
  timer.unref();
  poll();
  return async () => {
    stopped = true;
    clearInterval(timer);
    if (pending) await pending;
    client.release();
    return {
      intervalMs,
      sampleCount: samples,
      lockPositiveSamples: positive,
      peakLockedBackends: peakLocked,
      peakActiveBackends: peakActive,
      samplingErrors: [...errors],
    };
  };
}
