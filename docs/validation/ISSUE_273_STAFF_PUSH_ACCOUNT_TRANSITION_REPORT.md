# Issue #273 — Staff Push account transition diagnosis and scoped code evidence

**TASK 3 / SOURCE-LEVEL DIAGNOSIS; U-001 SECURITY CONTRACT NOT ACCEPTED**

Date: 2026-10-09
Repository: `veletpro0-lgtm/valet-platform`
Issue: `https://github.com/veletpro0-lgtm/valet-platform/issues/273`
Branch: `fix/issue-273-staff-push-account-transition`
Isolated worktree: `D:\kndoom\valet-platform\tmp\issue-273-worktree`
Verified starting origin/main and local main SHA:
`ab26757340ea82d63f744e01f9a8e00c336340ae`.

Main checkout initially had unrelated local Dashboard configuration and
`docs/plans/issues-272-278` modifications. All are preserved; no changes
were made to other task worktrees. The Owner subsequently authorized a
code-only fast-forward merge after the additional PostgreSQL regression gate;
the actual merge/remote status must be verified separately on GitHub.

## 1. Evidence ownership and original physical observation

Issue #273 reports a physical Android Employee installation after a change
from former staff A to another authorized staff B. B's
`PUT /v1/staff/push/registrations` repeatedly received
`409 STAFF_PUSH_REGISTRATION_CONFLICT`; A's ACTIVE registration and unrevoked
Staff session were still present in inspected QA persistence. A Guest
retrieval request nevertheless succeeded, created the canonical REQUESTED
ValetSession and QUEUED Retrieval Task, and created a Push intent. No
qualifying delivery to B was observed. A single obsolete QA registration
was manually scrubbed as a **diagnostic workaround**; the task has not
verified physical delivery after that event. It was not a production fix.

The original physical A logout moment, network/commit outcome, process kill,
and FCM token transition were **not captured**. The actual device-path
sequence is **UNVERIFIED_ON_DEVICE**. Never infer physical Firebase/OS receipt
from the presence of a registration, provider response or intent.

## 2. First deterministic source-level divergence

| Boundary | Verified code behavior |
| --- | --- |
| A local logout | `NativeAuthSession.logout()` first advances the auth-generation barrier; local restore block, identity purge and secure refresh removal run before remote logout; a refresh credential is used only ephemerally |
| Remote logout | `NativeAuthFailureRecovery.completeLogout()` reports `localLogoutComplete`, `securePurgeConfirmed` and `serverRevocationConfirmed` separately; server transport loss is not proof of rollback |
| Account switch | `NativeAuthSession.switchAccount()` allows B login after local completion, even if A remote revocation remains unconfirmed, as required by DEC-072 |
| A server authority | Without committed logout A StaffAuthSession and its ACTIVE Push registration may persist; an already dispatched A PUT is not retroactively cancelled by local generation fences |
| B correlation | `NativePushInstallationIdOwner` persists the installation ID across account changes; token rotation does not authorize a transfer |
| B normal PUT | `sessionMayReplaceOwner()` requires the same User; different-User active ownership remains a safe 409 even for matching token/install |
| Guest operation | Task/custody mutation is already committed independently; Push only supplies optional attention and cannot trigger/replay the Guest request |

The **proven architecture path** is: A local logout succeeds, A remote
logout never commits or rolls back, A ACTIVE registration remains, B logs
in independently and presents the same installation, B receives authorized
non-disclosing 409. Existing API `staff-push-logout.integration.test.ts`
also tests rollback after a registration-disable failure; it demonstrates
the original session and ACTIVE token remain when the logout transaction
does not commit. No attacker takeover is needed to reproduce this.

This gap is **not fixable by changing only the client** while preserving
current DEC-073: B cannot authorize A's old registration release through
installation ID, token or a new B bearer. U-001 needs a separate Accepted
protocol. The unchanged normal online A logout already allows B's ordinary
registration after committed server terminalization.

## 3. Additional RED-first defects and approved existing-path repairs

### A. Native old-generation in-flight promise blocks B

Before the fix, `NativePushLifecycleOwner` had a single shared
`active` Promise across authentication generations. If A's registration
HTTP response was indefinitely pending, B's new authenticated generation
placed its request in `pending` but could not even dispatch B's normal PUT
until A resolved. The new
`test/native-push-account-transition.test.ts` expected B's current
request to start while A's original response remained unresolved and
**failed** on the previous scheduler. This was a separate local failure
from the server's intentional 409.

