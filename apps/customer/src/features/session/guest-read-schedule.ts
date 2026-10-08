import type { GuestCoordinatorState } from './guest-request-coordinator';

// Owner-approved T2 COMPATIBILITY policy; do not switch to T3 ACTIVE implicitly.
// Two foreground tabs, 66 other documented presentations and worst-case
// 20-second polling must fit 180 authenticated presentations per rolling 900s.
export const GUEST_FOREGROUND_POLL_MS = 21_000;
export const GUEST_POLL_JITTER_MS = 1_000;
export const GUEST_FOREGROUND_STALE_TARGET_MS = 35_000;

export function nextGuestReadDelay(
  state: GuestCoordinatorState,
  now: number,
  random: number = Math.random(),
): number {
  const jitter = Math.floor((2 * Math.max(0, Math.min(1, random)) - 1) * GUEST_POLL_JITTER_MS);
  const ordinaryBackoff = state.failures === 0
    ? GUEST_FOREGROUND_POLL_MS
    : Math.min(30_000, 5_000 * 2 ** Math.min(state.failures - 1, 4));
  return Math.max(ordinaryBackoff + jitter, state.cooldownUntil - now, 0);
}
