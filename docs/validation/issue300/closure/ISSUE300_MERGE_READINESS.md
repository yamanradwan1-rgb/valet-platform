# Issue #300 — Merge readiness at consolidated release-candidate review

**2026-10-20 Owner supersession:** The following earlier production-disabled
disposition was an assistant-imposed restriction, explicitly REJECTED by the
Owner. The current product decision is **normal production Investigation for
authorized Company Admin and Location Manager**, while authentication, MFA,
historical provenance, signed cursor and unsafe-cohort guards remain strict.
See [`OWNER_ISSUE300_PRODUCTION_AVAILABILITY_2026-10-20.md`](../../OWNER_ISSUE300_PRODUCTION_AVAILABILITY_2026-10-20.md)
for the corrected source, tests and unresolved *runtime* release evidence.
The original dated implementation report is retained below for provenance.

**Disposition: SOURCE INTEGRATED — PRODUCTION DISABLED — LIVE ACCEPTANCE PENDING.**

Source provenance: `codex/issue300-r2-local-closure-package` at
`38ec1e40dfc754c5e2f83e25866735421ec2f4d2`, merged into
`integrate/issues-300-302-303-release-candidate` from `origin/main`
`6d7bd5991e66d8f5d93978512352a52c72bdc7f6`. Resolve the review
candidate's exact HEAD with `git rev-parse HEAD`; no historical SHA can be
relabelled as final acceptance evidence. Full source report:
[R2 package](ISSUE300_R2_FINAL_LOCAL_REVIEW_PACKAGE_2026-10-20.md),
[R2 plan](../../../plans/ISSUE_300_AUDIT_INVESTIGATION_MASTER_PLAN.md),
[79-row ledger](ISSUE300_R2_W21_APPEND_ONLY_79_GATE_DISPOSITION_2026-10-20.md).

## Implemented and reviewed source

- U01–U06 Owner-approved Concept A, UI01–UI06/UI-M1 frozen design and existing
  Audit Events preservation; CA/LM scoped Search, Timeline, detail, keyset
  cursor/HMAC, bounded evidence coverage, source-specific provenance and
  immutable historical association (not mutable current-plate attribution).
- Contracts and types for four source families, strict source/scope/session
  IDs and safe error/unknown projections, never free-text Incident or raw
  Condition Photo evidence.
- Canonical Prisma migration 94 birth XID, 95 immutable source association,
  96 attribution freeze; all three have separate migration files. No #302/#303
  migration or Audit contract collision was found in the combined merge.
- R2 proof remains cryptographically gated for signed-only historical
  assertions. Source reviews of V3 killed95, W19 replay/phase correctness,
  W18 role/auth/browser harness, UI-M1 and tenant/source boundaries were
  independently documented at their reviewed SHAs.
- A separate **temporary production-off integration commit** disables new
  Investigation API controller registration and Dashboard Investigation tab
  unless `NODE_ENV=development|test`, even with `?investigationDemo=1`.
  Ordinary Audit Events remains registered/rendered. The regular
  `migrate:deploy` production/unknown/staging wrapper refuses this candidate's
  pending migration deployment; only explicit local-loopback dev/test DB
  execution is permitted. This is not proof of gate behavior in a deployed
  system and does not stop manually invoking unsupported direct Prisma CLI.

## Current validation versus acceptance

- Combined candidate: Contracts TypeScript and tests 473/473; Employee Client
  TypeScript and tests 843/843; API, Dashboard, Native and database TypeScript
  PASS; focused API source security/Search/Timeline/Audit 137/137 PASS;
  Dashboard source 947/947 PASS; 49/49 V3 offline tests PASS and architecture
  policy PASS after bounded V3 script extraction. Updated production-off
  source/CI tests 7/7 PASS. Builds for Contracts, Employee Client, API and
  Dashboard PASS; the dashboard build supplies a disposable local API origin
  and an explicit current-worktree Turbopack root. **All counts are source
  tests, not real protected U005 or 79-row acceptance.**
- **Original 79 acceptance:** 57 BLOCKED, 22 NOT RUN, 0 complete PASS, 0 FAIL.
  Limited earlier-SHA V2 PostgreSQL 96/96 + runtime-role SQL subsets remain
  historical partial evidence only.
- **Owner signing/build-certification exception** is accepted for scheduling
  but **NOT CRYPTOGRAPHICALLY VERIFIED**. No Owner-signed target, lease, build
  receipt or real proof attestation exists; signed-only gates remain blocked.
- No final real fresh/populated 93→96/concurrent/killed95 recovery, real CA/LM
  MFA/HTTP S0→S1, 34 authenticated Playwright screenshot/behavior trials,
  100k/1m 600-second stress or 20 real cold trials. UI-M1 source/design
  approval is not same-fixture visual regression.

## Required production rollout, privacy and rollback

Do not enable new routes or run production Prisma migration 94–96 as part of
this PR. A separately reviewed future DB rollout must verify checksum/locks,
new vs populated 93→96, legacy writers, runtime ACL, unknown outcomes,
indirect cohort privacy and rollback/provenance before explicit authorization.
Rollback of *this source-only merge* means redeploying a previous API/UI
binary without deleting immutable migration evidence; any applied migration
requires a separate reviewed database contingency, not reverse SQL invented
for this PR. Never borrow real CA/LM sessions, switch off MFA, bypass signed
pagination or expose private #303 photo bytes to Investigation.

**Recommendation:** include #300 only while *production disabled* in the
review PR; do not claim Issue #300 closure or deployment authority. The
official [source-only UI review](W23_UI_M1_VISUAL_SOURCE_REVIEW_2026-10-20.md),
[Owner exception](OWNER_SIGNING_EXCEPTION_2026-10-20.md) and historical
approval/DEC register remain binding. Final independent merged-SHA review and
CI are still required before Owner authorizes merge.
