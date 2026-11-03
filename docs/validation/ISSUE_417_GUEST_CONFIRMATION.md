# Issue #417 — Guest confirmation intent and Cloud development evidence

Date: 2026-11-03. Investigation verdict: **CONFIRMED DEFECT**.
Scope: isolated local investigation, reproduction, frontend correction, tests and local commit.
No push, PR, merge, issue mutation, deployment or remote database operation is authorized or performed.

## A. Cloud environment

- Checkout: `/workspace/valet-platform-issue-417`.
- Debian GNU/Linux 13.6 (trixie), Linux x86_64; Node **24.22.1** (meets >=22; CI uses 22).
- Corepack **0.34.6**; `corepack pnpm --version` resolves the repository pin **10.34.5**.
  The ambient standalone pnpm is 11.25.0; task commands use Corepack.
- Git 2.52.0; authorized GitHub HTTPS clone/fetch and connector issue reads worked.
- Initial disk: 7.9 GB filesystem, 7.5 GB available. Memory: 9.7 GiB host-visible,
  8 GiB cgroup ceiling; two CPU quota. Docker 29.9.2 and Compose 2.40.3 work.
- Frozen install completed: 1,044 packages. No manifest, lockfile or build-policy changes.
  pnpm reported existing policy exclusions for argon2/@scarf install scripts.
- Created only ignored `.env`, mode 0600, with newly generated synthetic admin/runtime
  passwords, distinct local roles, and loopback URLs at port 55417. No production/staging
  credentials loaded. Messaging, automatic WhatsApp, staff/Guest push sending, payments
  and demo seeding remain disabled. No `local:bootstrap` or schema reset was used.
- Customer Next development server was exercised at **127.0.0.1:3002**, including real
  Chromium rendering and interactions with explicit fixture HTTP responses. This is
  frontend browser evidence, not a combined browser/API/PostgreSQL E2E claim.
  The completed repository verification build also starts through the real standalone
  Customer start script, privately on the same loopback port (local artifact preview).
  Final state: Customer serves HTTP 200 on that port; no API service or database is left
  running. Guest business operations need a separately started local API/database.
- Disposable Docker PostgreSQL **17.11**, container `vaylet-issue417-pg17`, label
  `vaylet.task=issue417`, published only `127.0.0.1:55417`, tmpfs data storage.
  Before writes, inspected port/label/storage and queried database `valet`, principal
  `issue417_admin`, server version and data directory. All **106 existing migrations**
  applied; distinct runtime-role provisioning succeeded. Real API/PG switch tests passed.
  After testing, stopped/removed only this task's container/image to reclaim disk.
  Final available disk: approximately 4.3 GB.
- Python Playwright 1.62.0 and Chromium 151.0.7922.34 installed and launched successfully.
- **Saved/published Cloud environment: NO.** Runtime tools expose inspection, not editable
  environment configuration. `source_config_id` was null. Owner UI action is still required.
  The checkout/dependencies and ignored configuration are usable in this current workspace.

### Reusable Owner setup

In the Owner Cloud environment UI, select this GitHub repository, a Node 22 runtime
(or newer), and preferably >=16 GB disk for simultaneous browser, Docker and full builds.
Save/publish this dependency setup script there; no repository infrastructure edit is needed:

```sh
node --version
corepack --version
corepack pnpm --version
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @valet/contracts build
```

Run Customer privately with:

```sh
API_ORIGIN=http://127.0.0.1:3001 NEXT_PUBLIC_GUEST_BROWSER_SESSION_ENROLLMENT_ENABLED=false \
  corepack pnpm --filter @valet/customer exec next dev --hostname 127.0.0.1 --port 3002
```

Next 16.4.3 generates `AGENTS.md` and `next-env.d.ts` changes during development;
those generated changes are excluded from this task commit. Restore only generated
task-owned changes after stopping Next; do not discard unrelated work.

For optional database work, generate fresh local configuration (never copy real secrets).
In this workspace `.env` already targets the task-only port and distinct roles. Recreate:

```sh
docker run --name vaylet-issue417-pg17 --label vaylet.task=issue417 \
  --env-file .env --publish 127.0.0.1:55417:5432 \
  --tmpfs /var/lib/postgresql/data:rw,nosuid,size=512m --detach postgres:17
docker exec vaylet-issue417-pg17 pg_isready -U issue417_admin -d valet
docker exec vaylet-issue417-pg17 psql -U issue417_admin -d valet -Atc \
  "SELECT current_database(), current_user, current_setting('server_version');"
# Verify the expected task-owned container, loopback port, DB and role BEFORE writes.
set -a
. ./.env
set +a
corepack pnpm --filter @valet/database migrate:deploy
corepack pnpm --filter @valet/database runtime:provision
```

This optional tmpfs target is disposable; stopping/removing it loses its data.
The mounted React regression requires neither Docker nor `.env` nor PostgreSQL.

## B. GitHub and isolation

- Remote: `https://github.com/yamanradwan1-rgb/valet-platform.git`.
- Issue #417 read in full through the authorized GitHub connector; zero comments.
- Initial workspace had no repository checkout or prior work to preserve. New clone's
  `git status --short` was empty, branch `main`; recent log and remote were inspected.
- `git fetch origin main` succeeded. Exact fetched main:
  **a5a46de42c1a075f84806ecda60a31791493c990**, equal to the supplied reference.
  Re-fetched before completion: unchanged. Issue comments rechecked: still zero.
- Task branch: **fix/issue-417-guest-confirm-visit-intent**, created from fetched origin/main.
- Additional detached task-owned baseline worktree used for unchanged-main reproduction
  and visual comparison. No other contributor/agent worktree was altered.
  Removed that disposable baseline worktree after retaining its logs and captures.
- Final status and local commit: recorded in the completion handoff; no remote write.

## C. Reproduction and execution path

Production composition is `page.tsx`: GuestAuthProvider -> GuestSessionProvider ->
GuestAppRoot (plus GuestContextConflictGate). Neither providers nor root are keyed by visit.

`guest-confirm-intent.mounted.test.tsx` mounts that real composition. Its helper simulates
only HTTP/cookie storage and presentation preferences; it does not mock auth, session,
root, overlays, retrieval, client or coordinator behavior. It establishes fresh authorized
A/PARKED, opens Request Vehicle, and verifies no POST. It then uses production
`bootstrapGuestAuthTransport` prepare and `switchGuestBrowserContextTransport` for an
explicit Open New choice in another same-cookie tab, as supported by **DEC-064 §11**.
The original root stays mounted. A normal focus/read detects the promoted marker,
GuestAuthProvider creates client B, and the session provider renders loading until B's
deferred authoritative PARKED snapshot arrives. The pre-existing confirmation then
reappears; confirming it posts for B without a new B Request Vehicle click.

Pre-fix assertion (also rerun using finalized tests against untouched fetched-main source):

```text
AssertionError: A intent must not POST request-retrieval for B
Expected: []
Received: ["223e4567-e89b-12d3-a456-426614174000"]
Baseline rerun: 1 failed, 13 skipped (14 collected); final test line 73.
```

Same-tab initial conflict is different: the real conflict sheet blocks reaching the
underlying Request action. Tests attack that underlying callback and pending/ambiguous/
definitely failed switch boundaries explicitly; they do not claim a user can tap through
the blocking modal. The primary reproduction is the supported shared-cookie tab path.

## D. Root cause and contract ledger

- **LOCKED:** DEC-064 §11 scopes independently authorized source/target visits, supports
  explicit transfer/shared-cookie tab convergence, and uses a non-authoritative marker
  to fence old clients. Source tenant authority is never inherited by the target.
- **LOCKED:** DEC-040 permits the authorized PARKED visit's request using empty `{}`,
  credential-derived scope, serialized mutation/history and duplicate protection.
  DEC-044 preserves ordinary pre-start cancel/re-request semantics.
- **LOCKED:** Guest production plan T2 §§11–14, 19 and the accepted COMPATIBILITY amendment
  require fresh current-client state, shared mutation coordination, canonical read after
  unknown outcome, and no blind protected POST replay. UI remains frozen.
- **DERIVED:** a user-opened confirmation must retain exact client/visit/marker ownership;
  temporary loading or authority loss must not later resurrect it. This follows those
  contracts and the Owner's explicit Issue #417 correction authorization.
