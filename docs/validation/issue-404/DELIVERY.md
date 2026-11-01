# Issue #404 — implementation delivery and evidence

Date: 2026-11-01. Branch: `codex/issue-404-guest-push-dev-feedback`.
Base: `c85fc34be9e7c62deae89b8f97b3d166dfdbc7ed`.
Scope: the Owner's F404-A/F404-B implementation approval. The later instruction
explicitly skipped further UI-freeze testing and requested push of the finished
patch. This report does not claim complete physical qualification or green CI.

## Addressed root causes

**SOURCE-VERIFIED:** the production-only registration guard prevented a worker
from being registered by development Customer builds. A missing worker can leave
`serviceWorker.ready` pending until the existing eight-second stage deadline.
**SOURCE-VERIFIED:** caught errors and default permission results previously
returned generic unavailable/Enable presentation without explaining the result.
The expired historical incident's deployment identity/mode remain **UNKNOWN**;
these findings do not establish its deployment provenance or a #335 regression.

## Changes and production boundary

- `src/lib/pwa/register-pwa.ts`: production retains `/sw.js`; development uses
  `/sw.js?development=1`. Both require an actual secure browser context, share
  initialization, and may retry after failed registration.
- `public/sw.js`: development skips cache migration, cache deletion, cache
  reads/writes and fetch interception. It retains install/activation, client
  claiming, Push payload validation, approved notification copy and safe clicks.
  The normal production URL keeps the existing cache namespace, allowlist,
  migration/pruning, response rules, lifecycle and Push handlers.
- `guest-web-push-client.ts` / `guest-web-push-stage.ts`: retain controlled stage
  classification without exposing native messages. Permission still starts
  synchronously inside the explicit gesture, before asynchronous setup. An
  explicit retry can restart failed worker initialization; readiness stays bounded.
- `guest-web-push-feedback.ts`: fixed EN/AR feedback for dismissed/default,
  denied, unsupported, insecure, permission request failure, worker failure/wait
  timeout, configuration, subscription, offline, timeout, 401/403, 409, 429,
  server failure, cancellation, changed context and uncertain activation.
- The card and extracted permission presentation reuse the original paragraph,
  buttons, semantic styling, hierarchy and loading/accessibility behavior.
  Feedback reserves the existing paragraph space. Authentication/conflict/context
  outcomes require refresh; Retry-After disables the existing Enable control
  until the server's interval expires, without automatically retrying.
- Focused unit/mounted/worker tests and this contract/evidence documentation.
  No authentication, public API, database, migration, dependency or rollout-flag
  changes. No custody or Task state transition is changed.

Paths above are relative to `apps/customer/` or its `src/features/web-push/`.

## Unknown commit and reconciliation

The unchanged transport requires an exact empty authorized HTTP 204. Redirects,
HTML fallbacks, unexpected successful statuses and lost responses do not confirm
activation. Server-stage native failures/deadlines render **activation
unconfirmed**, never definitive success or rollback. The existing subscription
is preserved after a possible registration POST. An explicit Enable gesture
discovers/reuses it and calls the existing authorized reconciliation POST; there
is no automatic replay, automatic permission request or new verification route.

Automated client tests cover retained subscriptions and reuse; transport tests
cover exact-response validation; mounted tests cover visible uncertainty and
explicit retry. **These are simulations, not new database persistence proof.**
The earlier investigation reproduced commit/response loss against PostgreSQL on
the pre-patch #335 artifact. That historical result is not candidate qualification.
The mandatory candidate physical response-loss sequence remains **NOT TESTED**.

## Observed verification

| Command / evidence | Result |
| --- | --- |
| `pnpm --filter @valet/customer exec vitest run src/features/web-push src/lib/pwa` | **95 passed**, 12 files |
| `pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres test/guest-push-registration-contract.test.ts test/guest-push-registration-controller.test.ts test/guest-push-eligibility.test.ts` | **18 passed**, 3 files; simulated API/authorization tests |
| `pnpm --filter @valet/customer test` | **529 passed, 1 failed**, 72 files |
| `pnpm lint` | **PASS**, 11 tasks; 9 cache hits |
| `pnpm typecheck` | **PASS**, 11 tasks; 8 cache hits |
| Customer lint/typecheck directly | **PASS** |
| `pnpm build` | **PASS**, 10 tasks; 6 cache hits; Customer production artifact validated |
| `pnpm architecture:check` | **PASS**, only existing grandfathered warnings |
| `pnpm test` against isolated QA target | **BLOCKED** by Issue #215's strict disposable-target preflight before suites ran |
| Existing PostgreSQL Push concurrency suite, including retry with `--hookTimeout 120000` | **SETUP FAILED**: test's explicit 10-second beforeAll deadline expired; two tests did not run |

