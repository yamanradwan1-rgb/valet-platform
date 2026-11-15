# Issue #416 security rebaseline — architecture decision proposal

Status: PROPOSED, not Owner-approved. Baseline: db85db57fc5c3913a22d34ab5d9ef77269756301 (2026-11-15). No feature changes or release authorization.

## VERDICT — DEFER (Option C) for initial launch; assess Option B as a separate gated design

Option A's full v9 protocol is not established as the minimum secure solution. But a naive Option B relying on ordinary DB-backed sessions, role and MFA state is not safe against the already-required T5 adversary (ordinary runtime SQL execution). The current provisioner grants runtime INSERT/UPDATE of Staff session/MFA authority; old SECURITY DEFINER management functions accept actor membership UUID with no SQL proof of bearer/MFA. Until those facts are closed through effective privileges and an accepted authority mechanism, do not enable reset. Option C avoids introducing a new reset attack surface while fixing Auth/MFA/tenant P0 boundaries that are required regardless of reset.

**Scope/cost qualification:** Option C removes the incremental reset/VAP1 rollout, but independent launch-critical Auth/MFA/management/anti-abuse remediation may still be substantial and overlap significantly with Option A. Do not call it low effort until actual restricted PG17 T5 privilege/acceptance tests separate demonstrable P0 paths from hypothetical ones. Use qualitative scope until that evidence is available; no fabricated time estimate.

## Comparisons

| Criterion | A: Full v9 | B: Targeted Reset | C: Defer now |
|---|---|---|---|
| T1–T4 | Strong only after full authenticated integration | Can be strong with ordinary Auth/MFA plus locked target and one-use token | No reset endpoint; existing Auth/MFA still needs assurance |
| T5 SQL runtime | Intended strong after ALL conflicting grants/writers retired | Not equivalent with current grants; requires independent reset trust island OR proven upstream Auth/MFA/management closure | Does not add reset exposure, but legacy SQL session/MFA/definer risks remain independent launch blockers |
| T6/T7 host/admin | Signing key/admin can compromise authority; monitor and isolate | Distinct issuer secret still compromised under stronger actor | No new reset signer; other sensitive resources remain exposed to stronger compromise |
| Data/code changes | Broad private migrations, 35 family closures, complex cutover | Narrow reset tables/quotas/transactions PLUS upstream trust boundary, potentially sizeable | Targeted P0 security fixes only; reset routes/flags unchanged OFF |
| Maintainability | Highest ceremony/protocol burden | Lower if independent reset identity/provenance can be isolated | Smallest immediate; reset feature unavailable |
| Known remaining risk | 23 unresolved trusted writers, 0/210 real domain tests, CI/security | Upstream SQL forgery and new signer/bootstrap, unknown COMMIT, PG17/HTTP acceptance | Manual access restoration requires an explicitly reviewed nonpublic operator procedure; staff may be locked out |
| Existing work reusable | v9 scripts and UI when independently verified | UI/token/contracts/preflight/adversarial tests selectively | Keep draft work preserved; reuse launch-critical tests and later B candidates |
| Launch readiness | NOT READY | NOT READY | Conditional on independent P0 Auth/MFA/tenant/SQL fixes and CI/security PASS |

## Evidence and limits

Source: packages/database/scripts/mfa-runtime-privileges.mjs:1-34,105-207; apps/api/src/modules/auth/staff-session-context.ts:42-74; apps/api/src/modules/auth/mfa/mfa-assurance-policy.ts:68-137; packages/database/prisma/migrations/20261001005000_mgt_240b_lm_staff_authority/migration.sql:4-45; packages/database/scripts/staff-management-runtime-privileges.mjs:18-32. Actual tenant/credential exploitation has NOT been reproduced with the exact runtime DB role. Reset remains fail-closed (apps/api/src/modules/auth/issue416-password-reset-sql-readiness.ts:14-18). Current PR #464 is Draft, not merge-ready.

## Approval request

Approve **C for launch scope**: reset remains OFF, no new insecure recovery path; prioritize tested P0 upstream security. For **nonproduction development only**, establish a strictly controlled, audited internal account-recovery operation (no public endpoint, no raw bearer in logs, independent operator verification, one-time supervised action with all session revocation). Do not assume that this nonproduction procedure is adequate customer support after launch; approve an explicit customer account-recovery policy before onboarding first customers. Development-only reset seeding must never use production credentials. If Company Admin reset is a launch-critical business requirement, choose **B only after** a separate proof that a narrow reset-specific trust root genuinely withstands T5 and an Owner-approved bootstrap/recovery policy. Do not auto-revive A merely because of sunk cost.

This is a recommendation, not a change to Accepted DEC. Final authorization to change architecture, delete v9 code, merge, deploy or enable remains with Owner.
