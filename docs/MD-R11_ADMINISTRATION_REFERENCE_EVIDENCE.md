# MD-R11 — Administration reference evidence

Status: local R11 verification passed; branch delivery recorded in section U.

## A. Baseline and pre-code contract

Required and verified main: `4010f3edd34fa0cfe4a689be9cb9d81f25755808`,
`fix(dashboard): restore reports and visit contacts reference parity`.
Fetch, switch main and fast-forward pull completed; tracked source was clean.
Task branch: `fix/md-r11-administration-reference-parity`. No worktree.

Affected presentation entities: Organization/Location typed configuration,
OrganizationMembership directory and fixed roles, inherited branding,
OrganizationSubscription, integration status, exact StaffAuthSession MFA.
No ValetSession or Task/Dispatch transitions, DB constraints/indexes, migration,
backend, contract or dependency changes are authorized. Existing sellable-MVP
configuration and authority remain binding.

Contract ledger:

- LOCKED: DEC-058/080/083/095 typed settings and narrower LM catalog; explicit
  false versus absent override; Company CLEAR only operating hours; nullable
  CA-only Location SLA. DEC-062/085/086 name/color inheritance and deferred logo.
- LOCKED: DEC-078 exact-session MFA; sensitive writes require explicit retry;
  CAS conflict reload; existing read generation and scope unmount fences.
- LOCKED: DEC-081 fixed roles and bounded read-only Users here; mutations remain
  in Employees. DEC-087 exact three status-only integrations. DEC-088/089
  server-owned entitlements and special SUBSCRIPTION_READ access.
- DERIVED: localized presentation, semantic keyboard tabs, named local table
  scroll regions, safe static Help, reference card/form presentation for MFA.
- FORBIDDEN: provider/support/billing/profile fiction, generic policies/custom
  roles, entitlement inference from planCode, backend expansion, R12.
- UNRESOLVED implementation semantics: none; unsupported product sub-scopes
  below stay stopped.

Structure: feature-local presentation files; preserve the 293-line foundation
app. No change to request clients, mutation hooks, authority or ceremony logic.
The account-security initial read now ignores its canceled effect's result,
error and busy completion; this fixes a false error next to Verified observed
under development Strict Mode without changing a mutation or MFA assertion.

## B. Reference inspection before edits

Chromium, 100% zoom, device scale 1; 1440x900 and 480x900; Light/Dark.
Evidence directory:
`C:/Users/LP/.codex/visualizations/2026/09/27/01a0e45b-aa9f-7d01-ac4c-170e17a1cd8f`.
Use `reference-measurements-settled.json` and `*-settled.png` as the final
pre-edit measurements; initial un-settled captures are not measurement authority.

Exact reference routes exist for Policies, Roles/Users, Integrations (direct
hash route), Billing (direct hash route), Settings/Security and Help. Branding
has no dedicated route in the reference router; Settings forms supply its family.
Arabic Preview leaves English content and no document `dir`; production must
provide real Arabic/RTL. Narrow reference retains sidebar/overflow defects;
production local scrolling/stacking is an ACCESSIBILITY exception.

Measured desktop: content x292/y96; H1 24px/32px; Policies and Roles table
x293/y222/width1114; header44.5px; policy rows67px; role rows65px. Card padding
24px and 12px radius; settings inputs8px radius. Help uses 24px gaps and a
7:5 content grid. Security uses the Settings card family within its separate
production account-security boundary.

## Backend/product gaps (stopped sub-scopes)

