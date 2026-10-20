# Issue #300 R2 — source merge-readiness, evidence ownership and blocking gates

**Recorded:** 2026-10-20. **Source package:** `38ec1e40dfc754c5e2f83e25866735421ec2f4d2` (`codex/issue300-r2-local-closure-package`). **Decision:** prepared for independent source/PR review; **NOT engineering accepted; NOT runtime/release ready**. This report author performed documentation/source inspection only and has not run tests on an integrated #300+#302+#303 branch.

## Exact issue boundary

#300 implements R2 audit Search/Timeline/details and UI-M1 within Owner-approved product scope. Source includes cross-source typed IDs, qualified coverage, immutable event projections, scoped authorization, keyset cursor behavior and proof-only U005 guards, with forward migrations `20261018009400`, `20261018009500`, `20261018009600` (migration directories retain full canonical names). R2/UI-M1 approval permits source work; it is not visual, cryptographic or performance acceptance. Preserve legacy Audit Events and original frozen Dashboard design. The final source package's code provenance and source-only checks are preserved in `ISSUE300_R2_FINAL_LOCAL_REVIEW_PACKAGE_2026-10-20.md`.

## Acceptance matrix — full 79 gates

| Evidence lane | Current complete acceptance | Reviewer must establish |
| --- | --- | --- |
| **79 exact tracked criteria** | **57 BLOCKED / 22 NOT RUN / 0 PASS / 0 FAIL / 0 OWNER EXCEPTION rows** | Each T01–T70 and U05-R01–R09 reviewed individually in `ISSUE300_R2_W21_APPEND_ONLY_79_GATE_DISPOSITION_2026-10-20.md`; never infer PASS from source tests. |
| Source tests, static code, bounded contracts | Earlier offline subsets recorded PASS on source commits; not full 79 criterion proof | Confirm exact final combined SHA and appropriate CI/typecheck/unit coverage; keep historical run SHA attached. |
| DB/migrations/provenance | Historical limited V2 PostgreSQL 96/96 ledger + least-privilege role subset existed at an earlier SHA; genuine fresh V3 and populated/concurrent failure recovery **BLOCKED / NOT RUN** | Independent isolated fresh 0→96, populated 93→96, concurrent runner, failed 94, killed95 recovery, triggers and ordinary role ACL on the final candidate. |
| Real Staff authentication, MFA, authorization/privacy | Four-Staff scenario and role oracles are source-designed; actual final CA/LM MFA, cross-tenant, revocation, audit-only controls and signed-path runtime **BLOCKED / NOT RUN** | Real scoped Staff sessions, ordinary 401/403/503, Location and tenant denials, revocation races, no metadata/PII escape. Preserve proof-only signature checks. |
| Search/Timeline U005 authenticity | Protected signed API proof **BLOCKED**; unit mocks/older SQL partials do not count | Genuine exact-session and source-ID oracle, signed cursor/pagination, held real writer S0→S1 and immutable evidence/rollback checks. Current verifier must never be bypassed to claim PASS. |
| #300 default/production feature gate | `apps/api/src/modules/management/audit-investigation/audit-investigation-u05-gate.ts:32-62` statically requires `NODE_ENV=test`, `ISSUE300_U05_G2_PROOF_ENABLE=1` and, for indirect R2, `ISSUE300_R2_INDIRECT_HTTP_PROOF_ENABLE=1` plus exact local role/DB and attestation; **actual combined runtime OFF enforcement still unverified** | Verify on the final combined SHA with flags absent and in production mode that protected proof stays OFF and unsupported ordinary request refuses (503 or documented denial). Never enable or bypass the protected runtime for this check. |
| UI-M1 and Playwright | Approved/frozen design; **2/2 functional and 32/32 visual cases NOT RUN/BLOCKED; 0/34 real PASS** | True authenticated role/browser UI, 32 same-fixture PNG baseline/diff records with verified provenance, natural 100/200% zoom, RTL/LTR, EN/AR, Light/Dark, and conditional UI state/drawer/keyboard regressions. See `W23_UI_M1_VISUAL_SOURCE_REVIEW_2026-10-20.md`. |
| Load, performance and cold start | **BLOCKED / NOT RUN**; no valid 100k/1m current-SHA measurements | Two 600s mixes: 2W/5R at 100k and 8W/25R at 1m; 20 genuine independent cold trials and SQL/HTTP measured p95 and writer impact, with existing budgets unmodified. |
| Combined #300+#302/#303 checks | **NOT RUN** | Prime must verify integrated clean SHA, migration/Native changes, API/Dashboard/employee-client/native build and test compatibility; this report cannot promote two independent branch results into combined PASS. |

