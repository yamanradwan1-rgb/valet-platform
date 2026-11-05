# Issue #429 — integrated OCR implementation verification evidence

Status: **Review branch only; DO NOT MERGE OR ENABLE PRODUCTION OCR.**
Reviewed source baseline: fetched `origin/main`
`ac758ffff7181efa6cad1311c40aca731171770e` and fetched planning branch
`95ea194099c0e48c417a90956a89fdd22048d79f` (rechecked 2026-11-05).
This record distinguishes static/code results from tests that actually ran.

## Source and review evidence

| Workstream | Committed source | Independent source review | Measured local checks |
| --- | --- | --- | --- |
| Phase 0 / DEC-074 | `d93c962d`, correction `9c38b7a5` | W2 CLEAN | Four-column 12-row U matrix, 34 plan sections, Prettier and diff check PASS |
| W2 shared SQL/privileges | `f120f072`, `b2938901`, `f3e83172`, `12d486bc`, `d8170aab`, `725890e0`, `206d9ed5`, `c821b4e0` | W3/W5/W7 original corrections CLEAN; W8 independently reviewed the two final regression/config fixes CLEAN | Prisma validate PASS; database lint/typecheck PASS; prelease negatives 7/7; **isolated real PG17 OCR suite 7/7 PASS twice (W2 and integrated Prime), owned cleanup 0** |
| W3 Admission / one-use capability | `c7690039` | W4 CLEAN | Focused Vitest 16/16 PASS; API type/lint/architecture PASS |
| W4 provider/API integration | `7abc1e54`, `1c6922c3`, `4ec21f9c`, `7ad9890a`, `b9404974` | W3 mandatory permit/NODE_ENV corrections CLEAN; W8 reviewed exact module-provider fixture correction CLEAN | W4 focused non-PG 69/69 PASS; integrated A/provider/S local mock 36/36 PASS; full API non-PG 1740 passed, 6 skipped |
| W5 settlement/UNKNOWN and operator CLI | `378f7e1e`, `175cc863`, `12f7cb13` | W2 column, role membership and unrelated relation ACL corrections CLEAN | Focused non-PG Vitest 71/71 PASS; TypeScript/ESLint PASS |
| W6 Native deliberate Capture | `7df57894` | W7 CLEAN | 260 Native test files / 1881 tests PASS with 15-second timeout; EN/AR, style freeze, ROI, Torch, lifecycle; Native type/lint PASS |
| W7 independent QA | `aa3bce89`, `e3436845`, `9f81a7a1`, `d62c9dd0`, `29df7878`, `004a99e5`, `3e5f6ec2`, `ee99f6e5` | W5 build-provenance MAJOR fixed and W6 **CLEAN** on 3e5; W8 found a remaining privileged Git/fsmonitor MAJOR, then independently reviewed `ee99f6e5` **CLEAN** for source integration | Integrated offline Node QA **38 passed, 1 skipped** (OpenSSL unavailable), including malicious configured fsmonitor negative, transient source injection, Git hooks, caller digest, child/lease retention, ACL and NOWAIT oracle negatives. Real TLS mock, production two-process HTTP and P1/P2 load **NOT RUN** |

## Repository-wide verification

| Command / gate | Actual result |
| --- | --- |
| `corepack pnpm architecture:check` | **PASS** exit 0; reports only pre-existing documented grandfathered files above 300 lines; changed authored code meets the file-size ceiling |
| `corepack pnpm lint` | **PASS** exit 0; Turbo 11/11 packages successful |
| `corepack pnpm typecheck` | **PASS** exit 0; Turbo 11/11 packages successful after correcting one malformed-permit negative-test cast |
| `corepack pnpm build` | **PASS** exit 0 on an independent complete verification run (10/10 build tasks); another overlapping build invocation failed due Next.js concurrent build lock, not an application compilation finding |
| `corepack pnpm test:non-postgres` after W2/W4 fixes | **PASS** exit 0 across the root pure, API and database lanes; API 1740 passed/6 skipped, database 65 passed; native/visual suite included |
| Explicit integrated isolated PG17 `database-postgres-issue429-ocr` | **PASS** 7/7 on `feat/issue-429-ocr-mvp-prime`, real PostgreSQL17 `127.0.0.1:45432` with Docker labels/volume/DB owner and bounded six-client resource profile; test-created private DB/roles cleaned; harness reports 0 owned leftovers |
| `corepack pnpm --filter @valet/database exec prisma validate` | **PASS** with process-only nonconnecting synthetic migration URL; no DB connection |
| Integrated focused `api-non-postgres` Vitest A/provider/S | **PASS** 36/36; separate focused recovery 71/71 PASS |
| `node --test scripts/test-harness/issue429-qa-*.test.mjs` on final integrated W7 | **PASS** exit 0, **38 passed / 1 skipped**. The OpenSSL-dependent real TLS fixture is **SKIPPED** in this environment, not claimed passed; other QA negatives actually ran |
| `node --test packages/database/issue429-private/target-preflight.test.mjs` | **PASS** 7/7 offline negative target checks; never acquired PostgreSQL lease |
| `git diff --check` | PASS after integration and reviewed corrections |
| Root `corepack pnpm test` (includes PG-dependent suites) | **NOT RUN**: unsafe without attested exclusive isolated PostgreSQL target/lease |
| OCR migrations, live SQL constraints/grants | **PASS in dedicated opt-in isolated PG17 suite only**: one owned private database, migration deploy, scoped role grants, Admission/quota, expiry and NOWAIT maintenance test 7/7; not evidence of multiprocess production behavior |
| Production-mode two-API HTTPS mock, cross-process race and provider settlement | **NOT RUN**: separate preprovisioned scoped QA runtime target, synthetic identities, TLS/egress approvals and trusted build were not provided; no external OCR call |
| Paired ordinary Check-In P50/P95/P99 with confidence interval; independent headroom-qualified NOWAIT false-denial envelope | **NOT RUN**: representative traffic not approved/configured; no valid baseline/candidate pair, confidence bound or resource telemetry |
| Android/iOS physical-device testing | **NOT RUN**: Phase 7 removed by Owner; automated appearance checks do not replace device proof |
| GitHub remote CI | **NOT RUN / UNVERIFIED** until an authorized review-branch push and actual job conclusion |

