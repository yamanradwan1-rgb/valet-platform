# VAYLET #319 — focused eight-fix final acceptance and direct merge evidence

Date: 2026-10-23. Owner authorized **local acceptance and direct merge into
`main` without CI**, but no PR, deployment or automatic Issue closure. This
addendum preserves all original audit reproduction logs and earlier five-fix
and three Company Admin RR gate reports unchanged. It is not a claim of
universal security for the 85 inventoried Dashboard/Management GET routes.

## Exact source and defect scope

- Existing branch: `audit/issue-319-dashboard-revocation-coverage`.
- Starting source/evidence SHA: `1f4aa54f5ad89e768e85b9bbed25d39385b79c31`.
- Historical vulnerable application baseline and original `main`:
  `20998a069eb5d576895c0e6c149271a4a0e4028b`.
- Eight confirmed P2 families preserved: F319-01 Physical Resources LM,
  F319-02 Configuration LM, F319-03 Branding LM, F319-04 Subscription LM,
  F319-05 Physical RR Company Admin retired MFA factor, plus CA-RR-A KPI,
  CA-RR-B Company Analytics, CA-RR-C Company Reports.
- All eleven production-file changes are backend authentication / Dashboard /
  Management read paths. No React/CSS/translations, migrations, schema,
  runtime privilege grants, native/customer application, or production data.
- Historical RED reproductions are retained in existing `logs/` and
  `ca-rr-final-gates` evidence. The original 25/25 audit intentionally
  *reproduced* insecure 200 responses; it is not treated as a fix PASS.

## Final new real-HTTP/PostgreSQL proofs

All test sessions used unique disposable loopback PostgreSQL **17.11** clusters,
with explicit owner opt-in and synthetic data. `issue315_owner` was limited to
the private cluster. Every uniquely named `valet_runtime_*` application role
was nonsuperuser without CREATEDB/CREATEROLE. The final acceptance test source
adds only focused tests/fixture helpers; **no additional production fix was
necessary in this continuation**.

| Test run (`-Evidence remediation`) | Result | Proof / log prefix |
|---|---:|---|
| `-Suite audit -RunTag final-reader-export-first -TestFile test/dashboard-issue319-final-reader-export.integration.test.ts` | **5 PASS / 0 FAIL / 0 SKIP** | `logs/final-reader-export-first-audit-*` |
| `-Suite audit -RunTag final-retry-cleanup-first -TestFile test/dashboard-issue319-final-retry-cleanup.integration.test.ts` | **5 / 0 / 0** | `logs/final-retry-cleanup-first-audit-*` |
| `-Suite audit -RunTag final-319-merge-acceptance` | **89 / 0 / 0**, 20 files, 239.80 s | `logs/final-319-merge-acceptance-audit-*` |
| `-Suite baseline -RunTag final-315-merge-acceptance` | **28 / 0 / 0**, 4 files, 71.18 s | `logs/final-315-merge-acceptance-baseline-*` |
| Four local quality commands, no CI | **4 exit 0 / 0 failures** | `logs/final-merge-quality.txt` |

### Fresh tests: exact ordering and failures

1. KPI **reader-first** holds current session-bound MFA authority across its RR
   projection; actual canonical recovery HTTP waits (recorded backend PID and
   `pg_blocking_pids`), then subsequent requests deny with 403.
2. Company Report **reader-first** has the same real waiting-writer ordering;
   authorized response precedes retirement commit, with fresh 403 afterward.
3. WEEKLY and MONTHLY reports independently prove **revoker-first**: canonical
   recovery commits after the initial RR snapshot but before authoritative MFA
   factor fence, producing 403 and **no** synthetic Location timezone.
4. CSV export independently proves recovery committing after report RR
   materialization and before the fresh export authorization finalizer results
   in 403, no CSV bytes/headers and no extra export-generation audit event.
5. Separate actually committed PostgreSQL factor-row UPDATE after the first RR
   snapshot creates SQLSTATE **40001**; one conflict produces two fresh
   attempts and an authorized synthetic projection; five conflicts exhaust
   the five-attempt limit and **reject**. A subsequent clean attempt succeeds.