| Capability | Blueprint/reference | Current evidence / why UI cannot implement | Minimum follow-up contract | Authority / audit / concurrency / DB |
| --- | --- | --- | --- | --- |
| Messaging/Maps integration status | Blueprint includes providers; reference connector cards | management-integrations.ts is an exact PLATE_OCR/STAFF_PUSH/DIGITAL_PAYMENT tuple | Separate accepted bounded secret-free status projection; separate issue required YES | CA read; no read audit; scope fencing; persistence impact to be decided separately |
| Configured support contact/ticketing | Blueprint support; reference hotline/tickets/diagnostics | No configured support channel or support API found in dashboard/contracts | Separate accepted support provisioning/contact contract; separate issue required YES if needed | Scope/privacy, mutation audit, retry and storage need separate decisions |
| Profile editing | Reference profile fields | No current general profile/edit contract | Separate accepted identity-field authority/validation contract; separate issue required YES if required | User ownership, sensitive audit/CAS/storage to be decided separately |
| Logo | Reference white-label idea | DEC-086 explicitly defers verified assets | Separate accepted verified upload/lifecycle contract; separate issue required YES if required | Tenant asset authority, audit, lifecycle, DB to be decided separately |

These gaps do not authorize implementation or issue creation in R11.

Reference details: Policies/Roles subtitles are 14/20, y130; tabs begin y191
inside the card, with 12px text and 12px bottom padding. Table headers use
14px/24px vertical/horizontal padding. Integration search is 256x38 with
8px/12px padding, filters 28px high. Settings inputs are 303x38; Settings
tabs y172, height30. Billing's reference invoice table begins y554 with
40.5px header/53px rows; those invoice data/actions are unsupported. Help's
reference form uses a 7:5 grid, 24px card padding, 38px inputs and 36px selects;
ticket rows begin below y964 and are prototype fiction. Security & 2FA and
Localization tabs were opened physically. No production administration drawer
was added; existing sensitive MFA dialogs retain their focus boundary.

The JSON includes per-selector boxes, font/line height, padding, border, radius
and Light/Dark background values for all six routes at both widths. Separate
`reference-settings-security-settled.png`, locale and Arabic-control captures
record the extra settings states. These are local artifacts, not tracked assets.

## C. Intentional exceptions

| Surface | Exact category | Reason |
| --- | --- | --- |
| Policies | PROTOTYPE_FICTION | No generic Add Policy, rules builder, Key Policy or custom policy actions. Typed settings replace prototype rows. |
| Policies | TRUTHFUL_STATE | Real controls/source/default evidence require taller Location rows than 67px and a seven-day informational-hours row. No saved schedule is stated explicitly. |
| Roles | AUTHORITY | Four accepted staff roles, unavailable totals and no role editor. Users remain CA-only and read-only here. |
| Branding | UNSUPPORTED_BACKEND | Settings card/form family because no exact reference Branding page; name/color only. Logo/domain/fonts are absent. |
| Integrations | UNSUPPORTED_BACKEND | Only the exact three accepted status projections; no Configure, Test Connection or provider setup. |
| Billing | PROTOTYPE_FICTION | No prices, renewal dates, invoices, payment card or checkout. Opaque planCode/status/three entitlements replace that content. |
| Billing | AUTHORITY | SUBSCRIPTION_READ remains independent of ordinary Dashboard commercial access. |
| Security | SECURITY | Separate account-security route and real MFA ceremonies replace the prototype toggle/profile fields. |
| Security | PRIVACY | Real enrollment secrets/recovery material are excluded from visual capture and Git evidence. |
| Help | UNSUPPORTED_BACKEND | Static guidance/FAQ/security link replaces unconfigured support tickets, hotline, diagnostic and status panels. |
| All | ACCESSIBILITY | Named keyboard scroll regions, manual keyboard tabs, focus outlines and narrow stacking replace the reference's narrow sidebar/overflow defects. |
| All | LOCALIZATION | Real EN/AR/RTL; 3011 Arabic control is inert. Localized wrapping may change row/card height. |
| All | TRUTHFUL_STATE | Loading, denied, null, empty, error and server status stay distinct; no sample values are substituted. |

## D. Files changed

Paths below are relative to the repository; every authored source/test/style
file and its formatted physical line count is listed again in section R.