## Security and release conditions

The implementation defaults platform and Organization OCR OFF, makes Admission
and immutable debit durable before provider fetch, denies unknown COMMIT,
consumes one private synchronous pre-fetch permit, conservatively settles
possibly invoked HTTP to `UNKNOWN`, and keeps Manual/No Plate Check-In
independent. These are **source-reviewed properties**, not validated live
PostgreSQL/remote-provider execution guarantees. No real provider billing,
subscription, privacy, rate/pricing or remote-completion claims are inferred.

W7 provenance now rejects externally supplied artifact SHA as proof and builds
API plus contracts from an internally pinned detached Git snapshot, with
restricted subprocess environment, disabled Git hooks and filesystem monitor
for **all privileged Git source attestations**, isolated runtime dist,
internally sealed digests and retained snapshot/lease if child exit is uncertain.
W6 and, after the final Git environment correction, W8 independently rated
the code **CLEAN for source integration**, not an executed production smoke.
A hostile same-UID local actor can still change read-only
files by changing permissions; this is not a cryptographic or OS-enforced
attestation against an untrusted machine.

Docker Desktop initially became unavailable during the run, then recovered.
Prime verified the isolated Compose project `vaylet-test`, the test-labeled
`postgres:17-alpine` container, exact `127.0.0.1:45432` port, approved private
volume and database owner, obtained the local dedicated test URL, and ran the
strict prelease/owned-resource PostgreSQL fixture. The test-only database and
roles were removed, and the harness reported zero residual owned resources.
This authorization does **not** cover other PostgreSQL projects, production
databases, QA two-process HTTP smoke, paid OCR traffic or release/activation.

Open gates before merge/activation: execute the separately preprovisioned W7
production-mode HTTPS/ACL/cost and cross-process correctness/failure
and production-mode HTTPS/role tests; authorize representative normal
and peak envelopes, then run paired Check-In and NOWAIT tests to the accepted
statistical gates; obtain physical Native proof **before acceptance or merge**
as explicitly required by Accepted DEC-074 §§19–20, unless the Owner formally
amends that decision (Phase 7 removal is not such an amendment);
verify provider account/cost cycle/TLS/egress/privacy, human-bound operators,
alerts/recovery schedule, CI and separate production Owner approval. Without
this evidence the branch is suitable only for **Owner source review**.

## 2026-11-05 follow-up qualification — latest scoped evidence

This addendum supersedes **only** the historical CI/attempt status in the earlier
table; earlier PASS results remain historical and are not claims of new execution.
The starting Prime worktree was clean at
`acbeb2d2d73ed893916cb81148a4c96e7e75ff10`; `git fetch origin` confirmed
the matching review-branch remote and unchanged `origin/main`
`ac758ffff7181efa6cad1311c40aca731171770e` (0 behind, 52 ahead).

### Directly observed in this qualification attempt