The original **79 rows** are all unchanged historical criteria. `BLOCKED` means a required authorized target or genuinely admitted evidence route is unavailable. `NOT RUN` means there is no complete attributable execution of the criterion. A source review or example SQL query may remain helpful partial evidence, but cannot change the full criterion status. Update only through a newly dated, independently reviewed append-only record; do not rewrite the existing ledger.

## Signing Owner exception — precise scope

The Owner expressly excepted initial Owner key enrollment/custody and Owner-signed **build certification** from the #300 critical path. **OWNER EXCEPTION — NOT CRYPTOGRAPHICALLY VERIFIED.** This is a separate owner decision (`OWNER_SIGNING_EXCEPTION_2026-10-20.md`) and **applies to zero of the 79 criteria**. No authentic Owner trust root, proof-only attestation or signed U005 authorization was established. Existing signature verifier, MFA, tenant/Location scoping, database provenance, immutable audit history, signed cursor semantics and private-photo rules remain mandatory. Any protected endpoint still requiring valid evidence is **BLOCKED** until genuinely satisfied; no unsigned or mock substitute is permitted. Do not resume Owner signing framework development for this task.

## Reviewer source entry points and facts

| Review track | Entry point | Source-level/observed limit |
| --- | --- | --- |
| Original criterion-by-criterion evidence | `ISSUE300_R2_W21_APPEND_ONLY_79_GATE_DISPOSITION_2026-10-20.md`; `R2_ACCEPTANCE_TRACKER.md` | 79 statuses with historical attribution; previous positive tests cannot be assigned to this package automatically. |
| Owner package + precise resource gaps | `ISSUE300_R2_FINAL_LOCAL_REVIEW_PACKAGE_2026-10-20.md` | Admission samples 1652/1723/2047/1998 MiB had 2/4 below requirement; Docker unavailable and required signed lease absent on attempted V3 run. Real V3 proof was not executed. |
| Staff/browser runtime reality | `W18_ACTUAL_HTTP_BROWSER_VERDICT_2026-10-20.md`; `W23_UI_M1_VISUAL_SOURCE_REVIEW_2026-10-20.md` | No attributable current isolated listener/browser session or 34 full browser traces; G0 124-file source-hash manifest is not 32-image golden evidence. |
| UI-M1 source behavior | `W5_DASHBOARD_REPORT.md` | Approved UI01–UI06 and source tests; not physical screenshot parity, focus/interaction acceptance or proof that conditional controls render in real 200% zoom. |
| Source performance guard reconciliation | `W19_W8_FALSE_PASS_RECONCILIATION.md` | Guards prevent baseline/live replay and fabricated phase PASS; guards are not populated workload results. |
| Original build-signing scope amendment | `OWNER_SIGNING_EXCEPTION_2026-10-20.md` | Narrow build-certification exception; no runtime certificate or protected-path bypass. |

## Scope/privacy and merged-branch disposition

Review API scoped source reads, accidental foreign Organization/Location fields, redacted unknown source evidence, historical versus current actor identity, native Incident/photo integration boundaries, auth/MFA and no secret/PII in log evidence. No current live proof of complete source provenance, physical screenshot regressions or production provider privacy is claimed. No source Photo object keys, user/vehicle/session IDs, images, credentials, private QA artifact links or APK bytes belong in a public review.

Local observed tracking base `origin/main`: `6d7bd5991e66d8f5d93978512352a52c72bdc7f6`; **Prime must independently refresh and pin its remote state**. #302/#303 source/evidence package: `e92f7f0c732ee53f26ccc45361c69b66f7296cfb`. **Combined local merge SHA: `ecc7b3a2563a7a017d3ad299594bb2549e601ff1`**, with parents Native integration `6982e168459f858bfe894a253490ba1bfca5344e` and #300 package `38ec1e40dfc754c5e2f83e25866735421ec2f4d2`; local Git commit ancestry verified. **Merged-branch tests: NOT RUN.** The merged source may be taken through PR review once Prime verifies the exact diff, remote base, default-OFF proof gate and independent source/security findings. **No engineering acceptance, release readiness, issue closure, push, deployment or production migration approval is claimed.**

Cross-issue reviewer summary, draft release notes and PR text: `docs/validation/RELEASE_CONSOLIDATION_300_302_303_2026-10-20.md`.
