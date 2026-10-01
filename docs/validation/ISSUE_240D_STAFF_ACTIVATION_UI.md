# Issue #240 / T05-D — activation and onboarding UI

Status: T05-D focused acceptance verified locally. Baseline exception below.

Baseline: `b939a2bc7609ff26ae414ff96f300e7b0d9ff96c`, fetched and verified.
Branch: `fix/240d-staff-activation-ui`. Only T05-D is authorized.

## Accepted implementation map

Source: owner Task 05-D brief, execution plan U-01/U-02, Accepted DEC-081,
DEC-023, DEC-024, DEC-029, DEC-078, DEC-080, DEC-082 and DEC-088.

Public `POST /v1/staff/auth/activate` accepts strict `{inviteToken,password}`.
Token is exact `vsi1.` plus 43 base64url characters; password transport reuses
Staff login bounds. Response contains only outcome ACTIVATED or ALREADY_ACTIVATED.
Exact approved Web Origin, strict JSON, empty query, no-store auth headers and
the current operation runner apply. No session, cookie or credential is issued.

PENDING User initializes its password using the existing provisioning policy:
15–128 Unicode code points, no CR/LF, maximum 1024 UTF-8 bytes. ACTIVE User proves
the current password through the Staff verifier; its password/status/sessions are
unchanged. DISABLED is denied. All unusable state/wrong proof/policy failures are
neutral STAFF_ACTIVATION_FAILED (401); limiter rejection is
STAFF_ACTIVATION_RATE_LIMITED (429), Retry-After 1–900 seconds. Non-disclosing
failure work uses the existing dummy verifier. Hash generation uses the exact
accepted Argon2id v19 m=65536/t=3/p=4, random 16-byte salt, 32-byte output.

Preflight lookup is not authority. Locked command order is onboarding email
advisory -> target User security advisory -> staff Organization advisory ->
active Organization share -> target membership update -> User update ->
invitation generation update. This follows resend's account-first and
membership-before-generation order, without taking Location lifecycle locks.
The final command rechecks exact hash proof, account state, same tenant/owner,
pending membership, current highest generation and database expiry. The first
protected write follows all proof. Activation preserves initial grants.

Migration 053 owns one narrow SECURITY DEFINER activation entrypoint, fixed
pg_catalog/public search path, PUBLIC/helper denial, audit fabrication guard
extension and two anti-abuse CHECK scope extensions. Runtime gets EXECUTE only;
direct protected DML remains denied. User/member activation, version +1,
consume and one STAFF_ONBOARDING_ACTIVATED event commit atomically. Audit target
and actor are the activated tenant membership, with invitationId, generation and
ACTIVATED outcome only; no credential, account-mode flag, email or IP.

Two Organizations targeting one User serialize on the User security lock. A
preflight PENDING proof that became ACTIVE fails; explicit retry must verify the
current hash, never replace it. Same-token retry returns ALREADY_ACTIVATED only
with current ACTIVE password proof, ACTIVE target, consumed non-revoked generation
and its durable activation audit. It performs no state-changing redemption.
Resend and activation share email/security/Organization/member locks: activation
first makes resend ineligible; resend first invalidates the old generation.

Limiter scopes: v1:staff-activation-credential (5) and
v1:staff-activation-client-address (30), rolling database 15-minute windows.
Keys use the existing HMAC derivation and trusted address resolver. Reserve before
expensive work; failure counts; success/reconciliation ignores reservations in
the activation transaction. Limiter failure is fail closed. Process loss retains
pending reservations within the bounded window.

Readable status adds PENDING while ordinary desired status remains ACTIVE/INACTIVE.
Directory predicates precede LIMIT; CA same tenant and LM lower-role/nonempty/full
active grant coverage apply. Detail gets safe latest generation/expiry/state only.
Separate opt-in read authorization never admits pending into ordinary mutations.

Create Employee occupies the existing toolbar action slot. FocusDialog collects
names/email/allowed lower role and 1–50 Locations from existing bounded authorized
discovery with explicit paging. No password/delivery claim. Create/resend operation
IDs persist for unchanged explicit retries/MFA, change for new material commands,
and never cause automatic POST replay. Fresh links exist only in dialog memory;
Copy is explicit. Reconciliation reports link unavailable and offers explicit
resend. Pending drawer preserves geometry and removes ordinary mutation controls.