**Scoped repair:** extract `NativePushReconcileScheduler`, which coalesces
within one current generation and retires only local scheduling for old
generations. A new authenticated B generation can dispatch its own
canonical desired-state PUT independently. The old A request may still
reach the API; its response cannot publish under B. The scheduler makes
no claim of cancelling a server transaction, granting B ownership or
replaying a Guest command. Existing foreground/token-change reconciles
still coalesce within their own generation.

### B. Older same-User session could reclaim a newer session's endpoint

At baseline `sessionMayReplaceOwner` allowed same-User replacement when
`!owner.owner_current || sessionIsLater(...)`. Accepted DEC-073
§9 requires the replacement session to be **later-created** even if the
original owner subsequently became noncurrent. The noncurrent shortcut
contradicted the deterministic older-session exclusion.

New `test/staff-push-registration-ownership.test.ts` ran **3/5 PASS,
2/5 FAIL** before the fix: an older same-User session incorrectly
reclaimed a revoked newer owner's binding; a tied-time older UUID
likewise reclaimed it. The policy now requires
`same User && sessionIsLater(...)`. All **5/5** focused cases pass:
later session wins, older session remains blocked even after newer-owner
revocation, equal timestamp breaks ties deterministically, and a different
User remains denied regardless of old-owner currentness.

The service still resolves and locks the exact current Staff session before
its existing logical installation/token keys and registration rows. The
same-User predicate change uses no new role/tenant/Location authority and
does not modify partial uniqueness or DB schema. Existing PostgreSQL
registration/concurrency suites subsequently passed, and the precise
noncurrent newer-owner case was added as a separate real-PostgreSQL regression.

### C. Conflict did not have a bounded diagnostic class

The existing visible `registration-error` state and copied error behavior
were unchanged. A new fixed, low-cardinality internal
`push/registration-conflict` telemetry classification records only the
recognized `409 STAFF_PUSH_REGISTRATION_CONFLICT`; it records no
exception string, user identity, session, registration, token, token hash,
installation ID, tenant/Location, Task or notification content. The focused
test was **RED** before stage observation and then **PASS** after wiring.
Telemetry uses the existing bounded fail-open in-memory owner and never
acts as authorization or persistence.

### D. Explicit auth truth matrix, no protocol invention

The new portable
`src/native-auth-account-switch-truth.test.ts` verifies:

- committed server logout and local purge are represented separately;
- offline/failed remote logout still blocks A local restore and permits B
  to log in securely under its own credentials;
- a lost response after server commit and a lost response before commit
  are indistinguishable to Native and both remain `serverRevocationConfirmed=false`;
- post-restart refresh uses only B's credential, never A's; and
- when secure delete fails but the durable restore block succeeds, A
  cannot reauthenticate from stale local storage.

The test uses no raw real credentials and does not prove a network-backed
PostgreSQL session transition.

## 4. Security/authorization invariants unchanged

1. B cannot claim A's ACTIVE installation, token hash or registration ID;
   possessing the same correlation value is never Staff authority.
2. The original session and User are resolved from the authenticated
   Bearer, not from client-supplied User, tenant, Location, Shift or Task.
3. Same-User replacement requires a deterministic later-created session.
4. Logout retains current exact refresh/session lock and one-transaction
   Staff session revocation + Push DISABLED/provider-token scrub.
5. Provider invalidation is fenced by the exact current registration ID,
   token hash and ACTIVE state. Partial unique install/token indexes remain.
6. An old A PUT already dispatched remains subject to current server
   auth/registration locks, not to Native callback publication.
7. Send-time recipient eligibility still re-proves current User, unrevoked
   StaffAuthSession, membership, role, Organization, Location grant, ACTIVE
   exact-Location Shift, current Retrieval Task and token version.
8. A failed Push action never changes Guest request/Task/custody/payment,
   never resends a Guest command and never fabricates provider delivery.
9. DEC-075 version-1 TTL 300s, provider attempts 4, 10s timeout, 30s
   lease, bounded retry and HIGH priority are unaffected.
10. No old A access/refresh credential is durably retained for Push release.
11. No new API routes, DTO, proof, cryptographic dependency, database table,
    migration, privilege grant, provider service or cross-user operation.
12. ZERO Native/Guest UI, localization, theme, layout, navigation or
    accessibility edits.

## 5. Evidence and test commands

From the isolated Issue #273 worktree:

