# VAYLET Stage C Automatic WhatsApp Guest Access — Prime Evidence

Repository: `yamanradwan1-rgb/valet-platform`
Starting main/origin/main: `1ecdbeff1c4b7b011a1af00c843f7930e515cea4`
C0 contracts: `a087ad38cb249840389e5aefaefbecb47333373f`
Integration: `feat/automatic-whatsapp-guest-access`
Status: **BLOCKED FOR FINAL ENGINEERING ACCEPTANCE AND EXTERNAL ACTIVATION**.
This is source delivery and synthetic test evidence, **not** permission to send
WhatsApp messages or declare production readiness.

**Latest remediation production-source SHA (supersedes older dated checkpoints):**
`500a5f6802437370251cfba7d5eb8dbbfe51de77`, including the forward-only
093 finalizer/phone-change fence after W7-F33-R2 was reproduced on real
PostgreSQL. W4 new negative/positive tests were RED 7/9 on the pre-093 source
and GREEN 9/9 on exact 500a; combined race/admin real-PG selection passed
21/21, Intake atomics passed 9/9 with its verified-W1 migration switch,
callback-first passed 1/1. W7 independently retested exact 500a using its
own PG17 smoke (93 pristine migrations), W4 9/9 race harness, full WhatsApp
API focused 93/93, Meta/RSA negative probes and UI guard, and documented
its findings in `W7_INDEPENDENT_SECURITY_ACCEPTANCE.md` via owner W7 QA
commit `d3f49f86` (cherry-picked as `13f31cda`). **W7 outcome remains
BLOCKED / NOT GO** because protected root full PostgreSQL and the differential
full-root non-PG gates have not been conclusively closed. Scoped success
does not waive full test requirements or external activation decisions.

## Independent QA remediation update — October 16, 2026

**Integration progress:** nine focused remediation commits were fast-forward
integrated locally to exact `3edbd9369839bf3d979b52af25fb5fee732059e0`.
W3 peer review then exposed an additional P2 inconsistency in callback status
message-ID grammar; targeted RED/GREEN fix `767964267ac822aa032111b743c15149cb0c402c`
made the status parser require the same bounded `wamid` as the sender.
Current local production source is `76796426` pending W7 independent retest.
On this integrated source, PostgreSQL 17 92-migration security smoke PASS,
WhatsApp API 93/93 PASS, Dashboard typed API 3/3 PASS, architecture PASS,
original UI-freeze 3/3 and 125-path guard PASS, and root build 10/10 PASS.
Pinned-main baseline failures remain on root lint and typecheck. Root full
PostgreSQL/non-PostgreSQL suite and W7 independent final-SHA re-review remain
required; the feature-branch remote is still at the historical `6b1810d3`
checkpoint pending engineering gates. See PRIME_FINAL_QA_REMEDIATION.md for
exact verification and remaining holds. This update does not activate Meta.

The initial delivery entries below are **historical checkpoint evidence** for
the first feature commit 6b1810d3, not the final QA sign-off. Independent
replacement W7 was assigned in a separate read-only worktree, reproduced two
P1 and three P2 security/correctness defects, and independently authored
W7_INDEPENDENT_SECURITY_ACCEPTANCE.md (source QA commit 6f25ddd1), explicitly
returning FIX REQUIRED on the old candidate. The original W7 chat never ran;
its Prime-authored UI guard is not counted as independent QA approval.

Focused corrections prepared in isolated branches:

- W1 forward-only 090: restrict API binding INSERT columns; actual SQL
  role-based forged-verification INSERT now rejected (42501).
- W3/W5: accept bounded padded Meta wamid identifiers in both provider
  acceptance and authenticated webhook parser without unsafe replay.
- W2: reject sender PRIVATE PEM submitted as issuer PUBLIC key.
- W1 forward-only 091: preserve authenticated positive delivery proof across
  sender process crash and lease cleanup; unknown/no proof remains UNKNOWN.