Full scope ticket plus mount/target/invitation/draft epoch fences callbacks,
including A->B->A, success/error/finally and MFA. Public activation bypasses auth
restoration/scope discovery. Fragment capture accepts one invite, immediately
replaces navigation without the fragment, keeps only memory, and sends JSON only.
Reload requires reopening the original link. Page uses no-referrer and existing
auth primitives, locale and theme. EN/AR/RTL and focus behavior are required.

Entities: User, OrganizationMembership, StaffOnboardingInvitation, AuditEvent,
AntiAbuseEvent; grants are preserved. No ValetSession, Task/Dispatch, Shift or
configuration-policy transitions. T05-E/F/G and delivery providers remain out of
scope. Focused modules keep every authored file within 300 physical lines.

## Final evidence record

This record covers only T05-D. The final commit and remote SHA are reported in
the owner's chat after push; embedding this commit's own SHA here is impossible.
All paths below are relative to the repository root. No real invitation token
or activation link is included. Browser fixtures use synthetic credentials.

| Requested item | Result and evidence |
| --- | --- |
| 1. Branch | `fix/240d-staff-activation-ui` |
| 2. Starting SHA | `b939a2bc7609ff26ae414ff96f300e7b0d9ff96c` |
| 3–5. Final commit, remote SHA, status | Reported after commit/push in the final chat response; clean status is a closure check. |
| 6. Exact changed files | Manifest at the end of this record, including all PNG artifacts. |
| 7. Migration | `20261001005300_mgt_240d_staff_activation` |
| 8. Public route | `POST /v1/staff/auth/activate`; Dashboard `/staff/activate` |
| 9. Request | Strict JSON `{inviteToken: string, password: string}`; exact `vsi1.` credential shape, existing login transport bounds; no query/extra keys. Approved Origin required. |
| 10. Response | Strict `{outcome: "ACTIVATED" \| "ALREADY_ACTIVATED"}`. Generic unusable invitation/ownership/policy failure is 401; malformed transport 400; disallowed Origin 403; limiter 429; limiter unavailable 503. |
| 11. Password policy | Existing DEC-029 provisioning creation policy; DEC-023 login password transport/verifier for existing accounts. 15–128 Unicode code points, no CR/LF, maximum 1024 UTF-8 bytes for a newly initialized password. Existing legacy short passwords remain valid ownership proof. |
| 12. Hashing | Shared `staff-password-hashing.ts`, also used by provisioning: node-argon2 Argon2id v19, m=65536 KiB, t=3, p=4, random 16-byte salt, 32-byte output. Emitted PHC parameter order is m,p,t; SQL guard and existing accepted-profile verifier agree. |
| 13. New PENDING User | Initializes global password once, User ACTIVE, only invited membership ACTIVE/version +1, grants preserved, invitation consumed, one atomic audit. |
| 14–15. Existing ACTIVE ownership/non-reset | Current password verified against accepted stored hash; exact verified hash rechecked under User security lock. Equality assertions before/after activation and shared-User races; unrelated session refresh still works. No hash/status/session update for ACTIVE User. |
| 16. DISABLED | Generic 401 with no consumption/audit/reactivation; preflight and locked checks. |
| 17. Current generation | Highest persisted generation, same member/tenant/owner, non-revoked/unconsumed and DB-clock expiry rechecked before redemption; old-generation negative and resend races. |
| 18. Consume once | Member row/invitation locks plus atomic consume/state/audit; same-token concurrency test asserts version 2, one consume, one audit, zero sessions. |
| 19. Lost-response retry | ACTIVE current-password proof plus consumed non-revoked invitation, ACTIVE target and matching durable activation audit returns ALREADY_ACTIVATED; no repeated mutation. A preflight PENDING loser returns generic failure and requires explicit retry. |
| 20. Activation/resend race | Real PostgreSQL barrier tests exercise both winners: activation makes resend ineligible; resend revokes the old credential and only the new generation succeeds. |
| 21. Same-token race | Two real blocked requests; first activates, stale pending proof loses, explicit correct retry reconciles. Rollback winner releases waiting activation. |
| 22. Shared User/two tenants | Real concurrent requests with equal and different proposed passwords; only one initializes global User, second retains PENDING membership and unchanged established hash until correct explicit ownership proof. |
| 23–24. Anti-abuse | Independent HMAC-only `v1:staff-activation-credential` (5) and `v1:staff-activation-client-address` (30), rolling DB 15 minutes. Reserve before expensive work; failed attempts COUNTED, success/reconciliation IGNORED atomically. Credential rejection ignores its extra address reservation. Concurrent reservations and rotating-token address limit tested. |
| 25. Retry-After | Integer 1–900 seconds, header checked in real API limiter tests; browser waits and requires explicit retry without automatic POST. |
| 26. Audit | STAFF_ONBOARDING_ACTIVATED, tenant OrganizationMembership entity/actor, invitation ID/generation/ACTIVATED only. Atomic failure rollback tested; runtime audit fabrication denied. |
| 27. Runtime privileges | Provisioned twice with actual owner/runtime connections. Narrow entrypoint executes; direct User password/status, membership and invitation DML denied (42501); private helper/PUBLIC denied; fixed search_path and SECURITY DEFINER checked. |
| 28. No automatic session | API snapshot zero sessions after activation, no Set-Cookie, minimal response; browser zero auth/scope restoration calls and zero cookies, explicit Sign in link only. |
| 29. Pending reads | Readable PENDING is separate from ACTIVE/INACTIVE desired mutation contract. SQL tenant/role/grant/status/search/cursor predicates precede LIMIT. Safe latest generation/expiry/state projection contains no verifier/link/hash. |
| 30. LM authority | Real pending-read tests cover lower-role complete nonempty active Location coverage; mixed/outside/zero/elevated targets hidden before LIMIT and detail/resend denied. Grant loss hides formerly covered target. |
| 31. Mutation quarantine | Existing quarantine suite retains ordinary activate/deactivate/role/grant and Shift/Task denials. Default helpers exclude PENDING; only directory/detail/grant-list reads opt in. Guarded ordinary SQL commands deny pending directly. |
| 32–33. Create UI/roles | Existing primitives and explicit dialog, names/email/role and 1–50 Locations, no password or delivery claim. CA options: LOCATION_MANAGER, VALET_SUPERVISOR, VALET_EMPLOYEE; LM: lower two. Server authority tests deny ORG_ADMIN and foreign/uncovered scope. |
| 34. Location selector | Existing authorized bounded discovery, one visible page, explicit Next/Previous, selections retained across pages; inactive CA candidates labeled, LM inactive disabled. No staff-row fan-out. |
| 35. operationId | Generated for first submission; unchanged explicit network/MFA retry retains it; material draft edits including sorted selected IDs generate another. Resend stable until successful command; next explicit rotation gets new ID. |
| 36. MFA retry | Browser Create/Resend MFA callbacks only expose retry; no POST replay. Server reauthorizes grant/entitlement/MFA state. Browser authority loss and 401 identity/session replacement fence late callbacks and close old intent. |
| 37. Fresh link/copy | Fresh link remains component memory, never displayed in DOM; explicit Clipboard Copy only, localized result. Scope/identity/logout/unmount/target epochs discard stale result and copy feedback. |
| 38. Reconciliation | INVITE_PENDING_LINK_UNAVAILABLE has no reconstructed link; explicit Resend offered, no silent rotation. Browser tests verify no Copy button for unavailable result. |
| 39. Resend | Explicit pending-only action, clears old result before request, uses existing API/MFA runner and stable operationId; generation facts refreshed with bounded authoritative reads. Target A→B→A delayed success/failure fenced. |
| 40–41. Secret removal/storage | Single valid fragment captured into memory, synchronous history replacement removes hash/query; malformed/duplicate/missing fragments make no request. Reload requires original link. JSON body only, credentials omitted, no-referrer/no-store. Browser presence checks cover URL/DOM/cookies/localStorage/sessionStorage/resource URLs/Cache API/IndexedDB. |
| 42. EN/AR/RTL | Activation EN light and AR dark at 1440/480 widths; Arabic Create/pending with mixed Arabic name, Latin email/code and LTR expiry. Existing locale/theme providers retained. |
| 43. Accessibility | Labels, required password, keyboard Enter, focus containment/return to trigger, nested MFA dialog handling, Escape and narrow overflow assertions. No automated exhaustive WCAG claim. |
| 44. Request budget | Activation: zero calls before submit, one activation POST, zero auth/scope/session calls. Create: one extra candidate GET on open; explicit next/previous each one GET (1→2→3); successful submit one POST and one directory refresh. Pending: open one detail GET; resend one POST, one detail refresh and one directory refresh; zero candidates/grants calls. MFA callbacks zero replay. |
| 45–46. Visual freeze/Shifts | Exact baseline production files temporarily restored and then restored to this task; stable screenshots in baseline/final directories. Both Shifts images and desktop drawer: zero changed pixels. EN Employees difference bbox (1286,232)–(1408,268), AR Employees (369,319)–(460,355), AR drawer underlying button strip (448,319)–(460,355). All differences confined to approved Create action; table, shell and drawer geometry unchanged at tested viewports. |
| 47. DB/API/contracts | Exact focused results listed below; new T05-D API tests 33 PASS, DB 6 PASS, contracts 17 PASS. Existing regressions include one independently reproduced baseline exception. |
| 48. Playwright | Eight selected files: 26/26 PASS in one focused run. After narrow action placement fix, only the three affected files rerun: 7/7 PASS. Baseline screenshots: 2/2 PASS. |
| 49. Typechecks | contracts, api, database, dashboard PASS; Dashboard checked after final action placement. |
| 50. Static gates | Changed authored-file ESLint zero warnings PASS; changed authored TS/TSX/MJS/CSS Prettier check PASS; architecture PASS with 17 unchanged grandfather warnings; Prisma validate PASS; git diff --check PASS. |
| 51. Deliberately skipped | Root broad test/lint/typecheck/build, production build, whole API/database suites, all Dashboard E2E, cumulative T05-G closure, deployment and remote CI. No unrun gate claimed PASS. |
| 52. Environment/harness | Windows dependency hardlinks required approved pnpm execution. Initial missing root dotenv path caused 28P01; fixed harness invocation, no product workaround. CLI argument/loader wrapper errors corrected. Invalid synthetic cursor/API-error fixture and alert-selector errors corrected; not product or timeout instability. Argon PHC order was a deterministic T05-D SQL defect fixed before passing API runs. Stable screenshot capture removed transient initial animation. No controlled-harness hangs or timeout escalation. |
| 53. Physical lines | Full authored file count table below; no changed/new TS/TSX/MJS exceeds 300 physical lines including blanks. |
| 54. Old migrations | 001–052 untouched, verified diff; real 052→053 and fresh deployment preserve existing rows, credentials, grants, invitations, audits, anti-abuse events and prior authority function definitions. |
| 55–57. Scope/process | No Shift History/Force End/Live Operations implementation, email/SMS provider work, PR, merge, main update or Issue edit. Only task branch commit/push authorized. |