- **UNRESOLVED:** none needed for this frontend correction. No new domain/security policy.

Before the fix, `GuestAppRoot` owned only `showConfirmRequest: boolean`. Returning loading
or unavailable screens removed the overlay child without clearing root state.
`GuestLiveOverlays` dismissed only after a non-PARKED state, in a queued passive-effect
callback. Both A and B being PARKED bypassed that lifecycle-only dismissal. The re-rendered
Confirm callback called **B's current** `useRetrieval`, whose fresh B coordinator correctly
allowed a B mutation. Abort/read/mutation generation fencing protected transport state,
but could not identify the visit for which a human had opened a dialog.

This is **cross-visit intent integrity**, not evidence of backend tenant-isolation bypass.

## E. Implementation and review boundaries

- `apps/customer/src/features/retrieval/use-request-confirmation.ts`: pending intent captures
  the GuestApiClient object, valetSessionId and existing browser marker. It synchronously
  hides/clears mismatches during render, including loading/unavailable paths, with no
  passive-effect click window. A layout-committed current-context reference rejects retained
  handlers; Confirm also reads the marker immediately before mutation, covering promotion
  before any React notification. Open requires authority/freshness/no mutation/PARKED.
  Close/success callbacks clear only their own exact pending object, never a newer intent.
- `apps/customer/src/app/guest-app-root.tsx`: supplies real auth/bootstrap/conflict/switch/
  expiry gates and delegates production open/close/confirm. Existing visual composition,
  loading/error inputs and all preview behavior are preserved.
- `apps/customer/src/app/guest-confirm-intent.test-support.tsx`: real-provider HTTP/cookie harness.
- `apps/customer/src/app/guest-confirm-intent.mounted.test.tsx`: 14 mounted regression scenarios.
- `apps/customer/src/features/retrieval/use-request-confirmation.test.tsx`: 9 ownership boundary cases.
- `apps/customer/src/features/demo/demo-safety.test.tsx`: updates the old handler-name assertion
  to verify guarded production delegation, while retaining loading and preview-isolation checks.
- This evidence document.

Server authorization/mutation ordering is unchanged: established credential -> persisted
visit/scope/current authority -> session serialization and operation guards -> transaction
mutation plus required history -> commit. Reconciliation reads reauthorize independently.
The helper sends no identity, authority field or extra request to the server. Existing
useRetrieval/GuestRequestCoordinator code is unchanged: single-flight, read abort/generation
fencing, canonical reconciliation and no automatic POST replay remain in place.

No UI markup, styles, colors, buttons, icons, copy, translations, navigation, RTL rules,
Prisma schema, migrations, API contracts, auth policy, dependencies or lockfile changed.
Deferred: physical phone qualification, full combined browser/API/PG journey, remote CI,
Owner Cloud publication, production rollout and unrelated Payment Summary Retry UX.

## F. Validation evidence

All commands run from the task checkout unless identified as baseline. Final outcomes
are summarized below; intermediate corrected branch failures are retained explicitly.

