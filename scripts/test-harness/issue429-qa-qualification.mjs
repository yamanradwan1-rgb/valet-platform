import { oneSidedUpper95, pairedBlockIntervals } from "./issue429-qa-statistics.mjs";

const requiredScenarios = ["normal", "peak", "recovery-idle", "recovery-backlog"];
const requiredComparisons = ["candidate-off", "candidate-mixed"];
const requiredNowait = ["normal", "peak"];

/** Only a trusted sampler/reviewer can promote an offline positive to PASS. */
export function downgradeUnattestedPositive(evaluated) {
  return evaluated === "PASS" ? "INCONCLUSIVE" : evaluated;
}

function measureComparison(pairs, familyComparisons, seed) {
  if (!Array.isArray(pairs) || pairs.length < 10) {
    return { status: "INCONCLUSIVE", reason: "fewer than ten paired blocks" };
  }
  const baselineCount = pairs.reduce((n, p) => n + (p.baselineMs?.length ?? 0), 0);
  const candidateCount = pairs.reduce((n, p) => n + (p.candidateMs?.length ?? 0), 0);
  if (baselineCount < 10000 || candidateCount < 10000) {
    return { status: "INCONCLUSIVE", reason: "fewer than 10000 successful Check-Ins per arm",
      baselineCount, candidateCount };
  }
  const reliability = pairs.map((pair) => {
    const fields = ["baselineErrors", "candidateErrors", "baselineTimeouts",
      "candidateTimeouts", "baselineThroughputRps", "candidateThroughputRps"];
    if (fields.some((key) => !Number.isFinite(pair[key]) || pair[key] < 0)) {
      return "MISSING";
    }
    if (pair.candidateErrors > pair.baselineErrors ||
        pair.candidateTimeouts > pair.baselineTimeouts ||
        pair.candidateThroughputRps < pair.baselineThroughputRps) {
      return "WORSE";
    }
    return "OK";
  });
  if (reliability.includes("MISSING")) {
    return { status: "INCONCLUSIVE", reason: "missing reliability or throughput evidence" };
  }
  const intervals = pairedBlockIntervals(pairs, { familyComparisons, seed });
  const regression = intervals.some((i) => i.simultaneousLower95Ms > 0);
  const unresolved = intervals.some((i) => i.simultaneousUpper95Ms > 0);
  return {
    status: regression || reliability.includes("WORSE") ? "FAIL" :
      unresolved ? "INCONCLUSIVE" : "PASS",
    reason: regression ? "credible positive Check-In percentile shift" :
      reliability.includes("WORSE") ? "reliability or throughput deterioration" :
      unresolved ? "confidence interval still admits positive regression" :
      "simultaneous 95% upper differences are nonpositive",
    baselineCount, candidateCount, pairedBlocks: pairs.length, intervals,
  };
}

function analyzeBaselineResolution(pairs, familyComparisons, seed) {
  if (!Array.isArray(pairs) || pairs.length < 10) {
    return { status: "INCONCLUSIVE", reason: "baseline-vs-baseline replay missing" };
  }
  const first = pairs.reduce((n, p) => n + (p.baselineMs?.length ?? 0), 0);
  const second = pairs.reduce((n, p) => n + (p.candidateMs?.length ?? 0), 0);
  if (first < 10000 || second < 10000) {
    return { status: "INCONCLUSIVE", reason: "baseline resolution sample is inadequate" };
  }
  const intervals = pairedBlockIntervals(pairs, { familyComparisons, seed });
  const drift = intervals.some((interval) =>
    interval.simultaneousLower95Ms > 0 || interval.simultaneousUpper95Ms < 0);
  return {
    status: drift ? "INCONCLUSIVE" : "PASS",
    reason: drift ? "baseline replay demonstrates uninvestigated measurement drift" :
      "baseline-vs-baseline reference characterized before candidate",
    intervals,
    detectionResolutionMs: intervals.map((i) =>
      i.simultaneousUpper95Ms - i.simultaneousLower95Ms),
  };
}