## Focused test executions

Counts below identify executions, not a cumulative sum: repeated files overlap.
PostgreSQL tests used the owned-suite harness with root DOTENV_CONFIG_PATH,
real disposable databases and versioned Prisma deployments; no db push.

| Focused files | Latest verified result |
| --- | --- |
| contracts: staff-activation, staff-onboarding, staff-management | 3 files, 17 PASS |
| database: staff-activation-migration, staff-onboarding-migration | 2 files, 6 PASS |
| API: staff-activation | 11 PASS |
| API: staff-activation-races + staff-activation-proof-races + staff-onboarding-quarantine | 3 files, 14 PASS (6 + 6 + 2) |
| API: staff-activation-anti-abuse + staff-pending-read (then 2 cases) + staff-onboarding-database + staff-onboarding + staff-onboarding-authority + staff-onboarding-resend | 6 files, 26 PASS |
| API: final staff-pending-read with additional cursor case | 3 PASS |
| API: staff-activation + staff-onboarding-database + staff-onboarding-races | 3 files, 23 PASS (11 + 2 + 10) |
| API units: staff-activation-observability + provision-staff + api-operation-runner + console-operation-observer | 4 files, 40 PASS; final activation-observability 2 PASS |
| API: staff-activation + staff-directory-filters + staff-management-lm-mutations | 25 PASS / 1 baseline FAIL (11 + 12 + 2 PASS) |
| Baseline-only staff-directory-filters reproduction | 12 PASS / same 1 FAIL |
| Playwright: issue240d-activation, create, pending, create-fencing, pending-fencing, retry-authority, selector-visual, visual | 26 PASS |
| After narrow visual fix: create, selector-visual, visual only | 7 PASS |