| Exact command | Result |
| --- | --- |
| `corepack pnpm install --frozen-lockfile` | PASS, 1,044 packages, no lockfile drift |
| `corepack pnpm --filter @valet/customer exec vitest run src/app/guest-confirm-intent.mounted.test.tsx` before fix | FAIL as expected, 1 failed / 1 passed; B POST observed |
| `corepack pnpm --filter @valet/customer exec vitest run src/app/guest-confirm-intent.mounted.test.tsx -t 'never transfers A confirmation'` in baseline worktree | FAIL as expected, same B POST, 1 failed / 13 skipped |
| `corepack pnpm --filter @valet/customer exec vitest run src/app/guest-confirm-intent.mounted.test.tsx src/app/guest-refresh-mounted.test.tsx` | PASS after fix, 2 files / 7 tests at that stage |
| `corepack pnpm --filter @valet/customer exec vitest run src/app/guest-confirm-intent.mounted.test.tsx src/app/guest-refresh-mounted.test.tsx src/features/auth/guest-auth-context-switch.test.tsx src/features/session/guest-request-coordinator.test.ts src/features/retrieval/use-retrieval.test.ts` | PASS, 5 files / 47 tests |
| `corepack pnpm --filter @valet/customer exec vitest run src/features/retrieval/use-request-confirmation.test.tsx src/features/demo/demo-safety.test.tsx` | PASS, 2 files / 20 tests |
| `corepack pnpm --filter @valet/customer test` | PASS final, 74 files / 553 tests |
| `corepack pnpm --filter @valet/customer lint` | PASS |
| `corepack pnpm --filter @valet/customer typecheck` | PASS final |
| `corepack pnpm architecture:check` | PASS; only existing grandfathered warnings |
| `corepack pnpm test:non-postgres` | FAIL, 3 failures reproduced on fetched main; detailed below. 3,986 passed, 3 failed, 1 skipped across completed lanes |
| `corepack pnpm lint` | PASS, 11 tasks |
| `corepack pnpm typecheck` | PASS final, 11 tasks (5 cached) |
| `corepack pnpm build` | PASS, 10 tasks, all real verification-mode package builds |
| `corepack pnpm --filter @valet/contracts build` | PASS |
| `corepack pnpm --filter @valet/database migrate:deploy` | PASS, 106 existing migrations, verified disposable PG17 |
| `corepack pnpm --filter @valet/database runtime:provision` | PASS, distinct restricted local runtime role |
| `corepack pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/guest-browser-session-context-switch.integration.test.ts test/guest-browser-session-context-switch-recovery.integration.test.ts test/guest-browser-session-context-switch-races.integration.test.ts` | PASS, 3 files / 20 real API+PG tests (13 standard, 7 race) |
| `python3 -m playwright install chromium` | PASS; initial launch correctly reported missing browser before install |
| `python3 /workspace/scratch/issue417-browser.py` | PASS, Chromium; 4 EN/AR/light/dark frontend fixture-HTTP journeys, zero page errors |
| `ISSUE417_BROWSER_PREFIX=built python3 /workspace/scratch/issue417-browser.py` | PASS, same 4 frontend journeys against the built standalone Customer runtime, zero page errors |
| `ISSUE417_CUSTOMER_ORIGIN=http://127.0.0.1:3004 ISSUE417_BROWSER_PREFIX=baseline python3 /workspace/scratch/issue417-browser.py` | PASS after isolated baseline dependency setup; 4 baseline captures byte-identical to branch |
| `corepack pnpm --filter @valet/valet exec vitest run src/components/end-shift-recovery.test.tsx` in baseline | FAIL, 1 failed / 2 passed, same assertion as branch |
| `node --test test/issue333-u002-http-cancellation.test.mjs` in baseline `apps/api` | FAIL, 1 failed / 3 passed, same socket-finish timeout as branch |
| `corepack pnpm --filter @valet/database exec node ../../scripts/test-harness/run-owned-tests.mjs database vitest.config.mjs src/issue304-migration-source-appendix.test.ts` in baseline | FAIL, 1 failed, same 103-versus-106 migration expectation |
| `git diff --check` | PASS |
| `corepack pnpm exec prettier --check apps/customer/src/app/guest-confirm-intent.mounted.test.tsx apps/customer/src/app/guest-confirm-intent.test-support.tsx apps/customer/src/features/retrieval/use-request-confirmation.ts apps/customer/src/features/retrieval/use-request-confirmation.test.tsx` | PASS |

Intermediate branch failures corrected: old static handler-name assertion (first Customer
run: 1 failed / 543 passed), then test-helper TS18046 and TS4058. These were new harness/
wiring-test issues, not pre-existing baseline failures. Assertions were updated to the
actual guarded delegation, not removed or weakened. Both existing modified files already
failed Prettier on fetched main; they were not mass-formatted or expanded beyond 300 lines.
Baseline worktree screenshot setup initially rejected cross-workspace dependency symlinks;
the supported frozen install in that task-owned worktree fixed it. An attempted webpack
fallback also exposed the existing `.js` contracts import-resolution limitation; the
successful matched captures both use the normal Turbopack runtime. Those are setup
observations, not application regressions. Early browser setup attempts also caught an
invalid cookie fixture URL and server-start timing; corrected before the successful runs.