export function analyzeNowait(blocks, minimum, independenceAttested, observations) {
  if (!Array.isArray(blocks) || blocks.length < 10) {
    return { status: "INCONCLUSIVE", reason: "fewer than ten independent load blocks" };
  }
  let eligible = 0;
  let avoidable = 0;
  let totalLockBusy = 0;
  let realExhaustion = 0;
  let admitted = 0;
  let admittedWithoutHeadroom = 0;
  let missingOracle = false;
  let blocksWithDenial = 0;
  const admittedOnlyLatency = [];
  for (const block of blocks) {
    if (!Array.isArray(block.attempts)) {
      missingOracle = true;
      continue;
    }
    let blockDenied = false;
    for (const attempt of block.attempts) {
      const proof = attempt.oracle;
      if (proof?.method !== "independent-committed-ledger" ||
          proof?.eligibilityVerified !== true ||
          proof?.capacityVerified !== true ||
          proof?.orderedAgainstCommits !== true) {
        missingOracle = true;
        continue;
      }
      if (attempt.outcome === "LOCK_BUSY") totalLockBusy += 1;
      if (proof.eligibleWithHeadroom) {
        eligible += 1;
        if (attempt.outcome !== "ADMITTED") {
          avoidable += 1;
          blockDenied = true;
        } else if (Number.isFinite(attempt.allowedLatencyMs) &&
                   attempt.allowedLatencyMs >= 0) {
          admitted += 1;
          admittedOnlyLatency.push(attempt.allowedLatencyMs);
        } else {
          missingOracle = true;
        }
      } else if (["QUOTA", "RATE", "CONCURRENCY"].includes(attempt.outcome)) {
        realExhaustion += 1;
      } else if (attempt.outcome === "ADMITTED") {
        admittedWithoutHeadroom += 1;
      }
    }
    if (blockDenied) blocksWithDenial += 1;
  }
  const bound = eligible > 0 ? oneSidedUpper95(avoidable, eligible) : null;
  const clusterBound = oneSidedUpper95(blocksWithDenial, blocks.length);
  const countersPresent = ["committedAdmissions", "globalSpentDelta",
    "sumTenantSpentDeltas", "independentMockReceives"].every((name) =>
    Number.isSafeInteger(observations?.[name]) && observations[name] >= 0);
  const overspend = countersPresent && (
    observations.committedAdmissions !== admitted ||
    observations.globalSpentDelta !== admitted ||
    observations.sumTenantSpentDeltas !== admitted ||
    observations.independentMockReceives > admitted
  );
  const unsent = countersPresent && observations.independentMockReceives < admitted;
  return {
    status: avoidable > 0 || overspend || admittedWithoutHeadroom > 0 ? "FAIL" :
      missingOracle || !independenceAttested || !countersPresent ||
      unsent || !Number.isSafeInteger(minimum) ||
      minimum < 1 || eligible < minimum ? "INCONCLUSIVE" : "PASS",
    reason: avoidable > 0 ? "eligible-with-headroom admission was denied" :
      overspend ? "independent committed debit/provider count mismatch" :
      admittedWithoutHeadroom > 0 ? "admission occurred without verified eligibility/capacity" :
      missingOracle ? "independent ordered eligibility/capacity oracle missing" :
      !countersPresent ? "independent DB/provider counters missing" :
      unsent ? "admitted request lacked observed mock-provider receive" :
      !independenceAttested ? "independent block-scheduling proof missing" :
      eligible < minimum ? "insufficient preregistered eligible sample" :
      "zero observed avoidable denials in approved operating envelope",
    eligible, avoidable, admitted, admittedWithoutHeadroom,
    totalLockBusy, realExhaustion,
    independentProviderReceives: observations?.independentMockReceives ?? null,
    admittedOnlyCount: admittedOnlyLatency.length,
    allowedOnlyP50Ms: admittedOnlyLatency.length ?
      pairedLatency(admittedOnlyLatency, 0.5) : null,
    allowedOnlyP95Ms: admittedOnlyLatency.length ?
      pairedLatency(admittedOnlyLatency, 0.95) : null,
    allowedOnlyP99Ms: admittedOnlyLatency.length ?
      pairedLatency(admittedOnlyLatency, 0.99) : null,
    oneSided95AttemptUpper: bound,
    oneSided95IndependentBlockUpper: clusterBound,
    uncertainty: "Attempt binomial bound assumes independent eligible attempts; " +
      "under correlated bursts the independent-block bound is conservative for " +
      "block event probability, not an exact per-attempt confidence interval.",
  };
}