| Gate | New evidence and scope | Verdict |
| --- | --- | --- |
| Isolated PG17 container discovery | Docker server 29.5.3; `vaylet-test-postgres` `postgres:17-alpine` healthy, loopback `127.0.0.1:45432`; Docker being healthy does **not** attest a dedicated runtime DB, restricted role, or exclusive lease | Available container only |
| Production-mode two-process API HTTPS smoke | W4/Prime checked prerequisites; `ISSUE429_QA_EXCLUSIVE_PG17`, the distinct admin/runtime URLs, private synthetic actors, trusted CA/egress evidence and OpenSSL executable were unavailable in the execution environment. **No exclusive lease, DDL, API child, HTTP mock or two-process test was started.** Do not construct plausible substitute credentials/identities or disable TLS to force PASS | **NOT RUN / BLOCKED** |
| P1 ordinary Check-In | `issue429-qa-preregister.json` has `approved: false`, no preregistered normal/peak/recovery arrival rates or schedules, no baseline-vs-baseline sensitivity, and no real baseline/candidate Check-In samples. Existing statistical analyzers cannot create measurements. No observed p50/p95/p99 or confidence interval | **NOT RUN / NOT QUALIFIED** |
| P2 NOWAIT availability | Same unapproved normal/peak workload; no authorized two-process restricted-role run, no ordered independent eligibility/headroom oracle, no eligible attempt denominator or load-block confidence evidence. `LOCK_BUSY` count/rate and confidence limit cannot be measured truthfully | **NOT RUN / NOT QUALIFIED** |
| Offline QA focused negatives | Direct Prime `node --test` of Issue429 qualification, production-target and runtime-ACL test modules: **20 PASS, 0 FAIL, 0 SKIP**. Validates refusals/oracle contract, **not** production runtime/load | PASS (offline only) |
| Native focused automation / frozen UI | W6 existing worktree: **33 files / 255 tests PASS** for plate/camera/appearance; **11 files / 79 tests PASS** for dictionary, RTL, styles, QR, accessibility. Total **44 files / 334 tests PASS**; code parity with integrated Prime checked and no new Native fix required. Earlier complete 1881 tests remain historical, not repeated | PASS (focused automated only) |
| Actual remote GitHub check-runs on initial SHA | Public GitHub REST `/commits/<SHA>/check-runs`: `security-gate`, `dependencies-osv`, `dependencies-trivy`, `secrets-gitleaks`, `sast-semgrep`, `sast-codeql`: all `completed/success` for **acbeb2d2**. `.github/workflows/ci.yml` triggers only on `main` push or PR targeting `main`; no PR was created. Any later SHA requires fresh CI verification | Security CI 6/6 PASS **for initial SHA only**; normal CI not evidenced |
| W4 API verification | W4 verified the already-integrated ownership fixture correction `b9404974`; integrated Prime focused `feature-check-in-ownership` 2/2 PASS, nine OCR/provider/management/ownership non-PostgreSQL suites **80/80 PASS**, API lint and typecheck PASS; no new W4 code or production process run | PASS (focused mocks only) |
| Full Issue429 offline QA after focused evaluator correction | Prime directly ran `node --test scripts/test-harness/issue429-qa-*.test.mjs`: **39 PASS, 1 SKIP, 0 FAIL**. OpenSSL real TLS fixture remains SKIPPED. Root `pnpm lint` and `pnpm typecheck` reported **11/11 successful, all Turbo cache hits**; architecture check PASS with 17 pre-existing grandfathered warnings; `git diff --check` PASS | PASS (offline/static only, cached root gates noted) |

### Independently identified qualification-evidence limitation

W8 reviewed the statistical and Production-mode harness **READ-ONLY**, not as
runtime proof. The offline performance evaluator consumes user-supplied JSON
assertions for ordered headroom, independent process/provider counters, and
runtime attestation. It cannot independently verify their provenance; allowing
such declarations to produce a final release `PASS` was a **MAJOR false-positive
risk**. The narrow follow-up correction ensures top-level
`qualifyIssue429()` **downgrades any otherwise positive self-attested offline
evaluation to `INCONCLUSIVE`** while retaining `FAIL` for failed evidence. An
explicit regression test covers this fail-closed rule. This does **not**
implement or independently attest the missing real sampler, committed-ledger
oracle, sufficient approved NOWAIT sample/upper-bound policy, preregistered
baseline sensitivity, or the full F01–F25 multiprocess recovery/kill matrix.
These remain **open qualification blockers**, not passing checks.

### Android — Owner acceptance remains pending

Owner will conduct physical Android testing personally; Phase 7 is **not**
reinstated. Record app SHA/version, Android model/OS and synthetic authorized test
account; do not call commercial OCR unintentionally. Device checklist:

1. Camera readiness/background/theme changes do not auto-capture; explicit Capture performs one operation; rapid double-taps do not queue or duplicate sends.
2. Verify plate framing/ROI alignment and Torch on rear preview; a clean `NO_MATCH` keeps **the same** preview/ROI/Torch without remount, and the second explicit Capture works with no auto-retry.
3. A candidate is editable, and only deliberate **Human Confirm** can continue identity/returning recognition; Manual Entry and No Plate remain available on success, `NO_MATCH`, offline, permission denied, timeout and provider unavailable.
4. Close/Back, logout, background, Location switch, cancellation and delayed response do not resurrect camera or write stale plate/session state; Torch/resources clean up.
5. Capture EN/AR × Light/Dark screenshots on normal and small-screen/large-font settings, verify identifier RTL/LTR, no frozen-style/layout regression; check TalkBack labels, busy/disabled state, Torch, `NO_MATCH` announcement and permanent fallback reachability.

**Physical Android result: `PENDING OWNER ANDROID TEST` — NOT RUN, never PASS.**

**Change control:** Production OCR remains OFF. This follow-up does not approve
PR creation, merge, deployment, production migration, paid OCR, or automatic
activation. Owner review only until runtime integration, representative P1/P2,
actual required CI and physical-device evidence satisfy all acceptance gates.