The unchanged baseline test `staff-directory-filters.integration.test.ts:151`
expects foreign Company Admin Location filter to return 404; actual behavior is
200 with an empty directory. Reproduced with exact starting-commit directory
service/query/authorization files, then task files restored. This baseline debt
was neither fixed nor weakened inside T05-D. The full regression selection is
therefore not claimed entirely green; T05-D acceptance is green.

## Adversarial review

Applied `.agents/skills/vaylet-code-review/SKILL.md` and all review-matrix passes
against the actual changed implementation, SQL, contracts and tests. Review is
local self-review, not contributor cross-review or remote CI. No unresolved
T05-D blocker found after the PHC guard and narrow placement corrections.

The owner's 44 hostile challenges map as follows (each number reviewed):

| Challenges | Trace/evidence |
| --- | --- |
| 1,2,3 | ACTIVE verifier plus exact locked hash equality; ACTIVE branch performs no User write. |
| 4 | Shared-User security lock, null-hash PENDING guard and both equal/different-password PG races. |
| 5 | DISABLED preflight/locked negative tests. |
| 6,7,8 | Latest generation/revocation/DB-clock expiry checks, negative cases and both resend race orders. |
| 9,10 | Consume/audit transaction and durable ALREADY_ACTIVATED reconciliation; same-token and rollback tests. |
| 11,12,13,14 | Read-only opt-in defaults; ordinary guarded commands and operational quarantine regressions unchanged. |
| 15,16 | Immediate fragment replacement and full browser persistence presence checks. |
| 17,18 | Minimal audit schema, observer envelope/log redaction tests, no token/password logging code. |
| 19 | No session service call, no Set-Cookie, session snapshot and browser zero-cookie assertions. |
| 20,21 | Public strict token/password request, neutral 401 body, dummy verification; no account lookup endpoint or mode flag. |
| 22,23,24 | Persisted HMAC scopes, concurrent reservation limit, rotating-token address test; no raw key persistence. |
| 25,26,27,28 | Existing role allowlists and authoritative guarded onboarding; CA/LM substitution, coverage and lost-authority tests. |
| 29,30,31 | Existing explicit sensitive mutation runner; browser MFA/401 tests show no hidden command replay. |
| 32 | Material command fingerprint generates a new operationId; unchanged retry equality test. |
| 33,34 | Full scope/session/identity/selection and target epochs, mount fences, A→B→A success/error/MFA browser tests. |
| 35,36 | includePending defaults false; directory predicates precede LIMIT, covered-only limit-one test. |
| 37 | Ordinary directory regressions, with explicitly preserved unrelated baseline exception. |
| 38,39 | Shifts production files unchanged; exact pixel comparisons and shell source untouched. |
| 40,41,42 | Only migration 053 added; twice-provisioned runtime direct-DML/helper denials and PUBLIC ACL assertions. |
| 43 | Diff scope: no E/F/G implementation or delivery-provider work. |
| 44 | Every authored file measured below; architecture passes unchanged baseline policy. |

