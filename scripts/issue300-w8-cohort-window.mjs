// The synthetic fixture writes every source family across these 60 UTC seconds.
// A signed query window must include the complete fixture, not a fast 1s slice.
import assert from "node:assert/strict";

export const fixtureFirstAt = "2026-10-16T11:30:00Z";
export const fixtureLastAt = "2026-10-16T11:30:59Z";

export function assertCompleteCohortWindow(window) {
  const from = Date.parse(window?.from);
  const to = Date.parse(window?.to);
  const first = Date.parse(fixtureFirstAt);
  const last = Date.parse(fixtureLastAt);
  assert(Number.isFinite(from) && Number.isFinite(to) && from < to,
    "Search cohort must have a valid signed from/to");
  assert(from <= first && to >= last,
    "False-fast U004: signed Search window excludes fixture source seconds");
  assert(to - from <= 31 * 86_400_000,
    "Search workload cannot use an unbounded time range");
  return { from: window.from, to: window.to };
}

export function assertWindowSourceCohort(counts, skew, tier) {
  assert([100_000, 1_000_000].includes(tier));
  for (const name of ["AUDIT", "KEY_CUSTODY", "DISPATCH", "INCIDENT"]) {
    assert.equal(counts?.[name], tier / 4,
      `False-fast U004: ${name} in-window source cohort is incomplete`);
  }
  assert.equal(skew?.persistedCustodyRows, tier / 4,
    "False-fast U004: busy slot in-window custody cohort incomplete");
  assert.equal(skew?.distinctSessions, tier / 100,
    "False-fast U004: busy slot in-window Session distribution incomplete");
  return true;
}
