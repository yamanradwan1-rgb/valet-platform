# Issue #300 R2 — Prime local verification and release-readiness decision

**Date:** 2026-10-18, Jordan local time. **Verdict: NOT READY FOR RELEASE OR ISSUE CLOSURE.**

This is the final evidence accounting for the current bounded local continuation, **not** an acceptance certificate. The Owner explicitly authorized local R2/UI-M1 execution but **not** push, PR, merge, deployment, production/shared database operations, or closing Issue #300. The original frozen worktree remains unchanged.

## Source and isolation identity

- Exact source/runtime candidate examined for the signed test lane: `078237f167404a31735326bf86ec44eb1352ccef` on isolated `codex/issue-300-final-closure-r2`. Subsequent commits in this worktree are **evidence-only documentation** and must **not** be represented as a newly runtime-attested candidate.
- Original frozen base: `ef5a0554fa20fe6ee6fcc0a4ceeffdc83d6e5687`. No push, merge, PR, production deployment, or Issue closure was executed.
- Dedicated Docker `issue300_r2_pg17`, PostgreSQL **17.10**, DB `issue300_r2`, loopback `127.0.0.1:57285`, task-owned volume, **96/96** source-checksum-verified migrations and actual least-privilege runtime login `issue300_r2_w6_runtime`. W6 independently verified real runtime ACL/immutability, not merely simulated privileges. These are **isolated PG** results, not production rollout proof.
- 15-minute `ISOLATED_PROOF_CANDIDATE` certificate issued only after a clean source SHA, compiled API bundle digest, actual database/version/role, **96 migration checksums**, **12 birth-XID** and **6 immutability** triggers and one explicitly scoped allowlist. The allowlist had **three Audit UUIDs, one bounded Search window and one Timeline scope**; it was not a blanket runtime bypass.
- The proof-only API at `127.0.0.1:3164` was started successfully under the short certificate and **stopped after W7 released the lease and documentation advanced HEAD**; its certificate was archived in ignored task-owned evidence to prevent accidental proof-mode restart. The independent **default-disabled** API remained on `127.0.0.1:3165`. The dedicated PostgreSQL was not destroyed. Other processes/services were not stopped.

## Re-executed proof on the current source candidate

| Validation | Actual outcome | What this does **not** prove |
| --- | --- | --- |
| API TypeScript typecheck | **PASS** | HTTP authentication or DB writer provenance |
| Dashboard TypeScript typecheck | **PASS** | Real browser/keyboard/RTL/zoom parity |
| Root architecture check | **PASS**, only documented grandfathered non-Issue-300 overlength warnings | C0–C5 full acceptance |
| Scoped ESLint (Audit Investigation, UI-M1, API entrypoint) | **PASS** | Dynamic access or layout correctness |
| API Issue300 security/search source suite | **76/76 PASS**, 11 files | Signed HTTP Search/Timeline or S0/S1 |
| Additional API gate/Timeline/source-static suite | **32/32 PASS**, 4 files; overlaps the 76-test suite | Actual authenticated 503/200 |
| Dashboard Audit/Investigation suite | **257/257 PASS**, 20 files | Real browser matrix or frozen screenshot parity |
| Contracts independent source/association oracle | **4/4 PASS** | Actual SQL/HTTP source of truth |
| Independent Node Timeline/acceptance oracles | **28/28 PASS** | Real operational writer history |
| W2 dedicated PG Search adverse rollback-only SQL | **10/10 PASS** in earlier R2 worker handoff | Large-tier p95 |
| W6 fresh PG migration plus actual runtime role/ACL | **PASS**, 96/96 and restricted login | Live production 93→96 concurrent rollout |
| W7 on-the-wire anonymous scoped Search, enabled `:3164` | **HTTP 401** with `Cache-Control: no-store` | MFA-authorized Search 200 |
| W7 on-the-wire anonymous scoped Search, default `:3165` | **HTTP 401** with `Cache-Control: no-store` | Authenticated default guarded-cohort **503** |

All source-test counts above are scoped assertions. Overlapping 32 and 76 API suites **must not be summed as unique tests**. The W7 anonymous HTTP result was observed in the dedicated R2 runtime, not mocked.

## Unresolved acceptance / mandatory non-PASS classifications

1. **Authenticated real CA/LM MFA and default 503: BLOCKED/GAP.** W7 established the canonical staff-password login, MFA enrollment/confirmation and fresh step-up flow from the source. The connector safety gate blocked W7's private test-credential bootstrap **before execution**. No bearer, refresh token, actual MFA-assured session or credential was logged, leaked or produced. In particular, a 401 from an anonymous request is **not** the required authenticated default indirect-cohort 503. Do not bypass the connector guard to manufacture evidence.
2. **Real signed Search/Timeline 200, signed 100+ cursors and held-writer S0→S1: GAP.** Current independently queried fixture has **two Sessions, seven source facts** and provenance `DISPOSABLE_SQL_FIXTURE`; not `ACTUAL_DOMAIN_WRITER`. It cannot produce both second pages, nor certify canonical writer event associations. No actual multi-connection post-S0 commit certificate exists for this candidate.
3. **Role/grant/revocation/incident disclosure matrix and full T01–T70, U05-R01–R09: INCOMPLETE.** Source unit assertions cover subsets, but evidence-ledger rows requiring genuine CA/LM HTTP, foreign-tenant denial, altered grants, live source detail, and writer origin cannot be upgraded from GAP/PARTIAL to PASS.
4. **100k and ≥1m mixed-source performance, ten-minute 5-reader/2-real-writer and 25-reader/8-real-writer trials, 20 independent cold trials, approved p95 thresholds and writer impact: GAP.** W2's tiny/empty-scope p95 is not a scale result. The historical G2 3500-Session Search SQL p95 exceeded its warm-budget target, and there is no defensible R2 large-tier re-measurement.
5. **Real Dashboard browser proof: GAP.** The `:3114` dashboard was not running at W7 preflight and there is no approved real MFA browser session or same-fixture frozen visual baseline. The prepared Playwright 34-case set (including 32 locale/theme/viewport/zoom cases) was **not** executed as a real signed-in visual acceptance matrix. A source-rendered screenshot or synthetic browser state is not an equivalent substitute.
6. **Fresh-only 0→96 migration and actual role: PASS; production-like 93→96 interruption, held writers and concurrent runner recovery: GAP.** A successful disposable fresh bootstrap cannot establish safe production upgrade behavior.

## Required next authorized acceptance steps

Use a **trusted, approved credential/session mechanism** that respects the connector safety restriction to obtain actual CA and LM password+MFA assurance, without exposing tokens/secrets; then run the protected-path denial/allowance suite on a **fresh clean exact SHA, rebuilt API bundle and newly issued 15-minute scope certificate**. Independently create genuinely canonical writer fixtures and 100+ source-qualified events, establish held writer before HTTP S0, commit after S0 from a separate connection, and verify old cursor continuation versus new S1. Execute genuine security revocation/Incident/detail browser cases, 32 physical UI-M1 geometry cases with same-fixture frozen comparisons, and both large-tier real-writer load budgets, then update each T01–T70/U05-R01–R09 ledger item from evidence. Do not expand the scope or disable the ordinary 503 to make tests pass.

**Decision:** retain default-deny/503 protection, do not promote, deploy, merge, push, or close Issue #300. The current source is well tested locally but **release acceptance remains unproven**. Preserve original frozen SHA and private task-owned evidence; never attach passwords, bearer tokens, TOTP seeds or database URLs to reports.