### Repository-wide failures, independently checked on fetched main

- Employee Web: `apps/valet/src/components/end-shift-recovery.test.tsx:90` expects
  `Confirm your end shift result`, receives the `No active shift` gate. Pure lane:
  **557 files, 3,874 passed / 1 failed / 1 skipped tests**. Turbo stops before a completed
  Native lane; Native completion is **not claimed**.
- API native-Node test: `issue333-u002-http-cancellation.test.mjs:119` times out with
  `large body server finish timed out` in this runtime. Node lane: **48 passed / 1 failed**.
  The following API non-PostgreSQL Vitest lane does **not run**, because its documented
  command uses `node-tests && vitest`. This is a reproducible baseline/environment failure,
  not proof of a new API regression or proof that the unrun Vitest lane passes.
- Database source appendix: `issue304-migration-source-appendix.test.ts:32` expects 103
  migration directories, while main contains 106 (104–106 are already committed on main).
  Database non-PostgreSQL lane: **7 files passed / 1 failed; 64 tests passed / 1 failed**.

These files are unchanged by this branch. No assertions were weakened and no unrelated
fixes were bundled. Consequently the **repository-wide test gate is not green**.

### Required matrix mapping

| Case | Evidence |
| --- | --- |
| A PARKED -> confirm -> B PARKED; no B POST until new click; valid B exactly one POST | primary mounted repro + Chromium fixture journeys |
| Normal unchanged A exactly one request; cancel/reopen | mounted ordinary workflow + existing retrieval/coordinator suites |
| New client on switch and temporary loading | real auth event/provider client replacement with deferred B GET |
| Same-client visit identity change | real coordinator rejects B, retains untrusted A and blocks POST; helper also defensively invalidates changed ID |
| Pending, ambiguous, definitely invalid switch | real bootstrap/conflict gate, production state transitions and callbacks |
| Invalid/revoked/expired/lost authority | non-disclosing GUEST_ACCESS_INVALID mounted boundary, null/loading/authority helper cases; not three distinct server-cause claims |
| Delayed A GET after promotion | real client marker check plus coordinator disposal; B remains current |
| Close/reopen and retained callbacks | mounted cancellation/reopen + helper stale open/close/success/unmount cases |
| Two rapid confirmations | real coordinator permits one POST |
| Ambiguous POST | one attempted POST plus canonical read; no automatic replay; deliberate new action required |
| Leave PARKED, later return | invalidated intent never revives; new Request click required |
| UI/localization | unchanged visual sources; existing theme/locale/preview tests, Chromium four-mode captures; all 4 baseline/branch PNG pairs byte-identical |

Matched 390x844 Chromium screenshots (animations disabled, only Next dev indicator hidden):

| Mode | SHA-256, identical for baseline and branch |
| --- | --- |
| EN light | `3cd40780862beaf9717d7b6e8691be9cecd3aa861840f0c71030bc979d47d8d7` |
| EN dark | `37363ba304ebd46d63b0c096242c472f0af80ed10b89007d42769b6682770111` |
| AR light | `f11a35939bd933a1f41c728c3f38ff2ab051d73074438de629306feb1a4f7432` |
| AR dark | `017029460ad9de7c02bcc4672bbc0afd8c293273890c6cf2827f63021d01a9ac` |

No production/staging integration, physical Android/iOS qualification, full PostgreSQL
suite, remote GitHub Actions run or fresh security scan is claimed.

## G. Completion and independent review

Authored physical lines: GuestAppRoot 250 (was 248), demo safety test 250 (was 244),
mounted regression 292, test support 215, hook 107, hook test 147. All <=300; architecture
baseline unchanged. Final counts are checked again before commit.

Prisma/schema/migrations/API/auth-policy/dependencies/lockfile changes: **NO**.
Push/PR/merge/issue closure/deploy/remote DB changes: **NO**.

Readiness: **ready for independent VAYLET Code Review of the focused fix**.
**Not merge/deployment ready:** repository-wide baseline failures remain, remote CI was
not run, and physical/full-stack Guest qualification remains separate. Review the local commit
identified in the handoff with `git show --stat <commit>` and `git show <commit>`.
