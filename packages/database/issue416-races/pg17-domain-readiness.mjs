import { enumerateTrials, RACE_CASES } from "./race-matrix.mjs";

// These are the actual production-command bindings still needed for each
// business-domain race. Dormant SQL quota operations are deliberately excluded.
const REQUIRED_COMMANDS = Object.freeze([
  ["password change", "Argon2 login"],
  ["staff disable", "Argon2 login"],
  ["authenticated refresh", "concurrent refresh"],
  ["authenticated logout", "authenticated refresh"],
  ["authenticated logout", "live MFA ceremony"],
  ["staff disable", "live MFA ceremony"],
  ["controlled factor retirement", "live MFA ceremony"],
  ["authenticated management mutation", "live MFA ceremony"],
  ["role mutation", "R02 reset issuance"],
  ["staff onboarding", "R02 reset issuance"],
  ["push registration", "R03 reset redemption"],
  ["proof-key retirement", "signed protected operation"],
  ["signed protected operation", "conflicting same-operation proof"],
  ["signed protected operation", "new-lease receipt reconciliation"],
  ["onboarding quota reservation", "protected create/resend"],
  ["controlled User/password HOLD", "Argon2 A01 login"],
  ["controlled factor/code HOLD", "A04-A08 MFA ceremony"],
  ["controlled membership/entitlement HOLD", "M01-M03/M07/R02"],
  ["controlled User/factor/code HOLD", "A07/M15 recovery"],
  ["controlled invitation/reset HOLD", "M06 activation/R03 redemption"],
  ["controlled actor-authority HOLD", "X01 Shift force end"],
]);

export const REQUIRED_DOMAIN_EVIDENCE = Object.freeze([
  "genuine authenticated purpose-bound A and B operations",
  "actual production named-rank lock witness on two distinct PG17 backends",
  "committed business-domain and tenant-scoped authorization snapshots",
  "independent durable receipt and security audit readback",
  "bounded C/R/D/U/T fault outcomes, including server-committed lost acknowledgment",
  "both A-first and B-first schedules, without stale proof reuse",
]);

export function domainReadinessReport() {
  if (RACE_CASES.length !== REQUIRED_COMMANDS.length) {
    throw new Error("W38_DOMAIN_21_CASE_ABI_MAPPING_INCOMPLETE");
  }
  const cases = RACE_CASES.map(({ id, name, admission }, i) =>
    Object.freeze({ id, name, admission,
      commands: Object.freeze([...REQUIRED_COMMANDS[i]]),
      status: "BLOCKED_PRODUCTION_ABI",
      reason: "No authorized two-connection production-command driver and verified fault injection",
    }));
  const trials = enumerateTrials();
  if (cases.some((entry, i) => entry.id !== i + 1) || trials.length !== 210) {
    throw new Error("W38_DOMAIN_TRIAL_ENUMERATION_INCOMPLETE");
  }
  return Object.freeze({ cases: Object.freeze(cases), declared: trials.length,
    executed: 0, passed: 0, blocked: trials.length,
    status: "BLOCKED_PRODUCTION_ABI" });
}

// A physical advisory-lock smoke, a mock, a dormant quota or a synthetic SQL
// actor cannot be submitted as production-domain acceptance evidence.
export function assertNotDomainPass(result) {
  if (!result || result.passed !== 0 || result.executed !== 0 ||
    result.blocked !== 210 || result.status !== "BLOCKED_PRODUCTION_ABI") {
    throw new Error("W38_DOMAIN_UNBOUND_PASS_FORBIDDEN");
  }
  return true;
}
