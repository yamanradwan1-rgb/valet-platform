# Automatic WhatsApp Guest Access — Prime Final QA Remediation

## Authority and review boundaries

Baseline 1ecdbeff1c4b7b011a1af00c843f7930e515cea4.
Original review candidate 6b1810d38456495f3c42783f266af82a4c72cf1d.
DEC-105 authorizes only a disabled/mocked, narrow encrypted outbox.
The independent W7 replacement worked in a separate read-only checkout and
committed docs/validation/whatsapp/W7_INDEPENDENT_SECURITY_ACCEPTANCE.md
at 6f25ddd16baf17a76d2383d7f5a761b2010769cb. Original W7 never ran.
The independent original-SHA verdict was FIX REQUIRED, not GO.

## Integrated cumulative remediation candidate — 2026-10-16

The nine review/remediation commits already present on isolated
`fix/wa-webhook-padded-wamid` were reviewed and integrated with
`git merge --ff-only` into `feat/automatic-whatsapp-guest-access`.
The initial fast-forward integration candidate was
`3edbd9369839bf3d979b52af25fb5fee732059e0`, parented on the previously
pushed `6b1810d38456495f3c42783f266af82a4c72cf1d`. The remote branch has
**not yet been pushed** at this checkpoint; exact-final-SHA W7 review and the
root PostgreSQL/non-PostgreSQL test gates remain pending. No PR, main merge,
deployment, production migration or real message was executed.

Post-integration read-only W3 peer review found an additional W5 parser P2:
the webhook status accepted the generic signed `not_a_wamid`, which the Meta
provider acceptance parser correctly classified `UNKNOWN`. Prime added an
explicit failing negative regression, then corrected only status correlation
ID grammar (WABA/phone/opaque handle remain unchanged), commit
`767964267ac822aa032111b743c15149cb0c402c`. The regression was RED
(1/2 file test failed) before the change and GREEN (13/13 scoped provider,
webhook and HMAC tests) afterward; API typecheck, scoped ESLint and diff check
also passed. **Current production-code candidate is `767964267ac822aa032111b743c15149cb0c402c`.**

Fresh tests on the *integrated local feature branch* (not standalone owner
preview branches):

| Command / evidence | Actual result |
|---|---|
| `node packages/database/scripts/outbound-migration-smoke.mjs` | EXIT 0, 92 pristine migrations PostgreSQL 17; PUBLIC/API/sender/webhook ACL, 090 forgery denial, 091 signed-callback crash recovery, 092 changed-phone suppression/purge, UNKNOWN no-resend, no real sends |
| `pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres whatsapp-` | EXIT 0, 16 files, 93/93 passed |
| `pnpm --filter @valet/dashboard exec vitest run src/features/administration/settings/whatsapp-settings-api.test.tsx` | EXIT 0, 3/3 passed |
| `node --test scripts/whatsapp-ui-freeze-guard.test.mjs` | EXIT 0, 3/3 passed |
| `node scripts/whatsapp-ui-freeze-guard.mjs` | EXIT 0; 125 changed paths; original UI manifest retained |
| `pnpm architecture:check` | EXIT 0; grandfathered structural warnings only |
| `pnpm lint` | EXIT 1; unchanged Dashboard issues (10 errors/3 warnings), pinned baseline reproduced |
| `pnpm typecheck` | EXIT 1; unchanged Employee Web `timezone` fixtures, pinned baseline reproduced |
| `pnpm build` | EXIT 0; 10/10 tasks; Windows long-link warnings only |

Independent W1 scoped `guest-t3-cost` comparison: both pinned baseline
`1ecdbeff` and integrated candidate `3edbd936` returned **EXIT 0, 1/1 PASS**
using the expected anti-abuse index-only scan on the same local PostgreSQL
17 target. This does not resolve the prior *full-suite* query-plan failure;
root differential under the protected task-owned Worker9 fixture is required.

## Independent W7 findings and remediation ownership