| File under apps/dashboard/ | Purpose |
| --- | --- |
| src/features/administration/reference-administration-page.tsx | Local presentation wrapper for the five R11 administration pages. |
| src/features/administration/reference-administration.module.css | Reference geometry, source/value columns, logical alignment, wrapping and focus. |
| src/features/administration/administration-tabs.tsx | Shared manual-activation tab semantics and RTL keyboard movement. |
| src/features/administration/settings/settings-page.tsx | Compose scope tabs without changing active read gates. |
| src/features/administration/settings/company-settings-panel.tsx | Named keyboard table region; existing typed save/clear path retained. |
| src/features/administration/settings/management-location-settings-panel.tsx | Surface server Company default beside effective/source. |
| src/features/administration/settings/location-manager-settings-panel.tsx | Same presentation for the existing narrow LM projection. |
| src/features/administration/settings/setting-row.tsx | Localized effective/default/source text with bidi isolation. |
| src/features/administration/settings/operating-hours-editor.tsx | Informational and no-saved-schedule copy, EN/AR. |
| src/features/administration/roles/roles-page.tsx | Tabs, named regions and manager-facing fixed-role descriptions. |
| src/features/administration/branding/branding-page.tsx | Reference wrapper and scope tab/tabpanel semantics. |
| src/features/administration/commercial/integrations-page.tsx | Local reference wrapper; projection/filter/refresh behavior unchanged. |
| src/features/administration/commercial/subscription-page.tsx | Local wrapper and named entitlement table scroll region. |
| src/components/security/account-security-panel.tsx | Reference card/status classes and canceled initial-read guard. |
| src/components/security/account-security.module.css | Local security card/form/status/focus styling. |
| src/components/foundation/help-foundation.tsx | Finished static guidance/FAQ/security-entry surface. |
| src/components/foundation/help-copy.ts | Reviewed EN/AR content grounded in current behavior. |
| src/components/foundation/help-foundation.module.css | Reference Help card/grid/FAQ responsive presentation. |
| e2e/administration-concurrency.spec.ts | Keep three existing tests; extract fourth test to satisfy formatted size. |
| e2e/administration-roles-cursor.spec.ts | Existing Roles cursor race unchanged except button→tab selectors. |
| e2e/support/md-r11-fixtures.ts | Synthetic current-contract projections and scope entry helper. |
| e2e/md-r11-presentation.spec.ts | Keyboard tabs, active reads and static Help behavior. |
| e2e/md-r11-commercial.spec.ts | Six integration statuses and three subscription statuses. |
| e2e/md-r11-read-races.spec.ts | Tab, Location and Billing stale-read fences. |
| e2e/md-r11-security.spec.ts | MFA presentation, canceled-read regression and synthetic recovery privacy. |
| e2e/md-r11-privacy.spec.ts | Business persistence scan, settled counts and no polling. |
| e2e/md-r11-visual.spec.ts | Reference-measured nine-surface EN/AR/theme/width matrix. |
| e2e-runtime/md-r11-administration.spec.ts | Real local CA/LM settings, SLA, branding and read-only pages. |

`docs/MD-R11_ADMINISTRATION_REFERENCE_EVIDENCE.md` is this evidence record.
No mature assertion was deleted: the Roles cursor test was moved intact and
run under the same administration test selection. Much of the source diff is
normal Prettier expansion of existing compressed JSX, not new behavior.

## E. Policies / Settings

Company retains the 16 typed keys (15 regular rows plus operatingHours).
Company CLEAR remains operatingHours only. CA exact Location adds the accepted
nullable 30–3600-second SLA target; no client default is invented. The ten-key
legacyLocationKeys filter remains unchanged for LM, with no Company tab,
language/hours/OCR/parking/notification expansion or SLA editor.

Location rows now show localized inherited/overridden effective value and
the actual Company default. `overridePresent=false`, explicit false and CLEAR
remain different values/commands. No endpoint/body/schema changed. Existing
integer/money/enum/hours validation and `expectedUpdatedAt` CAS are retained.
Seven-day hours are explicitly informational and do not gate field operations.
OCR preference and the two notification preferences do not assert provider
readiness or expose templates/provider credentials.