```text
pnpm --filter @valet/employee-client exec vitest run src/native-auth-account-switch-truth.test.ts src/native-auth-logout.test.ts src/native-auth-storage-matrix.test.ts src/native-auth-login.test.ts src/native-auth-restore.test.ts
pnpm --filter @valet/valet-native exec vitest run test/native-push-account-transition.test.ts test/native-push-lifecycle.test.ts test/native-push-purge-race.test.ts test/native-push-registration-transport.test.ts test/native-push-installation.test.ts test/native-push-registration-failure.test.ts
pnpm --filter @valet/api exec vitest run test/staff-push-registration-ownership.test.ts test/staff-push-operational-policy.test.ts test/staff-push-redaction.test.ts test/staff-push-retry.test.ts
pnpm --filter @valet/employee-client typecheck
pnpm --filter @valet/employee-client lint
pnpm --filter @valet/valet-native typecheck
pnpm --filter @valet/valet-native lint
pnpm --filter @valet/api typecheck
pnpm --filter @valet/api lint
pnpm architecture:check
git diff --check
```

Observed focused checks: **43/43 portable auth PASS**, **39/39 Native push
PASS**, **42/42 non-PostgreSQL API PASS**. Employee Client, Native and API
lint/typecheck passed on the implementation branch; ESLint also passed on
the additional PostgreSQL test. Existing baseline before changes:
38 portable auth and 34 Native Push PASS. Native auth and native push
source-level negative cases are not substitutes for real server truth.

**Real PostgreSQL follow-up: 60/60 PASS, across seven focused suites/files.**
The independent operator verified the local loopback-only test bootstrap,
current DB role, uniquely created child databases, restricted child runtime
roles and harness cleanup before running tests. No shared/staging/production
database was modified. Commands below run from `apps/api`:

```text
pnpm exec vitest run --config vitest.config.mjs --project api-postgres-standard test/staff-push-registration-lifecycle.integration.test.ts test/staff-push-registration-authority.integration.test.ts test/staff-push-logout.integration.test.ts test/staff-push-worker-eligibility.integration.test.ts
pnpm exec vitest run --config vitest.config.mjs --project api-postgres-race test/staff-push-registration-concurrency.integration.test.ts test/staff-push-stale-confirmation-race.integration.test.ts
pnpm exec vitest run --config vitest.config.mjs --project api-postgres-standard test/staff-push-inactive-newer-owner.integration.test.ts
```

- Standard suites: **52/52 PASS** (lifecycle 9, authority 23, logout 3,
  worker eligibility 17).
- Concurrency suites: **6/6 PASS** (registration concurrency 4, stale
  confirmation race 2).
- New `staff-push-inactive-newer-owner.integration.test.ts`: **2/2 PASS**.
  It deterministically backdates only the older same-User session, makes
  the newer session own an ACTIVE registration, then independently tests
  newer-owner revocation and absolute expiry without registration deletion.
  The still-valid older session must receive a non-disclosing **409**, and
  cannot alter the ACTIVE newer-owned row. The absolute-expiry fixture was
  corrected after one failed setup-only attempt to respect the actual
  `staff_auth_sessions_expiry_check`; final rerun passed both cases.
- All three harness run teardowns reported `db=0 roles=0 children=0` for
  their owned resources. Unrelated historical test resources present on
  this local cluster were not modified.

These tests prove the existing and newly added source/SQL coverage; they do
**not** prove the unimplemented U-001 release capability or physical Android
FCM receipt. No production migrations were executed.

The architecture checker fails on **the same two unrelated preexisting
base violations**: a 328-line
`packages/database/src/guest-browser-session-context-switch-failures.integration.test.ts`
file and forbidden global `window` in
`packages/employee-client/src/employee-shift-presence-local-provenance.test.ts`.
Neither is touched by #273. Each newly authored code/test file remains
under 300 physical lines; `native-push-lifecycle.ts` was shortened
by extracting a single focused scheduling responsibility.

## 6. Independent reviewers and evidence limits

**Security Reviewer A — FINAL CURRENT CODE PASS** after independently
reading the updated entire branch, verifying same-User later-created
enforcement, cross-user denial, scheduler generation fences, no stale A
replay and content-free conflict telemetry; no P0/P1. Focused Reviewer A
tests passed Native 32/32, Employee Client account-transition 5/5 and
API ownership 5/5. Exact sources include
`native-push-reconcile-scheduler.ts:21-49`,
`staff-push-registration.service.ts:44-64,134-169` and
`native-push-registration-diagnostics.ts:5-21`.

An independent final **Reviewer B (SQL/authorization): PASS** on the
current implementation diff. Reviewer B verified same-User chronology,
cross-user 409, session/registration locks, partial unique constraints,
server-side owner source and logout semantics. It later independently
reviewed the new PostgreSQL regression and gave **PASS** after the
absolute-expiry fixture was corrected to satisfy the actual DB CHECK.

