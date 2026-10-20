# VAYLET Issue #300 R2 — final local engineering review package

**Date:** 2026-10-20. **Verdict: NOT ENGINEERING ACCEPTED; NOT RELEASE READY.**

This package is an attributable *local-source and execution-disposition*
checkpoint. It does not claim finished live tests, production authorization,
or certified Owner cryptographic trust. The complete tested/reviewed source
ancestor before this documentation-only package is
`321e0e77f28ff8659e49d42fd71135de6092a342`. The **exact final package
Git SHA is the commit containing this report**; resolve with `git rev-parse
HEAD` on `codex/issue300-r2-local-closure-package`. Evidence from another
SHA cannot automatically establish proof for that final SHA.

## 1 — Local code, isolation, and preservation

- Integration code branch: `codex/issue300-r2-safe-integration`, source review
  ancestor `321e0e77`; main, canonical Issue #300 branch, production and human
  services were not modified, pushed, merged or deployed.
- Review-only clean checkout:
  `D:/kndoom/valet-platform/tmp/issue300-r2-local-closure-package`, branch
  `codex/issue300-r2-local-closure-package`. It was forked from the existing
  approved integration SHA to preserve existing legitimate dirty/untracked
  changes in the original integration worktree. Do not reset or clean them.
- Reviewed source integrations include versioned Owner root-consistency
  checks, isolated 4-Staff/34-browser test planning, exact Location-B/foreign
  role safety, W16 V3 killed95 child/backend/drain/lease quarantine guards,
  W16 verified stop-before-overall-PASS gate and W19 baseline/live/reader/
  writer/cold false-PASS protections. This states SOURCE readiness only.
- Current-source focused offline results: W16 V3 41/41; W19 integrated
  owner-root/load suite 14/14; W18 four-Staff/34-browser planner 13/13;
  after isolating this package, W18 MFA mock+W19 reconciliation/replay
  tests 14/14. All are **offline**, not full acceptance.

## 2 — Owner certification amendment

**OWNER-ACCEPTED SIGNING EXCEPTION — NOT CRYPTOGRAPHICALLY VERIFIED.**
See [the separate dated decision](OWNER_SIGNING_EXCEPTION_2026-10-20.md).
The Owner waived only initial Owner private-key enrollment, custody and
Owner-signed *build certification* as an engineering scheduling prerequisite.
No Owner private key, signed lease, signed build, approved trust-root rotation
or valid U005 signed attestation has been generated. No signature was invented,
no runtime verifier disabled, and no proof-only HTTP target promoted. The
Owner exception is not a PASS or 79-row waiver. Application security, MFA,
pagination HMAC, database provenance, tenant isolation and integrity remain
mandatory. Protected proof routes that need genuine signatures stay BLOCKED.

## 3 — V3 real PostgreSQL migration verdict

**BLOCKED / NOT RUN** on final candidate. Real fresh 0→96, populated 93→96,
independent concurrent runners, failed 94, genuine killed95 PostgreSQL
backend, ledger recovery/rollback and final runtime ACL/immutability proof
were not executed. W16 separately observed four admission readings of free
RAM **1652, 1723, 2047, 1998 MiB**; the existing runner requires *all four*
to be >=1844 MiB, so only 2/4 admitted. Docker engine was off; pinned
Owner-signed W6 lease was absent; eight unrelated PostgreSQL processes were
not borrowed, stopped or modified. Read-only V2 previous-SHA database partial
evidence of 96/96 and restricted role is not this full V3 verdict. All
migrations 45/93/94/95/96 remain unchanged. See
`tmp/issue300-w16-v3-killed95-guard/OWNER_EXCEPTION_V3_REAL_RUN_GAPS_2026-10-20.{md,json}`.

## 4 — Real HTTP, authentication and MFA verdict

**BLOCKED / NOT RUN.** Four product Staff identities (CA main Locations A+B,
LM main B, Supervisor B, foreign CA foreign only), scoped receipts, five
independent grant oracles and authentic login/TOTP protocol checks are
source-prepared. No actual four sessions, product MFA factors, real CA/LM
login, genuine authorized S0→S1 Search/Timeline, real signed cursors,
cross-tenant/revocation matrix or ordinary 503 HTTP proof was executed on
this candidate. W18 independently saw NO_LISTENER for task PG58387/58427,
enabled API3167, ordinary API3168 and Dashboard3117; Docker Linux pipe
absent; no task-owned receipt. The ordinary MFA mock tests 7/7 are explicitly
**not real HTTP**. See
[W18 execution verdict](W18_ACTUAL_HTTP_BROWSER_VERDICT_2026-10-20.md).

## 5 — Playwright and UI-M1 verdict