- W1 forward-only 092: Customer phone edit atomically suppresses undispatched
  queued/leased intents and purges transport envelopes; DISPATCHING remains
  uncertain until signed evidence/terminal recovery.
- W4 additional real PostgreSQL tests cover phone edit, no-op, permit, lease,
  expiry and two lock races (6/6 on W1 092 isolated PG).

**Fresh post-remediation evidence:** 92 pristine forward-only migrations in a
disposable PostgreSQL 17 database PASS. All restricted role/PUBLIC ACL checks,
090 forgery negatives, 091 callback-crash reconcile and 092 phone-change
suppression/cleanup checks PASS. Padded provider/webhook tests 21/21 PASS;
issuer public/private RSA key tests 4/4 PASS. This does **not** replace root
full PostgreSQL or an independent W7 exact-final-SHA verdict. The separate
QA/remediation ledger PRIME_FINAL_QA_REMEDIATION.md records baseline comparison
and required outstanding evidence. The original SHA remains safe default OFF.

## Worker accounting

| ID | Contribution | Provenance |
|---|---|---|
| W1 | New schema, restricted PostgreSQL roles/ACL, migrations 086–089, callback-first recovery, scoped three intake read functions | W1 commits `a65ccd91`, `81298711`; checked on disposable PostgreSQL 17 |
| W2 | Intake atomically mints the first eligible Guest generation plus durable intent, C0 policy version fences, preserves replay/no-phone; SQL helper repair | W2 `b84cd5e`, `ab23841d`, `dda2ebd8`, `93ea6a7c`, `d14201c4`, `fbda5849` |
| W3 | Fixed Graph version Meta Cloud mocked adapter, AR/EN templates, bounded HTTP + outcome classification; read-only peer security findings | W3 `7683da73`, peer reports reviewed by Prime |
| W4 | Leases, permits, bounded retry, UNKNOWN/crash safety, expiry, three DB clients for multi-replica QA | W4 `578fc41a`, `6199e8d1`, `0e766f2b`, `2f729060`; integrated 8/8 multi-replica PG PASS |
| W5 | Signed Meta GET/POST, bounded raw body, tenant-scoped account+attempt event correlation and monotone storage | Original W5 chat failed before execution; **Prime-authored** W5-worktree commit `03bae2e1` plus Prime integration fixes |
| W6 | Dedicated Dashboard WhatsApp company/location settings only, typed API, exact Company Admin and MFA authority, immutable audit | Original W6 chat failed before execution; **Prime-authored** W6-worktree commit `49c3834f` plus Prime integration fixes |
| W7 | Protected UI manifest guard and QA evidence; **no independent GO/FIX decision** | Original W7 chat failed before execution; Prime authored guard in W7's existing worktree, commit `b6b8df45`; independence remains blocked |

## Verified security behavior

- Fresh authoritative Intake alone creates one bootstrap credential and one
  logical WhatsApp intent if canonical recipient, evidence of opt-in, verified
  company binding, Company/Location effective policy and durable issue control
  all agree. An ordinary employee click requires no send action.
- The Guest/Browser Session verifiers remain hash-only. The approved DEC-105
  exception encrypts a single short-lived outbound bearer using RSA-OAEP-256
  with scope-bound AAD. Private key belongs only to restricted sender;
  ciphertext purges on terminal outcomes. No plaintext token or recipient
  number is logged or returned to Native.
- SQL enforces credential generation and recipient digests, company and
  location policy revisions, distinct DB roles, four irrevocable dispatch
  permits, 30-minute absolute intent lifetime and terminal UNKNOWN.
- A verified callback arriving before or after HTTP acceptance cannot reopen
  retry or downgrade delivery evidence. Post-permit cancellation/withdrawal
  prevents late dispatch; stale dispatch expires UNKNOWN.
- Webhook signature verification is performed on original bytes before
  parsing. Tenant/account resolution uses stored provider binding. Webhook
  GET rejects disabled/unready receiver registration, even if the verify
  token is correct. Disabling actual **sending** does not block receiving
  previously authorized test/production callback evidence if the receiver
  remains provisioned.