Evidence: existing settings validation/explicit-false browser tests, 517 unit
tests, backend settings/configuration/SLA validation/CAS/audit regressions,
and the real R11 CA test (Company save; Location set/clear; invalid SLA 29,
save180/clear). Sensitive MFA, explicit retry and authoritative conflict reload
use the unchanged shared mutation hook; the existing Branding browser test
and real CAS test exercise that composition, while backend settings tests
exercise the settings-specific authority and concurrency boundary.

## F. Roles / Users

Exactly ORG_ADMIN, LOCATION_MANAGER, VALET_SUPERVISOR and VALET_EMPLOYEE.
No custom role/permission controls, no invented totals. The em dash has an
accessible unavailable-total label. Users reads one bounded directory page
only when activated, uses the opaque cursor and clears history on scope-key
replacement. No Employees mutation controls were copied here. The extracted
cursor test proves A's pending next page/cursor cannot populate B.

## G. Branding

Only display name and primary color; existing Company/Location/LM editors,
server default/overridePresent/override/effective projection, SET/CLEAR,
expectedUpdatedAt and sensitive MFA paths are unchanged. Location fields
show effective value and inherited/overridden source; no logo placeholder.
The unchanged BRANDING boundary requires both dashboardAccess and basicBranding
in addition to current role/scope authority. Both denial combinations passed
existing browser tests. Real local tests saved/cleared Location color, read LM
inherited fields, saved Company name, induced literal two-tab CAS409 and
required an explicit retry. The new tab race rejects an old Company response.

## H. Integrations

Exact tuple: PLATE_OCR, STAFF_PUSH, DIGITAL_PAYMENT. DISABLED, UNAVAILABLE,
MISCONFIGURED, DEGRADED, OPERATIONAL and UNKNOWN remain distinct localized text.
Unknown has no good-status styling. Three current cards, local filtering and
explicit Refresh only; no setup, provider choice, test connection, webhook,
secret field or mutation traffic. Backend status privacy tests and real local
three-card reads passed. Messaging/Maps remain the stopped gap above.

## I. Billing

Only opaque planCode, TRIAL/ACTIVE/SUSPENDED and dashboardAccess/reportExports/
basicBranding booleans. Null has a deliberate no-subscription state, no free
plan. Fixture tests exercise all statuses and null; real local test reads the
persisted three entitlement rows. SUBSCRIPTION_READ recovery tests pass for CA
without ordinary context/Location enumeration and for exact active granted LM
Location. No price, currency, invoice, card, renewal or billing execution.

## J. Security

Separate `/security` remains session-account scoped. State checking, enrollment
required/pending, step-up, assured and truthful error presentation passed.
Existing MFA tests cover enrollment disclosure, recovery and mutation401
reconciliation; new test covers reissue and ten-code dismissal. Real local
tests cover enrollment, freshness loss, recovery, refresh/logout/revocation
and separate-context exact-session assurance. No ceremony mutation, client,
rate/error mapping or replay policy changed.

Initial canceled reads cannot publish stale state/error/busy completion after
an effect restart. This was a real visible development defect, not suppression
of a valid server error (the new delayed503 test still exposes the error).
Synthetic reissued codes are absent from localStorage, sessionStorage,
IndexedDB and CacheStorage while disclosed. Real runtime traces were disabled;
no actual MFA material is in screenshots or this document.

## K. Help

Static reviewed guidance: authorized scope, inheritance versus explicit No,
Employees-owned access management, read-only commercial pages, conflict review
and explicit retry, informational hours and interface preferences. Source basis
is the Accepted decisions listed in A and current route/mutation contracts.
Native FAQ details only disclose static text; the sole destination is the real
account-security route. No ticket POST, support email/phone, hotline, health,
latency, active node or diagnostic bundle. No administration dataset reads.

## L. Authority