Authorization precedes mutation: service preflight only selects verifier work;
SQL `staff_onboarding_activate` acquires identity/User security/Organization and
member/account/invitation locks, proves current persisted account/hash and target
lineage/generation/expiry, then first changes User/member/invitation and writes
audit. Reconciliation proves current ACTIVE ownership and durable audit before
returning, and creates no protected state writes. Anti-abuse reservations are
the intentional pre-proof admission boundary, not tenant/account mutation.

## Intentional changed-file manifest and physical counts

| Exact file | Authored physical lines |
| --- | ---: |
| `apps/api/src/common/http/api-errors.ts` | 227 |
| `apps/api/src/common/http/staff-auth-operation-routes.ts` | 71 |
| `apps/api/src/modules/anti-abuse/anti-abuse-key.ts` | 57 |
| `apps/api/src/modules/anti-abuse/anti-abuse.service.ts` | 299 |
| `apps/api/src/modules/auth/auth.module.ts` | 84 |
| `apps/api/src/modules/auth/staff-activation-repository.ts` | 59 |
| `apps/api/src/modules/auth/staff-activation.controller.ts` | 54 |
| `apps/api/src/modules/auth/staff-activation.service.ts` | 123 |
| `apps/api/src/modules/auth/staff-password-hashing.ts` | 18 |
| `apps/api/src/modules/management/staff-directory-query.ts` | 101 |
| `apps/api/src/modules/management/staff-directory.service.ts` | 144 |
| `apps/api/src/modules/management/staff-location-access.service.ts` | 170 |
| `apps/api/src/modules/management/staff-management-authorization.ts` | 239 |
| `apps/api/src/modules/management/staff-management-projection.ts` | 85 |
| `apps/api/src/modules/management/staff-pending-invitation-query.ts` | 31 |
| `apps/api/test/staff-activation-anti-abuse.integration.test.ts` | 128 |
| `apps/api/test/staff-activation-observability.test.ts` | 59 |
| `apps/api/test/staff-activation-proof-races.integration.test.ts` | 94 |
| `apps/api/test/staff-activation-races.integration.test.ts` | 174 |
| `apps/api/test/staff-activation-test-fixture.ts` | 48 |
| `apps/api/test/staff-activation.integration.test.ts` | 249 |
| `apps/api/test/staff-onboarding-database.integration.test.ts` | 205 |
| `apps/api/test/staff-onboarding-quarantine.integration.test.ts` | 133 |
| `apps/api/test/staff-pending-read.integration.test.ts` | 180 |
| `apps/api/tools/staff-provisioning/provisioning-password.ts` | 48 |
| `apps/dashboard/e2e/issue240d-activation.spec.ts` | 146 |
| `apps/dashboard/e2e/issue240d-create-fencing.spec.ts` | 204 |
| `apps/dashboard/e2e/issue240d-create.spec.ts` | 162 |
| `apps/dashboard/e2e/issue240d-pending-fencing.spec.ts` | 109 |
| `apps/dashboard/e2e/issue240d-pending.spec.ts` | 139 |
| `apps/dashboard/e2e/issue240d-retry-authority.spec.ts` | 160 |
| `apps/dashboard/e2e/issue240d-selector-visual.spec.ts` | 128 |
| `apps/dashboard/e2e/issue240d-visual.spec.ts` | 76 |
| `apps/dashboard/e2e/support/issue240d-onboarding.ts` | 140 |
| `apps/dashboard/src/app/app-providers.tsx` | 37 |
| `apps/dashboard/src/app/staff/activate/page.tsx` | 11 |
| `apps/dashboard/src/features/administration/administration-drawer.tsx` | 96 |
| `apps/dashboard/src/features/administration/staff/staff-activation-api.ts` | 42 |
| `apps/dashboard/src/features/administration/staff/staff-activation-page.tsx` | 190 |
| `apps/dashboard/src/features/administration/staff/staff-create-dialog.tsx` | 196 |
| `apps/dashboard/src/features/administration/staff/staff-create-locations.tsx` | 104 |
| `apps/dashboard/src/features/administration/staff/staff-detail-drawer.tsx` | 215 |
| `apps/dashboard/src/features/administration/staff/staff-employees-body.tsx` | 273 |
| `apps/dashboard/src/features/administration/staff/staff-labels.ts` | 23 |
| `apps/dashboard/src/features/administration/staff/staff-onboarding-api.ts` | 36 |
| `apps/dashboard/src/features/administration/staff/staff-onboarding-copy.ts` | 78 |
| `apps/dashboard/src/features/administration/staff/staff-onboarding-result.tsx` | 52 |
| `apps/dashboard/src/features/administration/staff/staff-pending-invite-panel.tsx` | 119 |
| `apps/dashboard/src/features/administration/staff/staff-reference.module.css` | — |
| `apps/dashboard/src/features/administration/staff/use-staff-directory-query.ts` | 92 |
| `docs/03_DATABASE_SCHEMA.md` | — |
| `docs/06_SECURITY_AND_DATA_RULES.md` | — |
| `docs/08_DECISIONS_LOG.md` | — |
| `docs/23_MANAGEMENT_BACKEND_216_EXECUTION_PLAN.md` | — |
| `docs/decisions/DEC-081_STAFF_ROLE_AND_ACCESS_LIFECYCLE.md` | — |
| `docs/validation/ISSUE_240D_STAFF_ACTIVATION_UI.md` | — |
| `docs/validation/issue240d-baseline/issue240d-visual-T05-D-frozen-surfaces-AR-dark-narrow-chromium/drawer.png` | — |
| `docs/validation/issue240d-baseline/issue240d-visual-T05-D-frozen-surfaces-AR-dark-narrow-chromium/employees.png` | — |
| `docs/validation/issue240d-baseline/issue240d-visual-T05-D-frozen-surfaces-AR-dark-narrow-chromium/shifts.png` | — |
| `docs/validation/issue240d-baseline/issue240d-visual-T05-D-frozen-surfaces-EN-light-desktop-chromium/drawer.png` | — |
| `docs/validation/issue240d-baseline/issue240d-visual-T05-D-frozen-surfaces-EN-light-desktop-chromium/employees.png` | — |
| `docs/validation/issue240d-baseline/issue240d-visual-T05-D-frozen-surfaces-EN-light-desktop-chromium/shifts.png` | — |
| `docs/validation/issue240d-final/issue240d-activation-stand-86211-s-once-without-auth-session-chromium/activation-complete.png` | — |
| `docs/validation/issue240d-final/issue240d-activation-stand-86211-s-once-without-auth-session-chromium/activation.png` | — |
| `docs/validation/issue240d-final/issue240d-activation-stand-fbd5c-s-once-without-auth-session-chromium/activation-complete.png` | — |
| `docs/validation/issue240d-final/issue240d-activation-stand-fbd5c-s-once-without-auth-session-chromium/activation.png` | — |
| `docs/validation/issue240d-final/issue240d-create-Create-Em-173f8-lector-fresh-copy-and-focus-chromium/create-dialog.png` | — |
| `docs/validation/issue240d-final/issue240d-create-Create-Em-173f8-lector-fresh-copy-and-focus-chromium/create-result.png` | — |
| `docs/validation/issue240d-final/issue240d-create-Create-Em-405c5-lector-fresh-copy-and-focus-chromium/create-dialog.png` | — |
| `docs/validation/issue240d-final/issue240d-create-Create-Em-405c5-lector-fresh-copy-and-focus-chromium/create-result.png` | — |
| `docs/validation/issue240d-final/issue240d-pending-pending--5c91e--explicit-resend-fresh-copy-chromium/pending-detail.png` | — |
| `docs/validation/issue240d-final/issue240d-pending-pending--5c91e--explicit-resend-fresh-copy-chromium/pending-result.png` | — |
| `docs/validation/issue240d-final/issue240d-pending-pending--c2a13-reconciliation-without-link-chromium/pending-detail.png` | — |
| `docs/validation/issue240d-final/issue240d-pending-pending--c2a13-reconciliation-without-link-chromium/pending-result.png` | — |
| `docs/validation/issue240d-final/issue240d-selector-visual--68d91-ity-and-avoid-page-overflow-chromium/create-ar-dark-narrow.png` | — |
| `docs/validation/issue240d-final/issue240d-selector-visual--68d91-ity-and-avoid-page-overflow-chromium/pending-ar-dark-narrow.png` | — |
| `docs/validation/issue240d-final/issue240d-visual-T05-D-frozen-surfaces-AR-dark-narrow-chromium/drawer.png` | — |
| `docs/validation/issue240d-final/issue240d-visual-T05-D-frozen-surfaces-AR-dark-narrow-chromium/employees.png` | — |
| `docs/validation/issue240d-final/issue240d-visual-T05-D-frozen-surfaces-AR-dark-narrow-chromium/shifts.png` | — |
| `docs/validation/issue240d-final/issue240d-visual-T05-D-frozen-surfaces-EN-light-desktop-chromium/drawer.png` | — |
| `docs/validation/issue240d-final/issue240d-visual-T05-D-frozen-surfaces-EN-light-desktop-chromium/employees.png` | — |
| `docs/validation/issue240d-final/issue240d-visual-T05-D-frozen-surfaces-EN-light-desktop-chromium/shifts.png` | — |
| `packages/contracts/src/index.ts` | 63 |
| `packages/contracts/src/staff-activation.test.ts` | 108 |
| `packages/contracts/src/staff-activation.ts` | 51 |
| `packages/contracts/src/staff-management.ts` | 201 |
| `packages/database/prisma/migrations/20261001005300_mgt_240d_staff_activation/migration.sql` | — |
| `packages/database/scripts/staff-onboarding-runtime-privileges.mjs` | 105 |
| `packages/database/src/migration-manifest.ts` | 55 |
| `packages/database/src/staff-activation-migration.integration.test.ts` | 266 |
| `packages/database/src/staff-onboarding-migration.integration.test.ts` | 215 |