- Dashboard sends only authenticated, typed, no-store policy views; private
  Meta credentials remain server-side. Company Admin Organization/Location
  authority and sensitive MFA are checked on the server in the same SQL
  transaction that writes and audits changes.

## Evidence observed

| Check | Result |
|---|---|
| `node packages/database/scripts/outbound-migration-smoke.mjs` | PASS: 89 pristine migrations, role isolation, PUBLIC ACL, consent, override, callback-first, opt-out, UNKNOWN and purge |
| Focused API non-Postgres WhatsApp tests | PASS 88/88 on cumulative source, 15 files, including webhook readiness |
| W2 authoritative real PostgreSQL Intake | PASS 9/9, one task-owned disposable DB with zero leaks |
| W4 callback-first signed delivery/HTTP outcome race | PASS 1/1 actual PostgreSQL; no retry |
| Combined W2 Intake + W4 two-replica claims and recovery | PASS 17/17 actual PostgreSQL, 4 files, zero orphaned test DB/roles. Includes 9 Intake tests and 8 worker concurrency/cancel/withdraw/UNKNOWN tests |
| W6 Company Admin/tenant/MFA/audit real PostgreSQL | PASS 4/4 |
| Dashboard WhatsApp client typed transport | PASS 3/3 |
| Signed webhook readiness plus HMAC focused tests | PASS 6/6 |
| Root `pnpm build` | PASS, 10/10 build tasks, no build failure |
| UI freeze `node --test scripts/whatsapp-ui-freeze-guard.test.mjs` and guard | PASS; original 2174-entry manifest unchanged; Native, Employee, Customer, unrelated Dashboard and shared UI edits zero |
| `pnpm architecture:check` | PASS with only grandfathered preexisting >300-line warnings |
| `pnpm test:non-postgres` | Overall FAIL: 3 unrelated test timeout cases under load; isolated rerun of affected mobile-boundary and capacity tests PASS 54/54 without timeout changes |
| `pnpm lint` / `pnpm typecheck` | FAIL overall in existing Dashboard lint (13 diagnostics) and Employee Web TypeScript (missing `timezone` in old fixtures). Both independently reproduced on pinned clean `main`; task-scoped API and Dashboard checks pass |
| `pnpm test:postgres` | BLOCKED before execution: protected Issue #215 PG target requires its original task-owned fixed Docker container identity; never substituted or bypassed |
| Real recipient/Meta provider and physical Native test | NOT RUN; external approval and device/provider evidence required |
| Independent W7 verdict | BLOCKED: worker chat never opened; W3 read-only peer check is supplementary, not W7 |

## Frozen UI evidence

Native UI edits: **0**. Employee Web UI edits: **0**. Customer Web UI
edits: **0**. Existing Dashboard presentation outside WhatsApp settings:
**0**. Original visual snapshots/assets/translations/nav changes: **0**.
Only the C0-approved `settings-page.tsx` insertion and new
`whatsapp-*` siblings inside Dashboard administration Settings changed.
The original protected manifest was neither rewritten nor weakened.

## External and operational gates

Real sending and initial automatic issuance are default OFF. Opening real
Meta credentials, actual sender connection and compliance evidence, validated
recipient opt-in/withdrawal governance, AR/EN template approvals, official
fragment-link preservation on actual recipients, production key custody and
backup/key-destruction/runbooks, recipient-device testing, physical Native
parity, production migration, deployment, and main merge all require
separate authorization and evidence. No real WhatsApp message was sent.
No SMS fallback and no assumption of exactly-once delivery are added.

## Handoff restrictions

The dedicated branch may be reviewed and pushed without merging into main,
opening a PR or deploying. Full independent W7 acceptance and external tests
remain required before any production activation. If a remaining task-attributed
test fails, this ledger must reflect **FIX REQUIRED**, not GO.