| Surface | CA | LM | SUP | Employee | Guest | Entitlement/direct-route boundary |
| --- | --- | --- | --- | --- | --- | --- |
| Policies | Company; exact allowed Location | Exact granted Location, ten legacy keys | Denied | Denied | Sign-in boundary | DASHBOARD plus current role/scope |
| Roles/Users | Allowed | Denied | Denied | Denied | Sign-in boundary | DASHBOARD, CA only |
| Branding | Company/exact Location | Exact granted Location only | Denied | Denied | Sign-in boundary | DASHBOARD + basicBranding; fresh server authority |
| Integrations | Organization read | Denied | Denied | Denied | Sign-in boundary | DASHBOARD, CA only |
| Billing | Organization SUBSCRIPTION_READ | Active exact granted Location SUBSCRIPTION_READ | Denied | Denied | Sign-in boundary | Preserves access even without ordinary Dashboard entitlement |
| Security | Own Staff session | Own Staff session | Own Staff session | Existing own-account authenticated route retained | Sign-in boundary | Separate accountSecurity boundary; no selected Location required |
| Help | Existing foundation entry | Existing foundation entry | Existing active-shift foundation entry | No Management Help content | Sign-in boundary | FOUNDATION_ENTRY; not a new business capability |

Navigation hiding is not used as authorization. Route wrappers, selected-scope
revalidation, NavigationAuthority, API transports and backend guards are
unchanged. Browser authority/direct-route tests plus real persisted-role/grant
tests and selected backend tests cover the relevant negative boundaries.

## M. Concurrency

| Scenario | Evidence |
| --- | --- |
| Organization A→B→A | New Billing pending first-A business read; current A remains after release |
| Exact Location A→B→A | New settings response race; stale first-A value99 cannot replace45 |
| Company→Location→Company | New separate Settings and Branding races |
| Integrations A response after B | Existing administration-concurrency test |
| Billing authority response race | Existing subscription-recovery test; distinct from page business-read test |
| Roles Users signed cursor | Extracted existing test: reset to null before B read, no old page |
| Pending read/logout or identity/session change | Existing R05/R06 generation tests, auth-session and foundation unit suite |
| Pending sensitive write/scope change | Real cross-feature test: old Company commit cannot show success in newer scope |
| CAS conflict | Existing Branding fixture reload + real literal two-tab409/explicit retry + backend settings/branding CAS |
| MFA/exact session | Existing MFA reconciliation and real two-context assurance tests |

The unchanged use-authoritative-read uses request key, disposed state and
generation checks in addition to AbortController. No assertion relies solely
on request cancellation. Race harnesses release delayed responses after the
newer state has rendered. Billing authority discovery and page business read
share an endpoint and are intentionally distinguished in the new fixture.

## N. Accessibility / localization

Manual tabs: role tablist/tab/tabpanel, selected/tabIndex, Enter/Space,
Home/End and RTL-aware arrows. Moving focus does not preload a hidden tab.
Named focusable horizontal table regions preserve narrow local scrolling;
document scrollWidth equals viewport at480 and1440 throughout the matrix.
Table headers/status text, bidi values/planCode/email and logical alignment
are retained. Existing nested-MFA focus trap/Escape/restoration tests pass.

All new user copy is EN/AR. Eight viewport/locale/theme combinations cover nine
surfaces, repeated five times (40 tests,360 captures). Measurements were fixed
from3011 first: exact desktop x/y/width/header height and Roles row height,
H1 typography and no document overflow. Candidate screenshots were physically
viewed, including desktop Help/Branding/Integrations and narrow Arabic dark
Policies/Roles/Help/Security. Arabic reference limitation is not claimed as
reference parity evidence. Reference-family exceptions are in C.

## O. Request budget

Machine-readable reports: `request-budget-report.json` (development3003) and
`built-budget-report.json` (normal verification build temporarily on3004).
Both are local artifacts. The built probe is not deployment/production proof.

For one settled Policies→Roles Users→Branding→Integrations→Billing journey:

| Protected endpoint suffix | Built count | Development count |
| --- | ---: | ---: |
| Company settings | 1 | 2 |
| Staff directory | 1 | 1 |
| Company branding | 1 | 2 |
| Company integrations | 1 | 2 |
| Company subscription (all existing authority/discovery/page uses combined) | 8 | 9 |
| Company context | 6 | 6 |
| Feature authority | 5 | 5 |
| Management Organizations | 1 | 1 |
| Dashboard Organizations | 1 | 1 |
| Company Locations | 1 | 1 |

The development duplicates are Strict Mode mounts; compiled page datasets
read once. Subscription totals include mandatory route/discovery revalidation,
not eight Billing page reads or polling. No new subscription caller was added.
The page itself still has one active-scope bounded read effect. Settled counts
stay unchanged during the idle probe. Explicit integration Refresh adds exactly
one read; six status tests add no writes. Users tab starts with zero directory
reads, activation adds one, and only explicit Next loads another bounded page.
Settings hidden Location tab has zero reads; activation adds one; returning
to Company adds one. Help adds zero settings/branding/integration/staff reads.
Auth restore/login are separately observed once each and are not business reads.

## P. Privacy / storage

No production persistence code was added. Business sentinel scans exercise
settings value, staff email, unsaved branding draft, integration key and planCode
against localStorage, sessionStorage, IndexedDB and CacheStorage: zero matches.
New recovery-code test also scans every disclosed synthetic code in all four
stores before dismissal. Existing MFA client unit tests verify no cached
enrollment/recovery material; existing browser tests clear ceremony material
after reconciliation. Existing MD05 privacy tests remain passing. No provider
secret fields, auth token storage, real secrets or screenshot artifacts staged.

## Q. Commands and results

Commands ran from the repository root unless stated otherwise. `A` below means
the absolute local artifact directory recorded in B; substitution is for
readability and is not a repository environment/configuration change.

| Exact command (with A expanded to that directory) | Result |
| --- | --- |
| `corepack pnpm --filter @valet/dashboard test` | PASS:69 files,517 tests after the security-read fix |
| `corepack pnpm --filter @valet/dashboard test:e2e administration mfa.spec.ts auth-session.spec.ts subscription-recovery.spec.ts foundation-authority-follow-up.spec.ts md05-navigation-accessibility.spec.ts md05-storage-privacy.spec.ts md-r09-states.spec.ts md-r10-evidence.spec.ts scope-authority.spec.ts md-r11-presentation.spec.ts md-r11-security.spec.ts md-r11-commercial.spec.ts --reporter=line --output=A/r11-regression-final` | PASS:151 |
| `corepack pnpm --filter @valet/dashboard test:e2e md-r11-read-races.spec.ts md-r11-privacy.spec.ts --reporter=line --output=A/r11-race-privacy-verified` | PASS:5 |
| `corepack pnpm --filter @valet/dashboard test:e2e md-r11-security.spec.ts --reporter=line --output=A/r11-security-privacy` | PASS:5, after adding code-persistence assertions |
| `corepack pnpm --filter @valet/dashboard test:e2e md-r11-visual.spec.ts --repeat-each=5 --reporter=line --output=A/r11-visual-verified` | PASS:40,360 captures,4.7min |
| `node A/run-r11-runtime.cjs test md-r11-administration.spec.ts two-tab-concurrency.spec.ts auth-principals.spec.ts cross-feature-races.spec.ts --grep "R11\|MFA\|literal\|pending protected\|revoked\|guest and\|Location Manager\|Supervisor"` | PASS:11 real local browser/API/DB tests |
| `corepack pnpm --filter @valet/dashboard exec playwright test md-r11-privacy.spec.ts --reporter=json --output=A/r11-budget-json` with stdout `A/request-budget-report.json` | PASS:1; exact development counts |
| `corepack pnpm --filter @valet/dashboard exec next start -p 3004` with local verification API_ORIGIN, followed by `corepack pnpm --filter @valet/dashboard exec playwright test md-r11-privacy.spec.ts md-r11-presentation.spec.ts md-r11-commercial.spec.ts --reporter=json --output=A/r11-built-budget` with E2E_BASE_URL3004 and stdout `A/built-budget-report.json` | PASS:8; compiled local probe; temporary server stopped |
| `corepack pnpm lint` | PASS:11 tasks,10 cached |
| `corepack pnpm typecheck` | PASS:11 tasks,10 cached |
| `corepack pnpm architecture:check` | PASS:only pre-existing grandfathered warnings; none for R11 files |
| `corepack pnpm build` | PASS:10 tasks,9 cached; normal verification mode, Dashboard25 routes |
| `corepack pnpm exec prettier --check $changedCode` (all28 code/style/test paths in D/R) | PASS |
| `git diff --check` | PASS |