The Customer failure is in unchanged `guest-branding-coverage.test.tsx`:
`audit(root.pathname)` produces an invalid `D:\D:\...` path on Windows. Its
source is identical to the base. No unrelated test or harness was changed to
conceal it. Full repository tests and PostgreSQL qualification are not claimed.
Touched-file Prettier and `git diff --check` results accompany final delivery.
No GitHub CI run is claimed.

## Physical Android evidence and limits

**RUNTIME-VERIFIED** on the authorized Android 10 Chrome phone, on a separate
temporary HTTPS hostname with synthetic Guest data and dedicated PostgreSQL
17.11/runtime role (106 migrations applied), with all sending disabled:

- Top-level secure browser context; Guest fragment successfully scrubbed.
- Real Guest Browser Session bootstrap and canonical vehicle status loaded.
- Development `/sw.js?development=1` registered at `/`, activated, controlled
  the page and reached native `serviceWorker.ready`.
- CacheStorage remained empty. Notification permission remained `default`.
- No browser subscription or backend registration was created.

The phone had subsequently locked: native screenshot was black; waking showed
Android keyguard active. Playwright native clicks could not reach the permission
request. The Owner was informed and replied "continue". Remaining native consent,
subscription, registration/reload/failure and response-loss checks are **BLOCKED /
NOT TESTED**, not failures attributed to the patch.

The QA-only proxy needed WebSocket forwarding and the temporary Next server
needed its exact hostname allowed for development HMR. That configuration was
limited to temporary QA tooling, not committed or applied to production.
Functional Fast Refresh after a source edit was **NOT TESTED**.
Only this task's worker/tabs/processes were cleaned up. Existing real Guest tabs,
consent, workers, subscriptions and production services were preserved.

## UI freeze

Further UI-freeze testing was **SKIPPED at the Owner's latest instruction**.
Earlier screenshots captured 80 baseline/candidate cases at each of 100% and
native 200% zoom; the original capture helper showed animation/font settling
noise (69/80 and 77/80 exact comparisons). A stabilized rerun was stopped when
the Owner skipped the matrix. There is no complete zero-difference acceptance
claim. Temporary captures and QA tooling are excluded from Git.

## Security and regression review

Applied VAYLET Planning, Implementation and Code Review Guardian contracts.
Reviewed actual diff, gesture timing, native deadlines, synchronous ownership,
abort/unmount/late-result/context fences, cleanup, exact HTTP contract and retry.
No P0/P1 defect was identified in this review; this is a local implementer review,
**not an independent security assessment**. The addressed silent-feedback finding
is P2. Remaining proof gaps are qualification limitations, not invented defects.

The registration transport, controller, service and authoritative SQL contract
are unchanged: Browser Session authority, mutation CSRF/Origin, ACTIVE exact-visit
scope, generation/expiry/revocation and tenant/Location authorization remain
server owned. Authorized retries retain the existing serialization/deduplication;
the client supplies no tenant/visit/session authority. No subscription endpoint,
key, Guest bearer, cookie or private VAPID material is included in this patch.

COS returned `AGENTS_NO_CHAT`; independent worker review was unavailable. No
alternate agent control plane was used or misrepresented as an independent review.

## Delivery / rollback

Delivery is limited to committing and pushing the named isolated branch; final
local and remote SHA evidence is reported by the delivery message. No PR, merge,
production deployment/settings change, sender activation or issue closure is
authorized or performed. The original `main` worktree and its untracked runbooks
remain untouched. A future rollback can revert this Customer-only commit on an
authorized branch; no migration/data rollback is needed. Do not unregister real
workers, delete caches or change user consent as a rollback shortcut.

Verdict: **PATCH IMPLEMENTED; qualification incomplete**. Review the remaining
physical and PostgreSQL gaps before any production readiness claim.