Independent final **Reviewer C (Native/UI): PASS** on the current diff,
including auth-generation scheduler isolation, stale-A response fencing,
request-generation transport authority, 409 telemetry privacy and unchanged
UI/localizations. Reviewer C reran Native Push 39/39 and portable Auth
43/43 plus focused lint/typecheck. **INDEPENDENT_REVIEW = PASS** on the
limited code changes; the new U-001 security protocol remains unimplemented
and has not received final acceptance.

**U-001 security-design Reviewer A:** draft correctly preserves proof
theft, old-session recreation and legacy PUT/rollback threats, but cannot
be implemented before approval of precise original-User proof authority,
optional B authentication, secure RNG/storage/expiry, issuance/release
lock order and full writer deadlock graph. A proposed issuance order was
added to the draft; actual PostgreSQL all-writer proof remains **NOT RUN**.

The proof design is published **separately** in:

`docs/validation/ISSUE_273_U001_RELEASE_SECURITY_PROPOSAL.md`

Status: **DRAFT / NOT ACCEPTED**. Only the Owner's preferred Option A
direction is approved. No part of the proof protocol is enabled by these
source changes.

## 7. Owner-run physical Android QA handoff (deferred)

Do not build or flash an APK in Task 3. With a separately approved matching
development/release APK against an authorized disposable backend and
synthetic test accounts/Task data:

1. Record source SHA, APK version/hash, API SHA, Android OEM/model/OS,
   locale/theme and authorized synthetic role/Location (not raw identity).
2. A logs in, enables notification permission and confirms registration on
   one installation. Record only bounded status class.
3. Normal connected A logout: verify authoritative A session revocation,
   old ACTIVE row terminalized and provider token scrubbed. Login B with
   same install; verify B normal PUT becomes ACTIVE under only B's session.
4. Force offline A logout with a genuinely uncommitted server request:
   local A authority clears; B may authenticate but cannot claim ACTIVE A
   endpoint. Verify B receives 409 and canonical Tasks still work.
5. Simulate A server commit followed by lost logout response separately
   from never-committed logout. Do not infer commit from Native timeout.
6. Force-stop/restart after local purge and before B login, then during B
   registration and after response loss. A must never be restored from an
   old credential; no late A callback may publish B confirmation.
7. Repeat with FCM token rotation, token deletion failure, same-User
   later/older sessions, denied/re-enabled notification permission and
   current/previous registration versions.
8. Only after trusted release is separately approved and implemented,
   test its exact issuance, SecureStore write/readback, invalid/expired/
   stolen/replayed proof, A PUT race, B PUT success and failure.
9. Create one authorized Guest retrieval in staging. Verify one canonical
   Retrieval Task and appropriate Push intent/delivery eligibility; no
   domain mutation/replay. Record provider result separately from actual
   foreground/background device receipt.
10. Verify EN/AR Light/Dark/login/logout/Push/Tasks/Guest UI source and
    screenshots remain identical; note expected or observed privacy-safe
    generic notification only, never sensitive content.

Sanitized evidence template:

```text
Issue #273 / task branch and final SHA:
APK build/hash / API SHA:
Android OS/OEM/model (no unique device ID):
EN/AR / Light/Dark / synthetic QA role and anonymized Location:
Online/offline/lost-response/restart/rotation test scenario:
A local logout class / remote revocation confirmed or unknown:
A registration terminal status class / B register result (confirmed/409/unavailable):
Canonical Task created yes/no; intent/delivery counts and provider class:
Physical notification foreground/background received yes/no/not checked:
UI parity reference / sanitized screenshot filename:
PASS / FAIL / UNKNOWN, and note what was NOT measured:
```

No raw FCM token/hash, old account identity, User/email/session/registration/
installation/Org/Location IDs, guest/vehicle text, credentials, HTTP body,
provider payload or exception message may be included in shared evidence.

## 8. Current decision/release gates

- U-001: **DRAFT_PENDING_APPROVAL**, not an Accepted DEC amendment.
- Independent code reviewers: **PASS** (Security A, SQL B, Native/UI C).
- Code: limited, existing-contract regression repairs and diagnostics only.
- Different-User takeover: **DENIED**; current 409 remains intentional.
- API / DB / contracts / migrations: only existing owner-policy code changed,
  no new public transport or schema.
- UI: **FROZEN_UNCHANGED**.
- PostgreSQL existing and added focused suites: **60/60 PASS**, on
  verified disposable local child databases, with owned cleanup.
- Physical Android/FCM receipt: **PENDING**, not a test PASS.
- APK/AAB: **NOT BUILT**.
- PR/deploy/APK: **NOT PERFORMED**. Owner authorized a separate
  code-only fast-forward merge after the test gate; verify its result from
  the actual GitHub refs rather than interpreting this report as proof.
- Issue #273: **OPEN**, full trusted release still blocked on security decision.