Focused backend command (unchanged owned harness; local `.env` read without
printing credentials):

```text
corepack pnpm --filter @valet/api exec node --env-file=C:/Users/LP/Desktop/valet-app/valet-platform/.env ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs test/management-settings.integration.test.ts test/management-settings-concurrency.integration.test.ts test/management-operating-hours.integration.test.ts test/management-notification-settings.integration.test.ts test/dashboard-configuration-api.integration.test.ts test/dashboard-configuration-resolution.integration.test.ts test/dashboard-configuration-mutation.integration.test.ts test/management-sla-settings.integration.test.ts test/management-branding.integration.test.ts test/management-branding-commercial.integration.test.ts test/management-integrations-status.test.ts test/management-commercial-http.integration.test.ts test/management-commercial-policy.test.ts test/management-commercial-field-boundary.test.ts test/staff-management-directory-pagination.integration.test.ts test/staff-mfa-enrollment.integration.test.ts test/staff-mfa-assurance.integration.test.ts test/staff-mfa-security.integration.test.ts test/staff-mfa-session-races.integration.test.ts test/staff-mfa-authority-races.integration.test.ts
```

PASS:96 tests/20 files: race lane71/14, compound4/1, standard10/2,
non-Postgres11/3; zero residual harness databases, roles and child processes.

Test-development failures were retained locally and resolved before final
verification: wrong Billing helper expected a Location in SUBSCRIPTION_READ;
wrong Branding tab label selected the previous page; Billing race initially
blocked scope authorization rather than the page read; visual Roles assertions
initially raced navigation. A repeat run with those premature visual assertions
was interrupted and replaced by the full40-test pass. No measured tolerance,
expected geometry, mature security assertion or test skip was relaxed. Earlier
unit/gate passes and smoke runs are not added to the final unique-test totals.
The Windows Bash preflight could not launch WSL; equivalent Git status/base/
branch checks were performed with PowerShell. No CI result is inferred.

## R. Formatted physical file sizes

All paths below are under `apps/dashboard/`; each is <=300. The untouched
management-foundation-app.tsx remains293 lines. No architecture baseline edited.

| Path | Lines |
| --- | ---: |
| e2e-runtime/md-r11-administration.spec.ts | 106 |
| e2e/administration-concurrency.spec.ts | 242 |
| e2e/administration-roles-cursor.spec.ts | 109 |
| e2e/md-r11-commercial.spec.ts | 118 |
| e2e/md-r11-presentation.spec.ts | 109 |
| e2e/md-r11-privacy.spec.ts | 42 |
| e2e/md-r11-read-races.spec.ts | 256 |
| e2e/md-r11-security.spec.ts | 89 |
| e2e/md-r11-visual.spec.ts | 152 |
| e2e/support/md-r11-fixtures.ts | 68 |
| src/components/foundation/help-copy.ts | 94 |
| src/components/foundation/help-foundation.module.css | 121 |
| src/components/foundation/help-foundation.tsx | 63 |
| src/components/security/account-security.module.css | 56 |
| src/components/security/account-security-panel.tsx | 295 |
| src/features/administration/administration-tabs.tsx | 58 |
| src/features/administration/reference-administration-page.tsx | 16 |
| src/features/administration/reference-administration.module.css | 75 |
| src/features/administration/branding/branding-page.tsx | 182 |
| src/features/administration/commercial/integrations-page.tsx | 199 |
| src/features/administration/commercial/subscription-page.tsx | 166 |
| src/features/administration/roles/roles-page.tsx | 265 |
| src/features/administration/settings/company-settings-panel.tsx | 105 |
| src/features/administration/settings/location-manager-settings-panel.tsx | 108 |
| src/features/administration/settings/management-location-settings-panel.tsx | 138 |
| src/features/administration/settings/operating-hours-editor.tsx | 155 |
| src/features/administration/settings/setting-row.tsx | 125 |
| src/features/administration/settings/settings-page.tsx | 223 |