6. Factor-row lock acquisition timeout **55P03**, actual backend cancel
   **57014**, and a projection exception all reject; a subsequent fresh
   transaction succeeds from the bounded one-connection pool. Advisory locks
   are absent on the returned idle connection.

The full 89/89 run also repeats real Staff Management revocation races,
seven Physical GET route patterns, #315-compatible lease behavior, LM/CA MFA
eligibility, location lifecycle deactivation, two-reader writer ordering and
unrelated Organization parallelism. Independent reader/revoker traces are in
the exact raw log; timer delays alone are not interpreted as proof of order.

All four isolated final testing runs' cleanup files show **zero remaining test child
connections/databases**, the task-owned PostgreSQL process stopped, and its
uniquely allocated cluster directory removed. No shared database was used.

## Performance — descriptive local loopback only

Final #319 full-suite uncontended sequential HTTP measurements (one warmup
and 80 samples per indicated route):

| Route | p50 / p95 ms in this run | Historical original audit p95 ms |
|---|---:|---:|
| Dashboard Overview keys | 7.76 / 14.01 | 20.95 |
| Physical key slots LM | 7.59 / 10.33 | 14.05 |
| Scope discovery | 5.23 / 6.99 | 25.32 |
| Physical RR overview LM | 9.36 / 14.16 | Not measured |
| Physical key slots CA with MFA | 6.02 / 7.56 | Not measured |
| Physical RR overview CA with MFA | 11.05 / 12.61 | Not measured |
| Legacy Configuration | 6.90 / 8.56 | Not measured |

The separate final full-suite fixed-path CA RR performance test used **40
samples per route**: KPI p50/p95 **17.52/21.28 ms**; Company Analytics
**17.68/27.61 ms**; DAILY Company Report **23.65/30.27 ms**.

These tests ran on separate local fixtures/conditions and are not production
SLAs or rigorous causal before/after comparisons. Lock contention is reported
by observed actual waits rather than conflated with uncontended p95. No
deterministic scenario deadlocked. Extended saturation/soak and all 85 read
patterns remain unverified, not claimed secure. Two #315 PASS tests deliberately
*characterize*, rather than remediate, uncoordinated privileged raw SQL
`DELETE` / uncommitted grant writes; these lie outside the accepted canonical
administrative-writer security guarantee and are **not** counted as safe.

## GitHub merge gate and environment safety

- Before merging, GitHub `main` HEAD was the original application baseline
  `20998a...`, with branch API `protected=false`, required status checks
  disabled. The branch-protection administration endpoint returned 403 to the
  GitHub App; server-side push protection remains authoritative.
- The original local `main` worktree has unrelated dirty `next-env.d.ts`
  and owner-local helper files. **Preserve these without a reset, stash,
  checkout, or touching their files**; use a clean detached task-owned merge
  worktree for the actual two-parent merge and a non-forced push.
- Existing CI workflow triggers `push: main`; the Owner approved `[skip ci]`
  in the merge commit, not disabling branch protection or changing workflows.
- No PR, deployment, shared/production DB mutation, or Issue closure is
  authorized. Exact branch/merge SHA and final GO will be attached to the
  Issue #319 comment after the independently accepted merge.

## Security disposition and unverified boundaries

Independent READ-ONLY reviewer **signed focused SECURITY GO before the
evidence/test commit**, after inspecting all eleven backend source diffs,
new test source, raw #319 89/89 and #315 28/28 suites, new focused 10/10,
four exit-zero quality checks and disposable PG cleanup. **Confirmed
surviving P0=0, P1=0, P2=0 within the eight exercised fix families**;
no new release blocker was found. The reviewer authored no production or
test changes. Their final merge GO still requires the exact post-commit
source/evidence SHA and remote-policy recheck; untested adjacent routes and
already-resolved/logout timing contracts are not silently relabeled fixed.
Architecture's 17 grandfathered >300-line warnings are on unchanged legacy
paths and its check exits zero.
All exported logs use synthetic labels, and no bearer tokens, TOTP secrets,
recovery codes or production personal data are included.

**Do not merge if #315, quality, or final independent security review is
not green; do not automatically close #319.**