| Finding | Level | Independent regression | Owner |
|---|---|---|---|
| W7-P1-01 | P1 | PostgreSQL runtime INSERT forges enabled Meta sender verification | W1: forward-only 090, restricted column INSERT and 42501 negative |
| W7-P1-02 | P1 | Padded Base64 wamid wrongly UNKNOWN and webhook 400 | W3 provider + Prime W5 parser; positive/invalid-padding tests |
| W7-F33 | P2 | Customer phone change leaves PENDING encrypted envelope and due claim | W1/W4: early durable suppression/purge, race proof |
| W7-F11 | P2 | Signed DELIVERED then sender crash wrongly becomes UNKNOWN | W1: forward-only 091 authenticated-event-aware recovery |
| W7-K01 | P2 | Issuer accepts private RSA key as a public PEM input | W2: reject private PEM, retain RSA3072 public sealer |
| W3-P2-ID | P2 | Webhook status generic ID accepted where outbound provider rejects it | Prime W5: `76796426` enforce exact bounded `wamid` status grammar; RED/GREEN negative test |

W4 independently reran its six customer-phone-change races on integrated
`3edbd936` against local PostgreSQL 17.11: 1/1 file, 6/6 cases, exit 0,
orphan database/role/child-process count zero. Those tests do not cover a
seventh boundary: Customer phone changes **while delivery is DISPATCHING**, then
the provider returns a definite nonacceptance that would normally schedule
`RETRY_WAIT`. W4 and W1 are checking this as a *suspected* P2 until there is
reproducible real PostgreSQL evidence. A pass on the existing six cases does
not prove that additional scenario safe.

**Later verified correction to the suspected behavior (W7-F33-R2):**
W1 and W4 independently demonstrated on real PG17 that the 086 trigger
actually throws `OUTBOUND_NO_REQUEUE` (SQLSTATE `23514`) when the 089 result
finalizer tries to schedule `RETRY_WAIT` for a *known definitive
nonacceptance*. The transaction rolls back, leaving `DISPATCHING` until
terminal lease recovery. This affects both stale-phone cancellation and
ordinary unchanged-phone bounded legitimate retries; **a stale RETRY_WAIT
commit was not reproduced**. On the actual pre-093 feature source W4 added
three additional regressions (changed phone+definitive negative, unchanged
phone+definitive negative, changed phone+UNKNOWN): **7/9 passed, 2/9 failed**
with 23514. W1's forward-only 093 preview with a monotone routing-uncertain
marker, fail-closed migrated in-flight attempts, narrow proof-bound retry
guard and suppression/purge was preliminarily **9/9 GREEN on PG17.11** using
W4's real test scenarios; no `UNKNOWN` retry was allowed. Its final commit,
stable exact source SHA and independent W7 final retest remain required.
W7's independently authored source-corroboration/open-finding update
`b9848617` was integrated docs-only as feature commit `cd0b6397`.

**Remediation integrated and freshly retested:** W1 committed forward-only
093 as `38060c9a`; Prime cherry-picked it into existing feature branch at
`500a5f6802437370251cfba7d5eb8dbbfe51de77`. W4's three additional
real-PG RED negatives (7/9 before) were integrated as `2cace830` from W4
`918ce56c`; W7's independent OPEN finding as `cd0b6397`. Integrated local
PostgreSQL 17 smoke on source `500a5f68` applied **93 pristine migrations**
with EXIT 0, verifying changed-phone definitive and NOT_SENT results are
SUPPRESSED with envelope purge, unchanged-phone bounded RETRY_WAIT, positive
signed callback acceptance, and terminal UNKNOWN no resend. Historical
migrations 086–092 are intact. New migration 093 conservatively flags
pre-upgrade in-flight attempts as routing-uncertain, with no phone or HMAC
material stored. W7 independent re-review must still cover exact new source.

W7 independently reproduced the first, third and fourth in isolated real
PostgreSQL 17, the second via real TypeScript functions and the fifth via
synthetic RSA key input. Initial 89-migration SQL smoke, focused 88/88 API
unit and 3/3 UI freeze tests passed but did not disprove these negatives.
W7 must independently retest every fix on the exact final cumulative SHA
before an independent acceptance verdict can be issued.

