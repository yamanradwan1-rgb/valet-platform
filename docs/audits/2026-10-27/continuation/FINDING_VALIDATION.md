# Finding validation

SEC-011 was discovered by the security worker and challenged separately by the coordinator. Candidate evidence and source hashes survive in saved worker records. The coordinator inspected the actual enrollment/recovery services, factor/session repositories, controller, API runner, auth module/bootstrap, password-login insertion, relevant persistence schema/trigger and test cases.

[Audit model](evidence/mfa-recovery-session-model.cjs) transpiles immutable TypeScript bodies using the already installed TypeScript package. It executes actual enrollment/recovery, session/factor repository, secret encryption, recovery verifier and TOTP functions. Synthetic SQL interprets the exact expected query shapes and rejects unknown shapes. It checks user/session/token/revocation/expiry predicates and models transactions/rollback. Keys, identifiers, seeds and codes are generated only in memory and never printed. No environment secret is read. The loader substitutes Nest decorators, transaction orchestration, audit, runtime-pool tokens and limiter; the SQL store is not PostgreSQL and advisory locks are no-ops. Execution is serial. This cannot prove HTTP reachability, actual ACLs, SQL constraints, driver behavior or concurrency.

[Output](evidence/mfa-recovery-session-model.txt):5 checks passed/0 failed. Two path checks demonstrate same-user replacement-seed disclosure and attacker-session confirmation; three controls verify active-factor denial, recovery itself does not assure second session, and different-user separation. These are audit assertions demonstrating a defect, not application regression-suite PASS claims.

Initial audit-helper invocation failed before assertions because its local TypeScript resolver mistook a .module basename for a complete extension. Helper corrected outside repository; successful second invocation produced captured output. No application defect or test failure is inferred from the first helper error.

Competing explanations examined: ACTIVE-factor refusal narrows the exposure window; row/advisory locks serialize contenders without identifying the recovery owner; same-user cryptographic AAD cannot restrict sessions; existing tests intentionally share pending-state projection but do not assert safe post-recovery disclosure. Existing ten findings are not revalidated or upgraded by this checkpoint.

## C003 — DASH-AUTH-01 source validation

Prime independently read staff-auth-client.ts lines 80–89, 141–148 and 265–280; staff-auth-context.tsx lines 59–100; and staff-auth-client.test.ts lines 128–148. Worker-7 separately traced the backend refresh-cookie and logout/controller paths. New-instance denied-storage read returns false and routes to automatic cookie refresh when authoritative logout never completed. Working-storage test and successful server revocation are genuine countercontrols but do not disprove this combined schedule. No controlled browser/HTTP reproduction or provider/production test was performed: classify HIGH_SOURCE_CONFIDENCE, not CONFIRMED_RUNTIME.

## C003 — DASH-I18N-01 independent source challenge

Prime re-read Dashboard locale.ts lines 19–39 and locale-provider.tsx lines 41–61. Denied localStorage makes readDashboardLocale return EN after commitDashboardLocale sets AR/RTL and notifies subscribers. The provider derives t/direction from the EN snapshot and may reset document language/direction. This duplicates the general failure class of CUST-001 but is independent Dashboard code. No denied-storage mounted UI test was run; retain HIGH_SOURCE_CONFIDENCE / RUNTIME_UNVERIFIED.