**0/34 actual Playwright PASS; 34 NOT RUN/BLOCKED** (2 functional, 32 UI-M1).
The full 34-case source selectors were fixed and independently reviewed; they
do not create genuine browser traces or assurance. No trusted application
target, real one-use authenticated MFA session, frozen same-fixture golden
PNG hashes or live browser existed. Source freeze/design is still
Owner-approved, not visual regression PASS. Conditional UI01–UI06 states
need their own trustworthy same-fixture screenshot evidence beyond the 32
initial-form layouts. See
[UI-M1 independent visual audit](W23_UI_M1_VISUAL_SOURCE_REVIEW_2026-10-20.md).

## 6 — Full performance campaign verdict

**BLOCKED / NOT RUN.** No genuine 100k or 1m populated mixed-source cohort,
no complete 2-writer/5-reader 600s run, no 8-writer/25-reader 600s run, no
independent 20 cold trials per endpoint and no measured source-correctness,
SQL EXPLAIN, raw HTTP p95 or writer-impact certificate are present for this
candidate. The W19 source guards now reject baseline/live replay, false
reader coverage, falsified p95 and unsigned phases; these are *not* measured
performance results. Actual host: 15.93 GiB total RAM, approximately
0.8–3 GiB free during attempts, C: approximately 5 GiB free, D: approximately
52 GiB free, Docker OFF. No separately authorized adequately provisioned
owned guest/host is available. Conservative *planning* target (not measured
minimum): 8 dedicated vCPU, 32 GiB host RAM with >=16 GiB consistently free,
and >=100 GiB truly free isolated SSD. All prescribed budgets remain
**unchanged**:

| Operation | Warm p95 | Cold p95 |
| --- | ---: | ---: |
| Search | 1500 ms | 3000 ms |
| Timeline | 750 ms | 1500 ms |
| Detail | 400 ms | 800 ms |

Writer-impact ceilings **both <=20% and <=100 ms** remain mandatory. No
runtime performance PASS or threshold reduction is claimed. See
[W19 source evidence](W19_W8_FALSE_PASS_RECONCILIATION.md).

## 7 — All 79 original acceptance gates

See [the append-only exact 79-row disposition](ISSUE300_R2_W21_APPEND_ONLY_79_GATE_DISPOSITION_2026-10-20.md):
**57 BLOCKED; 22 NOT RUN; 0 PASS; 0 FAIL; 0 row OWNER EXCEPTION**. Rows are
exactly T01–T70 and U05-R01–R09; all 79 were uniquely counted in the local
integration check. Historical source/DB/limited older-SHA positives remain
partial evidence, never auto-promoted. The Owner signing exception is a
separate amendment, not a fabricated acceptance row.

## 8 — Independent security and source correctness review

- W20 independently reviewed and cleared the W16 P1 overall-PASS-before-PG-
  stop fix; real killed95 remains unverified.
- W21 independently reviewed W18 and cleared the former zero-case Playwright
  fullTitle selector P1 at reviewed HEAD `9cc28b2f`.
- W22 independently re-audited W19's baseline/live phase replay P1 and found
  no remaining concrete P0/P1 *within that reviewed source scope* at
  `74381b19`; actual 1m performance is not proven.
- W20 reviewed W18 synthetic MFA additions, and W22 reviewed W16 truthful
  V3 admission evidence; both source-only, no actual auth/PG run.
- W23 documented exact frozen UI-M1 source and missing actual screenshot
  baseline provenance. No comprehensive real-production P0/P1 release
  clearance is asserted.

## 9 — Evidence and UI privacy limitations

UI-M1 Concept A decisions and original Audit Events geometry remain frozen.
No browser screenshots, trace, same-fixture PNG hash manifest, real keyboard
focus/zoom/RTL/LTR/DST comparison or live privacy redaction claim has been
verified on this SHA. No human LM session, real TOTP token, private PEM or
production data was acquired or disclosed in this campaign.

## 10 — Final blockers and authorized next execution

1. A verified **owned** isolated PostgreSQL/API/Dashboard/Chromium resource
   with sufficient host RAM/SSD and exclusive admission; human PG and app
   services cannot be borrowed.
2. Real supported ordinary Staff CA/LM credentials and factor enrollments
   produced via product flow; then normal authenticated HTTP/authorization
   tests can run without altering protected proof paths.
3. Genuine U005 historical attestation and signed proof-only endpoints still
   require independent valid cryptographic evidence. Owner's build-signing
   exception does not technically grant that evidence or disable verifier.
4. True V3 actual migration concurrency/kill/recovery, and separate real
   100k/1m workloads and cold-start campaigns must be performed within the
   approved full limits and reviewed on one frozen source SHA.
5. Genuine 34 Playwright cases, immutable UI-M1 same-fixture image baselines,
   and final independent full release/security/privacy review are missing.

**Decision:** Engineering acceptance has NOT met all non-waived criteria;
Issue #300 must NOT be closed. This locally committed report is reviewable
evidence of work performed and explicit limits only. No Push, PR, merge to
main, production deploy, production migration or GitHub Issue closure.