function pairedLatency(values, probability) {
  const sorted = [...values].sort((a, b) => a - b);
  const i = (sorted.length - 1) * probability;
  const low = Math.floor(i);
  return sorted[low] + (sorted[Math.ceil(i)] - sorted[low]) * (i - low);
}

function evidenceComplete(registration, evidence) {
  const approval = registration?.approval;
  const env = evidence?.environment;
  return approval?.approved === true && typeof approval.approvedBy === "string" &&
    approval.approvedBy.length > 0 && approval.beforeSampling === true &&
    Number.isSafeInteger(approval.minimumEligiblePerCohort) &&
    approval.minimumEligiblePerCohort >= 1 &&
    requiredScenarios.every((scenario) =>
      approval.workloads?.[scenario]?.registered === true) &&
    env?.nodeEnv === "production" && env?.pgMajor === 17 &&
    env?.buildsVerified === true && env?.restrictedDatabaseRole === true &&
    env?.httpsProviderWithTrustedCa === true && env?.commercialEgressBlocked === true &&
    env?.recoveryActive === true && env?.fixtureAttested === true &&
    env?.independentQuotaOracle === true &&
    Array.isArray(env.apiProcessIds) &&
    new Set(env.apiProcessIds).size >= 2 &&
    env.apiProcessIds.every((id) => Number.isSafeInteger(id) && id > 0) &&
    registration?.baselineResolution?.recordedBeforeCandidate === true &&
    registration?.baselineResolution?.referenceArtifactSha256?.length === 64;
}

export function qualifyIssue429(registration, evidence) {
  if (!evidenceComplete(registration, evidence)) {
    return { status: "INCONCLUSIVE", reason: "Unapproved or unattested production workload; no qualification PASS." };
  }
  const seed = registration.bootstrapSeed;
  if (!Number.isSafeInteger(seed) || seed === 0) {
    return { status: "INCONCLUSIVE", reason: "Missing preregistered nonzero bootstrap seed." };
  }
  const scenarioCount = requiredScenarios.length;
  const familyComparisons = 3 * scenarioCount * requiredComparisons.length;
  const checkIn = {};
  const baselineResolution = {};
  const nowait = {};
  for (const scenario of requiredScenarios) {
    const observed = evidence.scenarios?.[scenario];
    baselineResolution[scenario] = analyzeBaselineResolution(
      observed?.baselineRepeatPairs, familyComparisons, seed);
    for (const comparison of requiredComparisons) {
      const key = `${scenario}:${comparison}`;
      checkIn[key] = measureComparison(observed?.checkIn?.[comparison],
        familyComparisons, seed);
    }
  }
  for (const scenario of requiredNowait) {
    nowait[scenario] = analyzeNowait(
      evidence.scenarios?.[scenario]?.nowait?.blocks,
      registration.approval.minimumEligiblePerCohort,
      evidence.scenarios?.[scenario]?.nowait?.independentBlocks === true,
      evidence.scenarios?.[scenario]?.nowait?.observations,
    );
  }
  const statuses = [...Object.values(checkIn), ...Object.values(nowait),
    ...Object.values(baselineResolution)].map(x => x.status);
  // The CLI consumes arbitrary JSON, not a trusted sampler/ordered DB oracle.
  // Never certify a release from self-attested counters, PIDs or boolean flags.
  const evaluated = statuses.includes("FAIL") ? "FAIL" :
    statuses.includes("INCONCLUSIVE") ? "INCONCLUSIVE" : "PASS";
  return {
    status: downgradeUnattestedPositive(evaluated),
    reason: evaluated === "PASS" ?
      "Supplied values appear statistically acceptable, but independent " +
      "sample/oracle provenance and preregistered precision are not attested." :
      undefined,
    checkIn, baselineResolution, nowait,
    interpretation: "Successful ordinary Check-In samples only; denied OCR requests excluded " +
      "from allowed-only latency. No real provider billing or native device claim.",
  };
}