W7's **second independent** report was received on source
`767964267ac822aa032111b743c15149cb0c402c`: W7's own PostgreSQL 17
92-migration smoke, 93/93 scoped WhatsApp unit cases, 3/3 freeze tests,
credential key-class probes and matched provider/webhook message ID parser
negatives all passed, including the originally confirmed five deficiencies.
Independent QA commit `948b8e8717a8fcacffdd6a29da08207819d56b0e` was
cherry-picked docs-only as local feature commit `cd74b068`. W7's actual
verdict remains **BLOCKED**, explicitly not GO, pending full root PostgreSQL,
non-PostgreSQL differential and any newly proven F33 edge. This independent
report predates any additional W1 migration that may be needed for that edge.

## Baseline differential evidence

Pinned baseline and feature use Windows, Node v24.19.0, pnpm 10.34.5 and
frozen workspace lockfiles. The baseline detached checkout installed offline.

| Gate | Pinned main | Feature checkpoint | Attribution |
|---|---|---|---|
| Lint | FAIL 13 Dashboard diagnostics: 10 errors, 3 warnings | Same failures | PREEXISTING reproduced |
| Typecheck | FAIL Employee Web staff-operational-context timezone fixtures | Same failures | PREEXISTING reproduced |
| Architecture check | PASS with existing grandfathered oversized files | PASS | No feature regression at checkpoint |
| Build | PASS 10/10 tasks | PASS 10/10 tasks at original feature SHA | Prior source evidence, final SHA needs rerun |
| Non-Postgres | Full root EXIT 1: API 798 pass/6 skip/0 fail, DB 64 pass, unrelated pure Turbo failures | Full root EXIT 1: API 872 pass/19 timeout/6 skip, DB 64 pass, same unrelated pure Turbo failures | Baseline pure Turbo failures **PREEXISTING**; 19 feature-run 5s timeouts **UNRESOLVED**, rerun without concurrent load required |
| Full PostgreSQL | Baseline root protected run pending | Exact root protected run cannot overlap active Worker9 fixture owner | **BLOCKED** until exclusive authenticated fixture available |

## Protected PostgreSQL environment recovery

The protected Issue #215 root harness correctly rejected an unverified DB.
Docker Desktop engine was started and the repository-owned Worker9 PostgreSQL
17 disposable fixture was created with verified pinned postgres:17-alpine
image identity, per-run issue/owner labels, dynamic loopback port and tmpfs
storage. The fixture's local runtime manifest provides task-only credentials
and test-run identity. NODE_ENV=test and the exact Worker9 manifest fields
are required for bootstrap. The official worker9 fixture checks ownership,
image, port, labels and database principal, and is stopped and removed by
the harness wrapper even on test failure. No application or production
database was used. Initial full Postgres run has shown a guest-t3-cost
query-plan failure; attribution requires a matching baseline/isolated rerun.
W1 restricted binding INSERT candidate independently passed 90 pristine
forward-only migrations, least privilege and denied-forgery 42501 negatives.

### Controlled full root non-PostgreSQL baseline comparison

W2 ran unmodified `pnpm test:non-postgres` sequentially on pinned baseline
`1ecdbeff1c4b7b011a1af00c843f7930e515cea4` and feature source
`cd74b068a0cd6e604ed82b93bfcc8489a7067745` with stock timeouts and
the same Node/pnpm versions and machine:

- Baseline: EXIT 1, 98,678ms. API 798 passed, 6 skipped, 0 failed;
  database 64 passed; pure Turbo lane EXIT 1 from independent preexisting
  Dashboard/Native/Employee web checks. Capacity-harness 10/10 and mobile
  boundaries 44/44 passed.
- Feature: EXIT 1, 98,185ms. API 872 passed, 6 skipped, **19 timed out** in
  five unchanged architecture/capacity test files at stock 5,000ms under
  simultaneous PG and Turbo load; database 64 passed; pure Turbo failure
  also present on baseline. Focused unchanged 54-case capacity/mobile
  regression run passed on *both* source trees with no timeout increase.

These differences are recorded, not hidden. The feature's 16 additional
WhatsApp files increase test workload; the timeout differential may reflect
resource saturation but is **not yet attributed** until a quiescent rerun
isolates concurrent PostgreSQL jobs and examines any surviving failures.
No timeout increase, assertion deletion, skip or unrelated code change was
made to obtain a PASS.

## Frozen scope and external gates

The original 2,174-path protected UI baseline manifest must remain unchanged.
Zero Native, Employee Web, Customer Web, unrelated Dashboard, navigation,
translations, shared design or snapshot edits are authorized. The original
WhatsApp Dashboard settings carve-out remains unchanged.

