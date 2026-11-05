/** Pure, deterministic statistical primitives for Issue #429 QA evidence. */
export function quantile(values, probability) {
  if (values.length === 0) throw new Error("Empty measured latency cohort.");
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Latency samples must be finite nonnegative milliseconds.");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const rank = (sorted.length - 1) * probability;
  const lower = Math.floor(rank);
  return sorted[lower] + (sorted[Math.ceil(rank)] - sorted[lower]) *
    (rank - lower);
}

function seededRandom(seed) {
  let state = seed >>> 0;
  if (state === 0) throw new Error("A nonzero preregistered random seed is required.");
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function percentile(sorted, probability) {
  const position = (sorted.length - 1) * probability;
  const index = Math.floor(position);
  return sorted[index] + (sorted[Math.ceil(position)] - sorted[index]) *
    (position - index);
}

/** Resamples whole paired blocks; Bonferroni gives simultaneous 95% family coverage. */
export function pairedBlockIntervals(pairs, {
  familyComparisons = 6,
  iterations = 1999,
  seed = 429,
} = {}) {
  if (pairs.length < 10 || !Number.isInteger(familyComparisons) ||
      familyComparisons < 3 || iterations < 999) {
    throw new Error("Insufficient paired blocks, family size, or bootstrap iterations.");
  }
  for (const pair of pairs) {
    if (!Array.isArray(pair.baselineMs) || !Array.isArray(pair.candidateMs) ||
        pair.baselineMs.length === 0 || pair.candidateMs.length === 0) {
      throw new Error("Every pair needs successful baseline and candidate samples.");
    }
  }
  const probabilities = [0.5, 0.95, 0.99];
  const random = seededRandom(seed);
  const differences = probabilities.map(() => []);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const base = [];
    const candidate = [];
    for (let block = 0; block < pairs.length; block += 1) {
      const selection = pairs[Math.floor(random() * pairs.length)];
      base.push(...selection.baselineMs);
      candidate.push(...selection.candidateMs);
    }
    probabilities.forEach((probability, index) => {
      differences[index].push(quantile(candidate, probability) -
        quantile(base, probability));
    });
  }
  const baseline = pairs.flatMap((pair) => pair.baselineMs);
  const candidate = pairs.flatMap((pair) => pair.candidateMs);
  const alpha = 0.05 / familyComparisons;
  return probabilities.map((probability, index) => {
    const values = differences[index].sort((a, b) => a - b);
    const baselineMs = quantile(baseline, probability);
    const candidateMs = quantile(candidate, probability);
    return {
      percentile: [50, 95, 99][index],
      baselineMs,
      candidateMs,
      differenceMs: candidateMs - baselineMs,
      differencePercent: baselineMs === 0 ? null :
        (candidateMs - baselineMs) / baselineMs * 100,
      simultaneousLower95Ms: percentile(values, alpha / 2),
      simultaneousUpper95Ms: percentile(values, 1 - alpha / 2),
    };
  });
}

/** Exact for zero; one-sided Wilson upper for nonzero observations. */
export function oneSidedUpper95(violations, opportunities) {
  if (!Number.isSafeInteger(opportunities) || opportunities <= 0 ||
      !Number.isSafeInteger(violations) || violations < 0 ||
      violations > opportunities) {
    throw new Error("Invalid independent opportunity counts.");
  }
  if (violations === 0) {
    return { upper: -Math.expm1(Math.log(0.05) / opportunities),
      method: "one-sided exact binomial zero-event" };
  }
  const z = 1.6448536269514722;
  const p = violations / opportunities;
  const z2 = z * z;
  return {
    upper: (p + z2 / (2 * opportunities) +
      z * Math.sqrt(p * (1 - p) / opportunities +
        z2 / (4 * opportunities * opportunities))) /
      (1 + z2 / opportunities),
    method: "one-sided Wilson (nonzero events)",
  };
}
