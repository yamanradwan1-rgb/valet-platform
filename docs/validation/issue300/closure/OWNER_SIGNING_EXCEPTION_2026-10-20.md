# Issue #300 R2 — Owner signing requirement amendment

**Decision date:** 2026-10-20.

**Status: OWNER-ACCEPTED SIGNING EXCEPTION — NOT CRYPTOGRAPHICALLY VERIFIED.**

## Exact limited decision

The Owner explicitly removes *initial Owner private-key enrollment,
private-key custody and Owner-signed build certification* from the critical
path of engineering acceptance for Issue #300 only. The original Astra R2
Master Plan and historical R2 acceptance ledger remain unchanged. This is an
amendment to the proposed build-certification requirement, not a claim that
the original cryptographic certification has been achieved.

Evidence for the genuine Owner private key, trusted-root enrollment,
short-lived Owner-signed build/V3/performance leases, signed build receipt,
and signed U005 proof attestation **does not exist**. Every requirement that
relies on any of these is **BLOCKED** or **NOT RUN**, not PASS. This owner
exception must be reported in its own separate field and never used as a
substitute for a missing cryptographic signature.

## Security boundaries still mandatory

- Production application verifier logic and trust roots remain unchanged;
  no forged signing key, synthetic signed receipt or unsigned proof-target
  promotion is permitted.
- MFA, authentication, real cross-tenant authorization and revocation,
  database provenance/immutable history and signed pagination cursor
  verification remain mandatory.
- Ordinary supported local builds/tests may execute only within their normal
  authorized development paths. They may not be recorded as equivalent to
  Owner-signed certified-build or protected U005 historical proof mode.
- A protected route that mandates genuine Owner signature continues to
  refuse untrusted input. This result is truthful **BLOCKED**, not waived
  security and not a successful end-to-end acceptance test.
- Existing scope approvals, migrations 45/94/95/96, UI-M1, golden baselines,
  performance workloads and budgets are unchanged.

## Evidence accounting

Each of 79 T01–T70 and U05-R01–R09 requirements must separately list
PASS, FAIL, BLOCKED, NOT RUN, or OWNER EXCEPTION (only where the original
requirement is *specifically* the initial Owner build-signing prerequisite).
There is no permission to record an actual migration, HTTP/MFA, browser,
performance, provenance or privacy result as OWNER EXCEPTION. The signing
exception itself does not mean that 79/79 engineering acceptance is met.

**Pending evidence:** task-owned isolated PG runtime, real CA/LM MFA,
34 Playwright executions, 100k/1m workload, 20 genuine cold start trials,
full 79-row acceptance reconciliation and independent P0/P1 review.

No push, PR, merge, deployment, production migration or Issue closure is
authorized by this amendment.