Real sending and issuance remain disabled. No real Meta delivery or consent
was fabricated. External gates remain: actual recipient opt-in/withdrawal
governance; Meta company onboarding; AR/EN approved templates; tested
fragment compatibility; key custody, backups, retention and restore; physical
Native device; explicit production migration/deployment and main merge
authorization. This QA task authorizes none of those external actions.

Final verdict and final source SHA must be updated with exact cumulative
test results and W7 independent retest; this preliminary document is not GO.

---

## Final integrated production-source review and independent disposition

**Authoritative source tested:** `500a5f6802437370251cfba7d5eb8dbbfe51de77`.
The subsequent W7 evidence-only commit `13f31cdac0a804c8f5dcb2d27e781f5483614577`
changes no runtime source. Earlier 767/3ed test tables above remain valid as
dated checkpoints, *not* claims about the final source. Baseline stays
`1ecdbeff1c4b7b011a1af00c843f7930e515cea4`. The final pushed
documentation HEAD and remote-tracking parity must be confirmed by Git.

### Final actual PostgreSQL feature-lane evidence (local disposable PG17)

| Test and exact invocation scope | Outcome on source 500a5f68 |
|---|---|
| `node packages/database/scripts/outbound-migration-smoke.mjs` | **PASS EXIT 0**; **93 pristine forward-only migrations**; restricted runtime roles, denied forged Meta provider onboarding 42501, accepted signed callback crash recovery, exact 093 changed-recipient suppression, unchanged-recipient bounded negative retry, and UNKNOWN no-resend. Global issue/send switches OFF/OFF. |
| `pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-postgres-race whatsapp-` | **EXIT 0**, 21 passed, 9 skipped (the 9 W2 Intake cases need the explicit W1 integration switch, so **these skips are not counted as verified passes**); 4 successful race files: 9 changed-phone/F33, 8 multi-replica, 4 Dashboard authorization. |
| Same `api-postgres-race` runner, explicitly `WHATSAPP_W1_MIGRATED=1`, `test/whatsapp-intake-postgres-guards.test.ts test/whatsapp-intake-postgres-lifecycle.test.ts` | **PASS EXIT 0, 9/9**; enabled only after migration 093 was verified in disposable test DB; W2 atomic issuance/replay/consent and revocation paths. The environment flag was removed after execution. |
| `pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-postgres-standard whatsapp-` | **PASS EXIT 0, 1/1** callback-first race. |
| Each completed API PG harness lane | Cleanup **db=0, roles=0, children=0**. The Worker9 protected global target is independent and was not modified by these local test lanes. |

### Independent W7 exact-source security acceptance

The *replacement, genuinely independent* W7 agent inspected exact source
`500a5f6802437370251cfba7d5eb8dbbfe51de77` in its own isolated QA
worktree, independently executed a **93-migration PostgreSQL smoke**, the
dedicated **9/9 actual PostgreSQL phone/replica races**, **93/93** focused
WhatsApp API non-PG tests, **3/3** UI freeze tests and **126-path** freeze
inspection. W7 authored additional upgrade test across 092->093: old in-flight
attempts conservatively marked uncertain, new attempts clear by default,
monotonic flag cannot be cleared (23514). Its own crypto/parser probes verify
three valid and eight invalid provider IDs, RSA3072 issuer-public vs private
PEMs, callback authority/role constraints. All original two P1, three P2,
W3's additional message-ID P2, and verified W7-F33-R2 now **PASS in
scope**. W7 report commit `d3f49f86be2c96dd63dfe0ce37b33a5d65e77fb1`
was cherry-picked docs-only as `13f31cda`. See
`W7_INDEPENDENT_SECURITY_ACCEPTANCE.md`, post-093 section, for full threat
register, independently executed commands and explicit **BLOCKED / NOT GO**.

### Root repository acceptance gates and classification