## S. Backend / contracts / schema / dependencies

Backend changed? NO. Contracts changed? NO. Schema changed? NO.
Migration added? NO. Dependencies changed? NO. Production config changed? NO.
The runtime fixture runner is an untracked local verification helper using the
existing named development fixture, existing control/provision tools and local
test MFA configuration. It is not an application or deployment config change.

## T. Scope and self-review

R12 untouched; #230 untouched; #227 untouched. No PR or merge operation.
R01 scope/navigation, R05 staff, R06 Location, R09 commercial, R10 evidence,
storage/privacy and auth regressions passed. No shared shell/Employees/Locations
production source changed. Review base is4010f3e; target is this R11 branch.
Reviewed AGENTS, task/Accepted decisions, docs06/07/17, actual diff and gates
using the VAYLET code-review matrix.

No unresolved blocking/major finding in the reviewed R11 change. Security and
tenant/location: existing boundaries retained. Retry/concurrency/DB: no writer,
transaction, migration, audit or hook changes. Abstraction compatibility: local
presentation wrapper uses the existing page props; tabs receive existing state
setters. Audit/privacy: no persistence or event changes; scanned data is ephemeral.
Downstream contracts: unchanged. Architecture:28 authored files <=300. Test
adequacy: current local gates above, with stopped backend gaps explicitly listed.
Scope leakage: none identified. Repository merge remains gated on independent
review and actual CI; this task does not authorize self-merge.

## U. Git delivery

Branch: `fix/md-r11-administration-reference-parity`.
Commit message: `fix(dashboard): restore administration settings and help reference parity`.
Required parent/main: `4010f3edd34fa0cfe4a689be9cb9d81f25755808`.
Only this normal branch is to be pushed; no worktree, PR, merge or main push.
The final commit SHA and verified remote/clean status are supplied in the
delivery message after commit/push. The self-containing evidence file cannot
embed its own Git commit hash; reproduce it with `git log -1 --format=%H` on
this branch. This section does not claim a remote operation before it succeeds.

## V. Limitations / evidence levels

- Static/source proof: unchanged role/contract/CAS/MFA/revalidation boundaries,
  typed catalogs and no provider/support/billing fabrication; lint/typecheck/
  formatter/size checks passed.
- Fixture browser: current-contract synthetic values, six integration statuses,
  subscription null/status/entitlements, races, privacy and360 visual captures.
  These are not real provider or billing execution proof.
- Real local runtime:11 named-fixture tests used actual API/PostgreSQL and
  browser sessions; local enrollment/recovery and CAS were exercised. This
  does not certify production MFA storage, deployment or provider setup.
- Reference3011: English only despite Arabic control; narrow overflow defects;
  no exact Branding page; prototype-only settings/support/billing content.
- CI NOT RUN. No PR/main push was requested; local gates are not remote CI.
- Production NOT RUN. No deployment, production proof, #227 work or fabricated
  production environment. Backend/product gaps in B remain stopped, not filled
  with frontend fiction. Separate accepted follow-ups are required if needed.

## W. Verdict

MD-R11 PASS — READY FOR INDEPENDENT REVIEW