| Gate | Pinned baseline | Feature at final source or closest explicitly dated candidate | Classification |
|---|---|---|---|
| Lint | **FAIL**, 10 Dashboard errors/3 warnings | **FAIL**, identical unchanged Dashboard diagnostics (re-run on final candidate) | **PREEXISTING**, independently reproduced |
| Typecheck | **FAIL**, Employee Web `timezone` fixture errors | **FAIL**, same unmodified Employee Web fixtures (re-run on final candidate) | **PREEXISTING**, independently reproduced; task-owned API typecheck PASS |
| Architecture | **PASS** with permitted grandfathered source-size warnings | **PASS**, final 500a source | No feature regression |
| Build | **PASS 10/10** historical baseline | **PASS 10/10, EXIT 0** on final production source 500a (79.1s; only preexisting Windows long-symlink warnings) | No identified build regression |
| Full non-PG | **EXIT 1**, API 798 passed/6 skipped/0 failed, DB 64 pass, pure Turbo failures in unrelated UI/Native/Valet | **EXIT 1** on `cd74b068`, API 872 pass/19 stock-5s timeouts/6 skipped; DB64 pass; same unrelated Turbo failures | Pure Turbo **PREEXISTING**. 19 feature-run timeouts **UNRESOLVED** due overlapping load and additional test workload; never classify as baseline without a quiescent full rerun |
| Protected full PostgreSQL (`pnpm test:postgres`) | No equivalent completed run | **BLOCKED for exact final source 500a**: already owned Worker9 root job launched at 01:13 on older source, actively heartbeating and progressing, no exact-final-SHA test result/cleanup available | **ENVIRONMENT/EXCLUSIVE-OWNERSHIP BLOCKER**; NOT a PASS |

Protected Worker9 fixture reported and independently inspected via repo
attestation: PostgreSQL **17.10**, container
`issue215-worker9-pg-3492a50e5fb5`, loopback `127.0.0.1:52510`, protected
empty owner DB `issue215_empty`, task/run labels, pinned image digest, tmpfs,
no external mounts. Root runner run ID
`run_root-tests_lt0_d5576746a364`, owner process 28260 started
**2026-10-16 01:13 Asia/Amman** on older code and had a fresh heartbeat and
active `api-postgres-compound` child at the last inspection. The historical
`guest-t3-cost` query-plan failure was reproduced as **PASS 1/1** both on
baseline 1ecd and source 3ed on equivalent local PG17, with correct index-only
scan, no residue; the root-suite-specific failure remains not conclusively
attributed. Because the active task-owned protected runner is *not orphaned*,
we did **not** kill it, steal the fixture, weaken its lease/attestation, or
claim its old-source result verifies final 500a. After its real owner-runner
exits and the supported harness tears down the target, an exclusive exact
final-SHA `pnpm test:postgres` and controlled-load non-PG differential remain
mandatory before an engineering GO.

### UI/secret/operations freeze and remaining decisions

Manifest: original **2,174 protected entries** left untouched. Native UI,
Employee Web UI, Customer Web UI, unrelated Dashboard UI, visual snapshots,
navigation, shared design and translations: **ZERO changed files**.
Approved Dashboard WhatsApp settings alone remain as in original C0 scope.
No outbox plaintext/secret-key/recipient token was added by remediation;
no unauthorized committed credentials were used. Real Meta send, automated
initial issuance, operator controls: **OFF** in tested DB. No synthetic consent
was substituted for actual recipient proof. No PR, main merge, production DB
migration, deployment, live Meta request, or physical Native release test.

**Final engineering disposition: BLOCKED — NOT ENGINEERING GO.**
The previous known feature-attributable regressions have scoped fixes and
independent W7 negative verification, but required protected root PostgreSQL
and clean full non-PG regression attribution are incomplete. This is a
reviewable security-remediation branch/report, not merge or deploy approval.

**Final-source root command details:** `pnpm lint` EXIT 1 (same 10 Dashboard
errors/3 warnings observed on pinned baseline); `pnpm typecheck` EXIT 1
(same unmodified Employee Web `timezone` fixtures observed on pinned
baseline); `pnpm architecture:check` EXIT 0; `pnpm build` EXIT 0,
**10/10 packages**, no new compile regression. API typecheck EXIT 0.
Focused latest-source API WhatsApp EXIT 0 **93/93**, typed Dashboard transport
EXIT 0 **3/3**, UI guard test EXIT 0 **3/3** and protected manifest guard
EXIT 0 **126 changed paths**. The official full root PostgreSQL execution
*on 500a* remains unavailable behind the live, owned, older-source run.
