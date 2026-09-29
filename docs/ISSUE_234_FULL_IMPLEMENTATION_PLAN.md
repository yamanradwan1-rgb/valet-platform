## 1. Repository Baseline

| Item | Verified result |
|---|---|
| Repository | `veletpro0-lgtm/valet-platform` |
| Issue | [#234 — Management Dashboard — Integrate Account Security into dashboard shell and redesign MFA workspace](https://github.com/veletpro0-lgtm/valet-platform/issues/234) |
| Issue status | **OPEN**; current body fetched and read |
| Current branch | `main` |
| HEAD | `6c37927c48bd7855031b6de8667bd8dd7d3c0e3d` |
| Freshly fetched `origin/main` | `6c37927c48bd7855031b6de8667bd8dd7d3c0e3d` |
| Merge base | `6c37927c48bd7855031b6de8667bd8dd7d3c0e3d` |
| HEAD equals `origin/main` | Yes |
| Working tree | Clean before and after inspection |
| Unrelated local modifications | None reported by Git |
| Changes made | None |

This was a **source inspection and planning pass**. I did not run application tests, start services, exercise a browser, or verify remote CI. Existing tests are identified below as coverage available for reuse, not as tests passed during this turn.

The comparison against the issue’s historical baseline, `0a63cfd`, found **no production changes in the inspected Security, MFA, shell, navigation, and foundation paths**. Seven foundation test files changed. The central issue assumptions remain current.

## 2. Executive Findings

| Concern | Current behavior | Remaining gap | Class | Risk |
|---|---|---|---|---|
| Shell integration | Security returns before `DashboardShell` | Integrate account workspace without business-scope dependency | C | Medium |
| Direct route | Works through standalone account entry with null selected scope | Define consistent shell presentation | C | Medium |
| Authority mismatch | Navigation admits CA/LM/SUP contexts; MFA services require eligible CA account | Align navigation, direct-route presentation, Help and tests | D | High |
| Multiple memberships | Any qualifying active ORG_ADMIN membership can establish eligibility | Do not gate account Security using selected membership alone | D | High |
| Initial checking/error | Initial null state and canceled-read handling are present | Add explicit retry and stronger failure-state handling | B | Medium |
| Failed reconciliation | Previous `mfaState` can survive a failed reread | Remove stale Verified presentation when current state becomes unknown | A | High |
| Sensitive freshness | Backend distinguishes Standard and Sensitive assurance | Dialog’s ASSURED branch offers Retry without TOTP, potentially producing a retry loop | A | High UX; server remains enforcing |
| Sensitive persistence | No persistent MFA cache identified in reviewed client/component paths | Extend browser proof to setup material, cookies and lifecycle cases | B | High |
| Mutation replay | Generic API client reconciles mutation 401 without replay | Cover all MFA mutation families and uncertain outcomes | B | High |
| Session fencing | API generations, keyed panel remount and unmount abort already exist | Security-specific delayed read/material tests | B | High |
| Accessibility | Basic labels, status/alert roles and bidi disclosure exist | Ceremony focus movement and LTR inputs are incomplete | C | Medium |
| File structure | Panel 295 lines; foundation app 293; shared fixture 300 | Split before adding behavior | C | Medium |
| Existing proof | Backend ceremony/race tests and real-runtime test sources exist | Do not rebuild mature coverage or claim it was rerun | B | Medium |
| Later-work closure | Inspected production paths unchanged since issue baseline | No evidence that later work closed shell/authority gaps | E | Low |
| Expanded MFA roles/factors | Not implemented or accepted by this task | Separate security decision and implementation | F | High |

**Recommendation:** retain existing account-level Company Admin eligibility and use a **scopeless Dashboard shell mode** for direct and refreshed Security entry.

## 3. Current `/security` Render Tree

Sources: [route entry](/D:/kndoom/valet-platform/apps/dashboard/src/app/security/page.tsx), [AccountSecurityRoute](/D:/kndoom/valet-platform/apps/dashboard/src/components/foundation/account-security-route.tsx), [ManagementFoundationApp](/D:/kndoom/valet-platform/apps/dashboard/src/components/foundation/management-foundation-app.tsx), [providers](/D:/kndoom/valet-platform/apps/dashboard/src/app/app-providers.tsx).

```text
RootLayout
└─ AppProviders
   └─ DashboardLocaleProvider
      └─ DashboardThemeProvider
         └─ StaffAuthProvider
            └─ SelectedScopeProvider
               └─ SecurityPage
                  └─ AccountSecurityRoute
                     └─ ManagementFoundationApp(accountSecurity=true)
```

After authentication:

```text
StandaloneFoundationPanel
└─ outer Panel
   └─ stack
      ├─ AccountSecurityPanel
      │  key = identityGeneration:sessionGeneration
      │  └─ inner Panel + status + current ceremony
      ├─ PreferenceControls
      ├─ Back to workspace
      └─ Sign out
```

| Entry scenario | Current result |
|---|---|
| A. Client navigation from active workspace | Selected scope can remain in the root provider, but Security ignores it for rendering and authority hooks |
| B. Fresh direct URL | Auth bootstrap, then login or standalone Security; selected scope starts null |
| C. Full refresh | Same as direct URL; business scope is not restored from storage |
| D. Logout while route remains mounted | Authentication boundary removes the panel; logout failure produces `logout-unconfirmed`, not retained Security |
| D. Session replacement | Changed generation key remounts the panel and discards its component state |

Both route revalidation and navigation authority receive `null` instead of selected scope when `accountSecurity` is true. The early return still exists.

## 4. Current Dashboard Shell Requirements

Sources: [shell props](/D:/kndoom/valet-platform/apps/dashboard/src/components/shell/shell-types.ts), [DashboardShell](/D:/kndoom/valet-platform/apps/dashboard/src/components/shell/dashboard-shell.tsx), [sidebar](/D:/kndoom/valet-platform/apps/dashboard/src/components/shell/sidebar.tsx), [topbar](/D:/kndoom/valet-platform/apps/dashboard/src/components/shell/topbar.tsx).

| Dependency | Actual requirement |
|---|---|
| Selected Organization | Nullable prop; sidebar omits Organization selector when null |
| Selected Location | Nullable prop; topbar renders Change scope when null |
| Navigation | Explicit item array supplied by caller |
| Organization/Location discovery | Not performed by shell components |
| Mobile navigation | Receives navigation items; no scope lookup |
| Sign-out | Injected `accountControl`; no scope requirement |
| Locale/theme | Injected controls; no scope requirement |
| Business route context | Supplied outside the shell by foundation composition |

The non-null requirement belongs to the **normal foundation/business route path**, not to `DashboardShell`.

Therefore, rendering account Security in the existing shell with null scope references is supported by current component capability. It requires deliberate composition and navigation handling, not fabricated scope or a broad shell redesign.

## 5. Current Security Navigation Contract

Sources: [registration](/D:/kndoom/valet-platform/apps/dashboard/src/lib/navigation/md01-navigation.ts), [registry](/D:/kndoom/valet-platform/apps/dashboard/src/lib/navigation/navigation-registry.ts), [navigation authority](/D:/kndoom/valet-platform/apps/dashboard/src/components/foundation/resolve-navigation-authority.ts).

| Field | Current value |
|---|---|
| ID | `security` |
| Href | `/security` |
| Placement | `UTILITY` |
| Access requirement | `FOUNDATION_ENTRY` |
| Scope requirement | `NONE` |
| Availability | `IMPLEMENTED` |
| Owner | `MD-01` |
| Roles | `COMPANY_ADMIN`, `LOCATION_MANAGER`, `SUPERVISOR` |
| Icon | `ShieldCheck` |
| Active matching | Exact destination or descendant path |

The sidebar separates MAIN and UTILITY items. `NavigationList` applies the normal active-link behavior.

**Important qualification:** `scopeRequirement: NONE` does not make current navigation resolution independent of business context. Candidate filtering still requires a navigation role, and `FOUNDATION_ENTRY` is resolved from selected-scope authority.

Consequently:

- Eligible CA/LM/SUP workspace contexts can show Security.
- Subscription-only and some special scope contexts do not receive foundation eligibility.
- Direct Security bypasses this navigation pipeline.
- Current nav visibility and direct-route backend eligibility are **not the same authority**.

## 6. Current MFA Backend Route Map

Sources: [controller](/D:/kndoom/valet-platform/apps/api/src/modules/auth/mfa/staff-mfa.controller.ts), [session repository](/D:/kndoom/valet-platform/apps/api/src/modules/auth/mfa/mfa-session-repository.ts), [contracts](/D:/kndoom/valet-platform/packages/contracts/src/staff-mfa.ts).

All paths below are under `/v1/staff/auth/mfa`.

| Endpoint | Controller → service | Target/eligibility | Persistence/result |
|---|---|---|---|
| `GET /state` | `state` → `MfaStateService.state` | Resolve exact session; lock/recheck active session/User; CA eligibility | Read current factor; assess exact-session assurance |
| `POST /enrollment/begin` | `beginEnrollment` → `MfaEnrollmentService.begin` | Session/User lock, user MFA advisory lock, CA eligibility | Return existing pending factor or insert one pending factor |
| `POST /enrollment/confirm` | `confirmEnrollment` → `MfaEnrollmentService.confirm` | Same authority; factor lookup constrained by authenticated User and supplied factor ID | Verify TOTP; activate factor; create ten code verifiers; establish assurance; audit |
| `POST /step-up` | `stepUp` → `MfaStepUpService.stepUp` | Same authority; current ACTIVE factor | Verify advancing TOTP step; update replay bound and exact-session assurance |
| `POST /recovery/begin` | `beginRecovery` → `MfaRecoveryService.beginSelfRecovery` | Same authority; current ACTIVE factor and current unused recovery verifier | Consume code; retire factor; insert pending replacement; append recovery events |
| `POST /recovery-codes/reissue` | `reissueRecoveryCodes` → `MfaRecoveryService.reissueRecoveryCodes` | Same authority; current ACTIVE factor and fresh acceptable TOTP | Insert new verifier set; advance generation; refresh assurance; audit |

`requireCompanyAdminEligibility` is used by **all six endpoint paths**, including both enrollment methods and both recovery methods.

All endpoints reject extra query parameters. POST schemas are strict. Responses receive `Cache-Control: no-store` and `Pragma: no-cache`.

Existing module wiring remains appropriate: [AuthModule](/D:/kndoom/valet-platform/apps/api/src/modules/auth/auth.module.ts) imports database, HTTP infrastructure and anti-abuse infrastructure, and applies request-ID middleware. No new backend module is needed.

Literal controller prefixes inspected:

- `v1/staff/auth`
- `v1/staff/auth/native`
- `v1/staff/auth/mfa`

## 7. Current Authority Matrix

The role columns below mean a User holding **only that role**, unless otherwise stated.

**P — common MFA prerequisite:** valid current Staff access credential; active User; unrevoked, unexpired exact session; at least one ACTIVE `ORG_ADMIN` membership in an ACTIVE Organization. No selected Location, Shift, Location grant or Dashboard entitlement is required.

| Capability | Company Admin | LM only | Supervisor only | Employee only | Guest |
|---|---|---|---|---|---|
| See Security workspace nav | Conditional on current foundation navigation eligibility | Conditional; misleading today | Conditional; misleading today | No Management nav | No |
| Direct `/security` UI | Authenticated panel | Panel mounts, MFA read denied | Panel mounts, MFA read denied | Panel can mount after Staff login, MFA read denied | Login; no Staff MFA access |
| GET MFA state | P | Denied | Denied | Denied | Denied |
| Begin enrollment | P; no ACTIVE current factor | Denied | Denied | Denied | Denied |
| Confirm enrollment | P; own PENDING factor; acceptable TOTP; limiter permits | Denied | Denied | Denied | Denied |
| TOTP step-up | P; ACTIVE factor; unused acceptable step; limiter permits | Denied | Denied | Denied | Denied |
| Begin recovery | P; ACTIVE factor; unused current-set code; limiter permits | Denied | Denied | Denied | Denied |
| Reissue codes | P; ACTIVE factor; acceptable unused TOTP; limiter permits | Denied | Denied | Denied | Denied |
| Receive raw recovery list | Successful confirm/reissue only | No | No | No | No |
| Sign out | Own Staff browser session | Same | Same | Same | No Staff session; logout transport is non-disclosing |
| Ordinary Management routes | Exact persisted target authority, capability, relevant entitlement and Standard MFA | Accepted exact grants/capabilities; CA MFA not imposed | Only accepted narrow capability/grant/Shift surfaces | No general Management entry | No |
| Separate CA-sensitive mutation | Above authority plus Sensitive freshness, target validation and command concurrency rules | No CA mutation authority | No | No | No |

Sign-out is not MFA-gated or selected-scope-gated. Web logout uses its existing cookie/Origin transport and non-disclosing response.

For mixed memberships, replace the “LM only/SUP only/Employee only” MFA denial with P when that same User has another qualifying active CA membership.

Client generation counters fence presentation. They are **not server authorization claims**.

## 8. CA vs LM/SUP Authority Mismatch Analysis

[DEC-078](/D:/kndoom/valet-platform/docs/decisions/DEC-078_COMPANY_ADMIN_MFA.md) accepts Company Admin TOTP and exact-session assurance. It does not establish general own-account MFA eligibility for every staff role.

Current implementation goes further in a specific, observable way: eligibility is “this User has a qualifying CA membership somewhere,” not “the currently selected membership is CA.”

| Account composition | Current MFA eligibility |
|---|---|
| One active CA membership in active Organization | Eligible |
| Multiple qualifying CA memberships | Eligible; one User factor, not one factor per membership |
| CA in A, LM in B | Eligible even while viewing B |
| CA in A, Supervisor in B | Eligible even while viewing B |
| Inactive CA membership plus active LM membership | Ineligible unless another qualifying CA membership exists |
| Active CA membership in inactive Organization | Ineligible unless another qualifying CA membership exists |
| Disabled User | Authentication/session recheck fails |

A simple change from the shared role list to `roles: ["COMPANY_ADMIN"]` **would be incomplete** if it continued filtering by the selected business role. It would hide account functionality from some Users who remain eligible on the server.

LM operational and accepted Management authentication does not automatically require CA MFA. Removing misleading MFA-management affordances from LM-only/SUP-only accounts therefore does not remove an accepted prerequisite of their ordinary workflows.

## 9. Authority Recommendation

**READY WITH RECOMMENDATION:** retain the current CA-account eligibility model.

The recommended product statement is:

> Account Security/MFA management is available to an authenticated active Staff User who currently has at least one active ORG_ADMIN membership in an active Organization. Eligibility is independent of the selected Management workspace.

Consequences:

- No backend eligibility expansion.
- No MFA requirements added to ordinary LM/SUP workflows.
- Mixed-role eligible accounts retain Security access.
- LM-only/SUP-only/Employee-only accounts receive a clear unavailable presentation on direct entry.
- Navigation and Help use account eligibility, not selected-scope role alone.
- Eligibility loss clears ceremony material when observed; subsequent commands remain server-authorized.

This is a conservative alignment with implemented behavior and the accepted CA MFA purpose. It should be recorded in the implementation documentation when this plan is accepted.

An expansion to LM/SUP is a separate security decision, not a visual implementation option.

## 10. Direct `/security` / No-Scope Options

| Dimension | A. Hybrid standalone fallback | B. Scopeless existing shell | C. Force workspace selection |
|---|---|---|---|
| Security correctness | Safe if account authority remains separate | Safe with explicit account composition | Introduces unnecessary business dependency |
| Scope semantics | Truthful | Truthful with nullable references | Conflicts with requested scope-free access |
| Visual consistency | Two experiences | One native Dashboard experience | Consistent only after unrelated selection |
| Direct/full refresh | Standalone | Normal chrome, no invented context | Blocks on discovery/selection |
| Navigation | Two navigation arrangements | Shared shell; account destination remains independent | Couples MFA entry to Management |
| Complexity | Lower initial change | Moderate, mostly composition | Unjustified |
| Broad shell risk | Low | Low: null support already exists | Higher foundation coupling |
| Discovery risk | None required | None required | Unnecessary discovery |
| Preserve `NONE` | Yes | Yes | Effectively undermined |
| Testability | Two rendering modes | One shell, scoped/scopeless cases | Tests would encode wrong semantics |
| File ownership | Route wrapper plus standalone controls | Account adapter, presentation context, ceremony split | No justified implementation |
| Recommendation | Viable fallback | **Choose B** | Reject |

Option C is not a recommended alternative; current source offers no reason to force business selection.

## 11. Recommended Direct-Route Architecture

Use the existing shell for authenticated Security:

```text
Staff authentication boundary
└─ Account Security route adapter
   └─ DashboardShell
      ├─ existing scope labels, when already selected
      ├─ existing permitted navigation presentation, when available
      ├─ account Security utility destination
      ├─ locale/theme/sign-out
      └─ Security workspace
         └─ account/session MFA state and ceremonies
```

With no selected scope:

- `selectedOrganization = null`
- `selectedLocation = null`
- No fabricated “All Locations” object.
- No business discovery.
- No fabricated business navigation.
- Topbar’s workspace-selection action explicitly navigates to existing workspace entry.
- Security remains usable without selecting anything.

To preserve navigation when arriving from a workspace without fetching business data merely for decoration, retain a **memory-only snapshot of already resolved navigation presentation**. Bind it to identity, session generation, selection revision and exact scope. Store destination IDs, not business response payloads.

This snapshot is presentation only. Clicking a destination still enters its existing route revalidation. A missing/mismatched snapshot produces account-only navigation.

## 12. Current MFA State Machine

Source: [MfaStateService](/D:/kndoom/valet-platform/apps/api/src/modules/auth/mfa/mfa-state.service.ts).

| Authoritative state | Action | Endpoint | Success | Failure |
|---|---|---|---|---|
| `ENROLLMENT_REQUIRED` | Begin setup | Enrollment begin | `ENROLLMENT_PENDING` plus provisioning | Existing state/error |
| `ENROLLMENT_PENDING` | Continue setup | Enrollment begin | Same pending factor/provisioning | Existing state/error |
| `ENROLLMENT_PENDING` | Confirm TOTP | Enrollment confirm | ACTIVE factor, assured session, one-time codes | Pending remains if transaction fails |
| `STEP_UP_REQUIRED` | Verify TOTP | Step-up | `ASSURED` | Verification/rate/auth error |
| ACTIVE factor, including step-up-required | Use recovery code | Recovery begin | Old factor retired; replacement `ENROLLMENT_PENDING` | Failed transaction does not consume successful recovery |
| ACTIVE factor | Reissue codes with TOTP | Reissue | New recovery generation; `ASSURED`; one-time codes | Old committed set remains if transaction rolls back |
| `ASSURED` | Assurance ages/inactivity/factor changes | Later state/authorization read | `STEP_UP_REQUIRED` or factor-derived state | No optimistic client authority |

The UI currently exposes recovery under `STEP_UP_REQUIRED` and reissue under `ASSURED`. Backend prerequisites are the actual authority.

Checking, unavailable, error and busy are **view states**, not additional MFA authorization states.

Closing setup clears local material and rereads state. It does not cancel or delete the pending server factor. Aborting transport does not prove server rollback.

## 13. Enrollment Ceremony Audit

Sources: [enrollment service](/D:/kndoom/valet-platform/apps/api/src/modules/auth/mfa/mfa-enrollment.service.ts), [panel](/D:/kndoom/valet-platform/apps/dashboard/src/components/security/account-security-panel.tsx), [ceremonies](/D:/kndoom/valet-platform/apps/dashboard/src/components/security/mfa-ceremonies.tsx).

Begin returns:

- `factorId`
- `provisioning.secretBase32`
- `issuer`
- `algorithm: "SHA1"`
- `digits: 6`
- `periodSeconds: 30`

**No otpauth URI or enrollment QR is returned or rendered today.** Do not add one implicitly under “preserve the current ceremony.”

The panel holds provisioning in React state. Confirmation sends `{factorId, code}` and replaces provisioning with ten raw recovery codes.

Repeated begin can retrieve the same pending factor material after fresh authorization. That server behavior is distinct from persisting the material in browser history/storage.

Authorization-before-mutation:

1. Resolve Staff session.
2. Lock/recheck session and active User.
3. Acquire existing per-User MFA serialization.
4. Prove CA eligibility.
5. Resolve/lock own current or specified factor.
6. Verify required factor state and TOTP.
7. Perform factor/code/session writes.
8. Append `MFA_TOTP_ACTIVATED` on confirmation.
9. Commit before returning disclosure.

Begin has no new audit event to invent. Retry of a pending begin rechecks authority before returning the secret.

## 14. Step-Up / Assurance Audit

Sources: [step-up service](/D:/kndoom/valet-platform/apps/api/src/modules/auth/mfa/mfa-step-up.service.ts), [assurance policy](/D:/kndoom/valet-platform/apps/api/src/modules/auth/mfa/mfa-assurance-policy.ts).

| Policy | Exact boundary |
|---|---|
| Maximum assurance | Expired at age `>= 8 hours` |
| Admin inactivity | Expired at idle `>= 30 minutes` |
| Sensitive freshness | Expired at age `> 5 minutes`; exactly five minutes is allowed |

Step-up accepts six numeric digits, verifies the current ACTIVE factor, enforces a strictly newer accepted TOTP step, then updates the exact session’s factor and assurance/activity timestamps.

State reads and token refresh do not renew these timestamps.

**Current UX defect:** [SensitiveMfaDialog](/D:/kndoom/valet-platform/apps/dashboard/src/features/administration/sensitive-mfa-dialog.tsx) renders TOTP only for `STEP_UP_REQUIRED`; an `ASSURED` response renders Retry. Ordinary state can remain ASSURED at minute six while a sensitive action correctly fails.

Required narrow repair:

- A dialog opened because a sensitive operation requested step-up must offer TOTP for both `STEP_UP_REQUIRED` and ordinary `ASSURED`.
- Successful verification does not automatically replay a protected mutation.
- Do not label a mere retry click “verification succeeded.”
- Preserve enrollment links for the two enrollment states.

Use Company Branding as the regression boundary. [ManagementBrandingService](/D:/kndoom/valet-platform/apps/api/src/modules/management/management-branding.service.ts) uses Standard assurance for reads and Sensitive assurance for writes.

## 15. Recovery Ceremony Audit

Source: [MfaRecoveryService](/D:/kndoom/valet-platform/apps/api/src/modules/auth/mfa/mfa-recovery.service.ts).

Current sequence:

1. Authenticate exact session.
2. Reserve recovery anti-abuse attempt.
3. Lock/recheck session/User; serialize User MFA.
4. Require CA eligibility.
5. Lock current ACTIVE factor.
6. Find current-generation, unconsumed recovery verifier.
7. Verify the submitted code against User/factor/generation.
8. Consume code, retire factor, create pending replacement.
9. Append `MFA_RECOVERY_CODE_USED` and `MFA_FACTOR_REENROLLMENT_STARTED`.
10. Commit and return replacement provisioning.

Recovery-code possession does **not** immediately assure the session. Replacement enrollment must be confirmed.

Old sessions referencing the retired factor lose usable assurance even if old timestamps remain.

No-code recovery remains the controlled VAYLET process. Do not add a peer-admin bypass or new recovery endpoint.

## 16. Recovery-Code Reissue / Disclosure Audit

Current reissue requires:

- Common P eligibility.
- Current ACTIVE factor.
- Acceptable, not previously accepted TOTP step.
- Anti-abuse admission.

It does not trust an old “Verified” label or require the UI to supply a freshness timestamp. It verifies current TOTP and establishes fresh assurance itself.

Within one transaction it:

- Generates ten new raw codes.
- Stores only selectors/verifiers.
- Advances `recovery_set_generation`.
- Advances TOTP replay state.
- Updates exact-session assurance.
- Appends `MFA_RECOVERY_CODES_REISSUED`.

Old codes become unusable through the generation change; this does not require deleting historical rows.

The response contains `{factorId, recoveryCodes}`. The panel stores only the raw list needed for disclosure and clears it on explicit completion.

After transport loss, raw codes cannot be fetched from persistent plaintext. Reconcile state and require a deliberate new reissue with a newly acceptable TOTP.

## 17. Sensitive Material Lifecycle

| Material | Source / current owner | Current clearing | Required strengthening |
|---|---|---|---|
| Setup secret | Enrollment/recovery response; panel `enrollment` state | Confirmation, close, uncertain reconciliation, unmount/remount | Clear immediately when current authority becomes unknown/denied |
| Provisioning fields / factor ID | Same response/state | Same lifecycle | Never place in navigation/provider snapshots |
| otpauth URI | Not present | Not applicable | Do not introduce |
| Enrollment QR | Not present | Not applicable | Do not introduce |
| TOTP | `TotpForm` local state; then request closure | Input clears before awaiting submit; unmount clears form | Explicit LTR; generation/request invalidation |
| Recovery input | `RecoveryForm` local state; then request closure | Clears before awaiting submit; unmount | Same |
| Raw recovery list | Confirm/reissue response; panel state | Done, uncertainty, unmount/remount | Delayed-result and browser history proof |
| Error UI | Translation key in panel | Next operation/close/remount | Never store raw response/error body in ceremony state |
| Pending async material | Promise/request internals | Becomes unreachable after settlement/teardown | Suppress publication; do not claim guaranteed memory zeroization |

Current explicit storage/logging sinks were not found in the reviewed MFA frontend paths. That is bounded source evidence, not proof about every deployed diagnostic system.

Sensitive state must remain owned by the route/ceremony lifetime. Shared eligibility/navigation providers may retain **only non-secret presentation facts**.

## 18. No-Replay / Auth-Reconciliation Audit

Sources: [DashboardMfaClient](/D:/kndoom/valet-platform/apps/dashboard/src/lib/mfa/dashboard-mfa-client.ts), [DashboardApiClient](/D:/kndoom/valet-platform/apps/dashboard/src/lib/api/dashboard-api-client.ts), [MFA error handling](/D:/kndoom/valet-platform/apps/dashboard/src/components/security/mfa-ui.ts).

| Outcome | Current behavior |
|---|---|
| Token stale before dispatch | Refresh before first send; this is not replay |
| GET 401 | At most one refresh and one GET replay when initiating generations remain current |
| Mutation 401 | Refresh/reconcile; throw `AUTH_RECONCILED_RETRY_REQUIRED`; do not resend mutation |
| Network failure | No automatic mutation retry; panel attempts state reconciliation |
| Malformed/unknown/5xx outcome | No automatic mutation retry; relevant errors trigger reconciliation |
| Session generation changed | API client rejects stale response; keyed panel remount clears material |
| Route unmount/abort | Transport abort plus mounted checks; server outcome may remain unknown |

Inputs are cleared before dispatch. Explicit retry therefore requires new input.

Two repair targets:

- A failed reconciliation must clear the previous authoritative-state presentation.
- A response-body read failure can escape the generic network classification because `response.text()` is outside the fetch catch. Test this failure; normalize it narrowly if it reproduces an unreconciled uncertain MFA outcome. Do not assume every body-read failure already follows the normal network path.

## 19. Session / Identity Generation Fencing Audit

Current defenses:

- `StaffAuthClient` advances session generation on session application.
- Identity generation changes on login/identity clearing.
- Logout clears identity before its network request settles.
- `DashboardApiClient` compares initiating generations before returning results.
- Foundation keys Security by both generations.
- Panel cleanup aborts and marks itself unmounted.
- Initial read handlers additionally inspect their own aborted signal.

| Requested scenario | Current source assessment | Required proof |
|---|---|---|
| GET pending → logout → old success | API generation rejection plus panel teardown | Deterministic delayed success and error |
| GET pending → replacement session | Same plus keyed remount | Both outcomes; replacement state remains authoritative |
| Enrollment begin pending → route exit | Unmount abort/mounted check | Ignore abort deliberately; secret must not appear on return |
| Reissue pending → logout | API fence plus teardown | Late raw-code response cannot repopulate DOM |
| User A → User B → A result | Identity/session fences present | Distinct sentinel material for A/B |

The panel’s mutation handlers rely mainly on `mounted`, rather than their own request ticket. During extraction, use the existing exported [ScopeGenerationGuard](/D:/kndoom/valet-platform/apps/dashboard/src/lib/scope/scope-generation.ts) or equivalent same-contract request tickets in addition to auth generations.

That is a defense and deterministic-proof improvement. The current source does not justify declaring cross-user material leakage already demonstrated.

## 20. Logout / Route-Exit / Back-Navigation Audit

Sources: [StaffAuthClient](/D:/kndoom/valet-platform/apps/dashboard/src/lib/auth/staff-auth-client.ts), [selected scope provider](/D:/kndoom/valet-platform/apps/dashboard/src/components/foundation/selected-scope-provider.tsx).

Logout immediately clears the in-memory session and advances identity/session boundaries. Failed server logout remains fail-closed through the existing logout-unconfirmed mechanism.

Current route exit normally unmounts the Security panel, discarding its state. However, source inspection alone does not prove every Next navigation/browser Back/BFCache sequence.

Required cases:

- Setup shown → leave → Back: no retained raw setup disclosure.
- Codes shown → leave → Back: no retained raw list.
- Logout during each ceremony → Back: login/fail-closed state.
- Failed logout → reload/Back: no restored material.
- Session rotation/replacement while disclosure is visible: old disclosure disappears.
- Returning to pending enrollment may offer **explicit** Continue, which performs a newly authorized request.

Do not persist disclosure state to improve navigation continuity.

## 21. Browser Storage Privacy Audit

Existing [persistent storage helper](/D:/kndoom/valet-platform/apps/dashboard/e2e/support/persistent-storage.ts) checks:

- localStorage values.
- sessionStorage values.
- IndexedDB stored values.
- CacheStorage response bodies.

`md-r11-security.spec.ts` already applies it to reissued recovery codes.

Coverage gaps:

- Setup secret.
- Recovery input and enrollment-confirmation disclosure.
- Cookies.
- Storage keys and IndexedDB keys.
- Cache request URLs.
- Logout, route exit, Back and session replacement.
- Unexpected diagnostic capture.

Keep existing locale/theme preferences and the logout-unconfirmed marker; their existence is not MFA-secret persistence.

## 22. Logging / Audit Privacy Audit

Sources: [operation runner](/D:/kndoom/valet-platform/apps/api/src/common/http/api-operation-runner.ts), [exception filter](/D:/kndoom/valet-platform/apps/api/src/common/http/api-exception.filter.ts), [account audit writer](/D:/kndoom/valet-platform/apps/api/src/modules/audit/account-security-audit-writer.ts).

Observed safeguards:

- MFA controller calls do not supply body-based measurement enrichment.
- Operation measurements contain operation/outcome/duration/request ID/error code.
- Routed unexpected-error logging records operation and request ID, not full exception/body.
- Account-security writer has no arbitrary metadata parameter.
- Account events are separate from tenant audit.
- Frontend panel translates known error categories rather than displaying raw MFA responses.

Required proof:

- Capture test logger/observer sinks with synthetic sentinels.
- Assert no seed, TOTP, recovery input/list, Authorization or Cookie material.
- Keep assertions from printing full sensitive bodies.
- Inspect reverse-proxy/APM configuration during runtime acceptance; repository logging review does not verify external infrastructure.

Existing Playwright configs retain traces on failure. **Real-MFA privacy runs must disable tracing/video/screenshots around secret ceremonies**, because traces can retain DOM/network material even when application storage is clean.

## 23. Current Security UI Inventory

| Responsibility | Current owner |
|---|---|
| Heading/status/error | `AccountSecurityPanel` |
| MFA state read | Same panel |
| Five mutation handlers/reconciliation | Same panel |
| Provisioning/raw-code state | Same panel |
| TOTP/recovery inputs | `mfa-ceremonies.tsx` |
| Setup display | `EnrollmentCeremony` |
| One-time codes / Done | `RecoveryCodesDisclosure` |
| Locale/theme | Standalone `PreferenceControls` |
| Back to workspace | Foundation account-security branch |
| Sign-out | Foundation account-security branch |

The initial read correctly starts with `mfaState = null` and Checking. On initial failure it does not invent ASSURED.

There is no explicit state-read Retry control. Failed later reconciliation can retain an older state. These should be addressed during extraction rather than carried into the new cards.

## 24. Dashboard Visual-System Reuse Plan

Sources: [shell CSS](/D:/kndoom/valet-platform/apps/dashboard/src/styles/shell.css), [global tokens](/D:/kndoom/valet-platform/apps/dashboard/src/app/globals.css), [administration presentation](/D:/kndoom/valet-platform/apps/dashboard/src/features/administration/administration-ui.tsx), [reference typography](/D:/kndoom/valet-platform/apps/dashboard/src/features/administration/reference-administration.module.css).

Preserve:

- Sidebar: 260px; collapsed 80px.
- Topbar: 64px.
- Desktop content padding: 32px.
- Content maximum width: 1600px.
- Existing narrow breakpoint: 820px.
- Narrow content padding: 20px.
- Page heading: 24px/32px.
- Existing surface, border, accent, error and focus tokens.
- Existing card geometry, button families and form treatment.

Reuse `Panel`, `Button`, `BidiText`, and `FocusDialog` where appropriate. Mirror established page-header geometry without introducing a dependency from shared foundation components into an unrelated feature’s business code.

**Any UI changed by #234 must be visually indistinguishable from the established Management Dashboard design system. If Security conflicts with that design, change Security—not the surrounding Dashboard.**


## 24A. ABSOLUTE UI VISUAL FREEZE — HIGHEST PRIORITY

This requirement is **binding and higher priority than any discretionary UI improvement** in Issue #234.

The implementation agent is **strictly forbidden** from changing the established Management Dashboard visual design language.

No #234 implementation may introduce a new or altered visual system, styling direction, component appearance, spacing system, typography hierarchy, card treatment, button style, input/select style, border/radius convention, shadow convention, color treatment, icon treatment, layout language, navigation geometry, modal/drawer language, or responsive behavior that departs from the current Management Dashboard.

The existing Management Dashboard UI is the visual source of truth.

Any new Security UI required by #234 must look **100% native to the existing Dashboard** and must be visually indistinguishable from components that already belong to the product.

Required implementation order for every new or changed UI element:

1. Reuse an existing Dashboard component if one already serves the purpose.
2. Otherwise reuse the exact existing Dashboard styling/tokens/pattern from the nearest equivalent component.
3. Only if neither is possible, create the smallest new component/style necessary, matching the existing Dashboard exactly.
4. Never modify the surrounding Dashboard visual system to accommodate a new Security component.

The agent must not:

- redesign the Security page beyond what is required to integrate it into the existing Dashboard;
- “modernize”, “clean up”, “improve”, or reinterpret unrelated Dashboard visuals;
- introduce Security-specific colors, gradients, radii, shadows, spacing, typography, buttons, cards, fields, status badges, dialogs, or navigation conventions;
- change shell/sidebar/topbar geometry unless a proven functional defect makes a minimal change unavoidable;
- change existing Dashboard-wide CSS/tokens for convenience;
- restyle unrelated pages;
- create a standalone Security-app appearance;
- use arbitrary CSS values where an existing Dashboard token/pattern exists.

The shell, sidebar, topbar, page header, cards, forms, actions, notices, status presentation, focus treatment, responsive stacking, Light/Dark behavior, EN/AR behavior, and RTL/LTR behavior must remain consistent with the current Management Dashboard.

For Security-specific flows such as MFA status, enrollment, step-up, recovery, recovery-code disclosure, and error/retry states, the agent must map each state onto the closest existing Dashboard visual pattern rather than inventing a new one.

If an implementation choice creates visual tension between Security and the Dashboard, **Security must change to match the Dashboard**. The Dashboard must never be changed to match Security.

This is a release-blocking acceptance criterion.

Before final delivery, the agent must perform an explicit UI-diff review and prove:

- no visual-language drift;
- no unrelated CSS changes;
- no new arbitrary colors;
- no new arbitrary spacing/radius/shadow conventions;
- no Dashboard-wide visual changes;
- Security page geometry matches existing Dashboard page geometry;
- new controls match existing Dashboard controls;
- new cards match existing Dashboard cards;
- new notices/errors/statuses match existing Dashboard feedback patterns;
- sidebar/topbar remain visually unchanged except for normal active-state behavior;
- EN/AR parity;
- RTL/LTR correctness;
- Light/Dark parity;
- desktop/narrow parity;
- keyboard/focus parity;
- no unintended overflow.

Any violation of this section means Issue #234 is **not complete**, even if functional tests pass.

## 25. Final Security Page Information Architecture

```text
Security
Manage authentication and account security.

Status card
  Checking / unavailable / authoritative four-state label
  Safe error + explicit state-read retry where appropriate

Authenticator card
  Required: begin setup
  Pending: explicit continue; setup material only after authorized response
  Step-up: TOTP verification + recovery entry
  Assured: truthful exact-session summary

Recovery codes card
  Assured: replace codes, requiring current TOTP
  Disclosure: ten codes + one-time warning + explicit Done
```

Rules:

- One page H1.
- One ceremony state owner.
- Only the currently applicable ceremony is interactive.
- Disclosure temporarily takes priority over ordinary recovery controls.
- No profile editor, session inventory, MFA toggle, download or automatic clipboard action.
- No in-content Language, Theme or Back to workspace controls.
- Sign-out stays in the shell.

## 26. Component / File-Split Plan

The following are **proposed files under the recommended architecture**, not existing files or accepted new backend contracts.

| Proposed owner | Responsibility |
|---|---|
| `components/security/use-account-security-ceremony.ts` | State reads, mutations, request tickets, ephemeral material, reconciliation |
| Existing `account-security-panel.tsx` | Compact composition adapter, preserving foundation consumers |
| `components/security/account-security-workspace.tsx` | Page header, status and card hierarchy |
| Existing `mfa-ceremonies.tsx` | Inputs/setup/disclosure; accessibility and LTR corrections |
| `components/foundation/account-security-shell.tsx` | Account route shell composition and no-scope actions |
| `components/foundation/dashboard-shell-presentation-provider.tsx` | Memory-only, generation/scope-bound navigation presentation |
| `components/security/account-security-access-provider.tsx` | Non-secret account eligibility and shared in-flight state-read coordination |
| `lib/navigation/account-security-navigation.ts` | Account destination presentation, separate from business-role filtering |

Reusable boundary: all foundation/nav/Help consumers use the same non-secret account eligibility result; all Security UI consumers use the same ceremony implementation. No consumer receives raw MFA material through shared providers.

## 27. 300-Line Compliance Plan

Measured current counts:

| File | Lines |
|---|---:|
| `management-foundation-app.tsx` | 293 |
| `account-security-panel.tsx` | 295 |
| `mfa-ceremonies.tsx` | 149 |
| `dashboard-api-fixture.ts` | 300 |
| `md-r11-security.spec.ts` | 89 |
| `mfa.spec.ts` | 113 |
| `md-r11-visual.spec.ts` | 152 |
| `dashboard-shell.tsx` | 70 |
| `sidebar.tsx` | 84 |
| `topbar.tsx` | 72 |
| `md01-navigation.ts` | 38 |
| `navigation-registry.ts` | 100 |
| `dictionaries.ts` | 190 |
| `sensitive-mfa-dialog.tsx` | 73 |

Extract the ceremony logic **before** adding new states/layout. Extract account-shell composition from the foundation branch before expansion.

Do not grow the shared 300-line fixture. Add focused Security fixture helpers.

Target new files at roughly 60–240 lines, leaving meaningful headroom. These are planning estimates; the architecture check enforces actual physical counts.

## 28. Navigation / Shell Integration Plan

1. Keep `/security`, UTILITY placement, localized label and `scopeRequirement: NONE`.
2. Separate account eligibility from business foundation eligibility.
3. Resolve eligible-account presentation through the existing MFA state endpoint, not Organization discovery.
4. Do not classify a User as ineligible merely because the selected workspace role is LM/SUP.
5. Hide the Security management destination for a confirmed ineligible account.
6. Keep direct-route unavailable UI accessible through the URL.
7. Preserve existing permitted business navigation presentation when entering from a workspace.
8. Do not unlock, disable or recompute all business capabilities based on `ASSURED`.
9. Use existing active-link and mobile navigation components.
10. Align the unconditional Security link in [HelpFoundation](/D:/kndoom/valet-platform/apps/dashboard/src/components/foundation/help-foundation.tsx) and its copy.

Unknown account eligibility is neither allowed nor a confirmed role denial. Business navigation must continue operating independently while that account probe settles or fails.

## 29. Direct-Route Implementation Plan

For authenticated direct/refreshed entry:

1. Mount existing shell with null business references.
2. Perform one coordinated MFA state read.
3. Show Checking while pending.
4. On success, show the server state and account Security destination.
5. On `MFA_ENROLLMENT_NOT_AVAILABLE` from **state read**, show a clear unavailable explanation; render no partial ceremony.
6. On network/5xx/malformed failure, show retryable unavailable state, not a role claim.
7. On definitive authentication loss, let the existing auth boundary remove the workspace.
8. Workspace-selection action navigates explicitly to `/`; no background discovery.

On a mutation, the same enrollment-unavailable error can represent a changed ceremony. Reconcile it before treating it as account ineligibility.

Full refresh must not restore selected Organization/Location from browser persistence.

## 30. Authority Alignment Plan

Under the recommendation:

- **CA eligible account:** show Security regardless of selected business membership.
- **LM-only/SUP-only/Employee-only:** no management affordance; direct URL shows unavailable after server denial.
- **Guest:** existing Staff login boundary.
- **Disabled User/session:** existing authentication failure boundary.
- **Inactive qualifying membership/Organization:** server denial unless another qualifying CA membership exists.
- **Entitlement lapse:** Security remains account-scoped; do not require Dashboard commercial access.

Use one shared, memory-only eligibility result per current identity/session generation. A successful state read proves current eligibility for presentation; it does not grant later command authority.

No polling or new account directory is needed. Direct entry and explicit refresh reread current state; every mutation keeps its existing server check.

## 31. Contract / API Change Decision

**No public MFA endpoint or schema change is required for the recommended implementation.**

Preserve all six routes and their exact request/response fields.

Frontend-only changes may distinguish account navigation from business navigation and coordinate safe state reads. Those are internal presentation boundaries, not new server authority.

Do not add:

- Organization/Location parameters.
- An `eligibleRoles` response.
- Client assurance timestamps.
- A `sensitive=true` state query.
- A secret replay/cache endpoint.

The sensitive dialog can request existing TOTP step-up without changing the state response.

## 32. Database / Migration Decision

For the recommended CA-preserving frontend path:

- No Prisma change.
- No migration.
- No new MFA table.
- No new assurance field.
- No session schema change.
- No recovery persistence change.
- No new indexes.

Existing integrity includes one live factor per User, factor ownership, monotonic replay/generation rules, recovery verifier uniqueness and exact-session factor binding.

Any demonstrated backend revocation race is a separately scoped security repair; this no-migration conclusion does not preselect that repair’s implementation.

## 33. DEC / Security-Decision Analysis

| Authority | Relevance |
|---|---|
| DEC-023 | Staff credentials, browser cookie transport, refresh/logout and no implicit role authority |
| DEC-024 | Durable anti-abuse |
| DEC-030 / structure rules | 300-line enforcement and extraction |
| DEC-072 | Shared opaque session boundary and Web/native separation |
| DEC-078 | Company Admin TOTP, recovery and assurance windows |
| DEC-079 | Account-security audit separated from tenant/Location audit |
| DEC-080 | Current persisted Management authority and independent capability enforcement |
| DEC-088 | Management entitlement boundary; no accidental coupling to unrelated account security |

Classification of critical propositions:

| Proposition | Classification |
|---|---|
| MFA must remain account/exact-session scoped | LOCKED |
| No invented business scope | LOCKED |
| No dispatched sensitive mutation replay | LOCKED |
| No persistent raw ceremony material | LOCKED |
| Current backend requires qualifying CA membership somewhere | DERIVED from current source |
| Existing shell supports null Organization/Location | DERIVED capability |
| Selected-role-only gating correctly models account eligibility | CONTRADICTED by mixed-membership execution path |
| LM/SUP general MFA expansion is already accepted | UNRESOLVED; not established by inspected decisions |
| Scopeless shell is the chosen implementation architecture | Recommendation for plan acceptance |

Eight bounded core conclusions were checked against their likely falsifiers: endpoint bodies, service eligibility, null shell handling, assurance constants, retry branches, persistence sinks, auth generations and initial error state.

The skill’s in-memory heuristic audit flagged a wording false positive around “absence/contradiction.” It was reviewed; no claim here uses mere symbol absence as proof of forbidden product behavior. That audit covered the decision core, not every sentence of this report.

## 34. Documentation Impact

After plan acceptance, update:

- [Dashboard integration plan](/D:/kndoom/valet-platform/docs/24_MANAGEMENT_DASHBOARD_INTEGRATION_PLAN.md): account eligibility, scopeless shell, direct-route budget and navigation separation.
- [Security rules](/D:/kndoom/valet-platform/docs/06_SECURITY_AND_DATA_RULES.md): clarify User-scoped factor versus exact-session assurance and the recovery-begin/confirmation distinction if needed.
- A focused #234 evidence record: chosen architecture, file ownership, test results and remaining runtime gaps.
- Help copy in both languages.

Do not rewrite historical R11/R12 evidence as though it proved the new implementation.

A new Accepted security DEC is required **if eligibility expands**. The recommended preservation/alignment does not itself require a new authentication model or schema decision.

## 35. Production File Change Plan

Existing paths below are relative labels linking to their absolute workspace locations. New filenames refer to the proposed owners in section 26.

| File | Responsibility → planned change | Security / authority / UI impact | Risk | Current → target |
|---|---|---|---|---|
| [management-foundation-app.tsx](/D:/kndoom/valet-platform/apps/dashboard/src/components/foundation/management-foundation-app.tsx) | Extract account branch; publish safe navigation presentation | Preserve auth gates; remove standalone duplication | High | 293 → 230–275 |
| [account-security-route.tsx](/D:/kndoom/valet-platform/apps/dashboard/src/components/foundation/account-security-route.tsx) | Route entry stays thin | Account route remains scope-free | Low | 7 → 7–30 |
| New `account-security-shell.tsx` | Shell adapter | Null scope, correct actions, account navigation | Medium | 0 → 100–180 |
| [app-providers.tsx](/D:/kndoom/valet-platform/apps/dashboard/src/app/app-providers.tsx) | Add safe presentation/access providers | Explicit generation lifetime | Medium | 20 → 25–40 |
| New presentation provider | Retain prior resolved destination IDs in memory | No authority grant or business payload persistence | Medium | 0 → 90–160 |
| New access provider | Coordinate non-secret eligibility/state reads | Mixed-membership correctness; no mutation caching | High | 0 → 120–220 |
| [account-security-panel.tsx](/D:/kndoom/valet-platform/apps/dashboard/src/components/security/account-security-panel.tsx) | Split state from rendering | Fix unknown/stale-status handling | High | 295 → 70–140 |
| New ceremony hook | Own ephemeral lifecycle | Ticket/generation fencing and no replay | High | 0 → 190–260 |
| New workspace component | Header/status/cards | Dashboard-native presentation | Medium | 0 → 120–200 |
| [mfa-ceremonies.tsx](/D:/kndoom/valet-platform/apps/dashboard/src/components/security/mfa-ceremonies.tsx) | Preserve forms; add LTR/focus behavior | No ceremony expansion | Medium | 149 → 180–240 |
| [account-security.module.css](/D:/kndoom/valet-platform/apps/dashboard/src/components/security/account-security.module.css) | Match native cards/header | Existing tokens only | Low | 56 → 80–140 |
| [md01-navigation.ts](/D:/kndoom/valet-platform/apps/dashboard/src/lib/navigation/md01-navigation.ts) | Separate Security account registration semantics | Remove misleading selected-role eligibility | Medium | 38 → 40–65 |
| [navigation types](/D:/kndoom/valet-platform/apps/dashboard/src/lib/navigation/navigation-types.ts) / [registry](/D:/kndoom/valet-platform/apps/dashboard/src/lib/navigation/navigation-registry.ts) | Explicit account versus business resolution | All other destinations preserve existing behavior | High | 44/100 → ≤90/150 |
| New account navigation resolver | Compose Security from confirmed account eligibility | No business-role invention | Medium | 0 → 50–100 |
| [dictionaries.ts](/D:/kndoom/valet-platform/apps/dashboard/src/lib/i18n/dictionaries.ts) | New heading, denial/retry/focus copy | EN/AR parity | Low | 190 → 220–260 |
| [HelpFoundation](/D:/kndoom/valet-platform/apps/dashboard/src/components/foundation/help-foundation.tsx) / [help copy](/D:/kndoom/valet-platform/apps/dashboard/src/components/foundation/help-copy.ts) | Align Security link/copy | No promise to ineligible accounts | Low | 63/94 → ≤85/110 |
| [SensitiveMfaDialog](/D:/kndoom/valet-platform/apps/dashboard/src/features/administration/sensitive-mfa-dialog.tsx) | TOTP available for sensitive challenge despite Standard ASSURED | Existing backend freshness remains authoritative | High | 73 → 90–130 |

Conditional only: a narrow `DashboardApiClient` body-read error repair if its focused failure test demonstrates the gap.

Not planned: backend services/controllers, contracts, database, shell geometry, unrelated pages or dependencies.

## 36. Existing Test Inventory

| Existing coverage | What it proves by test design | Limitation |
|---|---|---|
| `md-r11-security.spec.ts` | Four states, initial checking/error, reissue/disclosure/storage | No integrated shell or identity-switch material matrix |
| `mfa.spec.ts` | Enrollment, recovery, foundation step-up, confirm-401 no replay | Fixture-based; not every mutation/failure |
| `md-r11-visual.spec.ts` | EN/AR × Light/Dark × 1440/480; title/overflow/screenshots | Security uses direct `page.goto`, so does not prove retained selected scope |
| `dashboard-mfa-client.test.ts` | Routes and no client-owned secret fields | Not browser storage proof |
| `dashboard-api-client.test.ts` | GET retry, mutation no replay, generation boundary, refresh single-flight | Generic transport rather than complete Security UI lifecycle |
| `staff-auth-client.test.ts` | Immediate logout clearing, late refresh rejection, generations | Not raw disclosure teardown |
| `mfa-ui.test.ts` | Error/reconciliation classification | Does not test full panel state after failed reread |
| `administration-behavior.spec.ts` | Sensitive Branding explicit retry | Starts with STEP_UP_REQUIRED; misses ordinary ASSURED with stale sensitive freshness |
| `administration-r06-mfa-state.spec.ts` | Lifecycle reread after challenge | Repeated ASSURED denial currently expects Retry-only behavior |
| `staff-mfa-enrollment.integration.test.ts` | Enrollment, repeated begin, one-time codes, TOTP/recovery concurrency | Not exhaustive role matrix |
| `staff-mfa-security.integration.test.ts` | Anti-abuse, recovery unassured, protected storage/audit | Not browser storage |
| `staff-mfa-assurance.integration.test.ts` | Exact-session assurance and time boundaries | Not sensitive-dialog UX |
| `staff-mfa-session-races.integration.test.ts` | Refresh/logout/disable/expiry/factor replacement | Does not establish all membership/Organization revocation interleavings |
| `staff-mfa-authority-races.integration.test.ts` | Replay revocation, logout, factor recovery races | “Authority races” filename is not proof of every authority predicate |
| Runtime `auth-principals.spec.ts` | Real CA enrollment/recovery/refresh/logout test implementation | Not run this turn |
| Runtime `two-tab-concurrency.spec.ts` | Independent session assurance | Not a replacement-user delayed disclosure case |

The reviewed backend enrollment test uses an ineligible User for one denial case. It is not equivalent to explicit LM/SUP/Employee coverage across all six endpoints.

## 37. Missing Test Matrix

| Area | Required cases |
|---|---|
| Shell | Active Company and exact-Location workspace → Security; stable labels/chrome; active utility link |
| No scope | Fresh direct URL, refresh, no discovery, no fake scope, explicit workspace-entry action |
| Eligibility | CA; LM/SUP/Employee-only denial; mixed CA+LM/SUP; inactive CA; inactive Organization; disabled User |
| State | Initial checking, initial error, retry, stale ASSURED cleared after failed reconciliation |
| Ceremony | Setup/confirm/recovery/reissue/disclosure through extracted owner |
| Lifecycle | Route exit/Back, logout/failure, session rotation, User A→B with delayed success/error/material |
| Transport | Every mutation 401; 5xx; network disconnect; malformed response; response-body failure; abort |
| Independent freshness | Standard ASSURED at six minutes; sensitive Branding denied; TOTP challenge; explicit resubmit |
| Privacy | All material against all storage surfaces; logger/observer capture; no retained real-secret traces |
| Accessibility | Exact focus transitions, keyboard, mobile dialog, EN/AR, LTR codes, no overflow |

Mutation retry/concurrency expectations:

| Mutation | First execution / identical retry | Concurrent identical / conflicting execution | Retry after success / unknown outcome |
|---|---|---|---|
| Begin enrollment | Create or return authorized pending factor | Existing User serialization and one-live-factor constraint | Pending retry can return current setup; ACTIVE factor blocks new begin |
| Confirm | Activate pending own factor once | One activation; later attempt must re-evaluate state | No replayed recovery disclosure; reconcile and deliberately reissue if needed |
| Step-up | Accept advancing TOTP step | Same step succeeds at most once | Reused step rejected; fresh explicit input required |
| Recovery begin | Consume valid code and create replacement | Single-use/current-factor serialization | Old code/factor no longer usable; reconcile pending state |
| Reissue | Advance code-set generation | Same TOTP cannot create two valid identical-step successes; differing accepted steps serialize | Previous raw response not replayable; deliberate new TOTP/reissue |
| Logout | Clear local identity immediately; revoke via existing transport | Existing session invalidation remains authoritative | Failed/unknown logout stays fail-closed until confirmed |

For all transactional races: competitor **commit**, **rollback**, and caller **unknown outcome** must be distinguished. Database integrity does not imply successful response replay.

## 38. Exact Focused Test File Plan

Extend existing:

- [md-r11-security.spec.ts](/D:/kndoom/valet-platform/apps/dashboard/e2e/md-r11-security.spec.ts)
- [mfa.spec.ts](/D:/kndoom/valet-platform/apps/dashboard/e2e/mfa.spec.ts)
- [md-r11-visual.spec.ts](/D:/kndoom/valet-platform/apps/dashboard/e2e/md-r11-visual.spec.ts)
- [administration-behavior.spec.ts](/D:/kndoom/valet-platform/apps/dashboard/e2e/administration-behavior.spec.ts)
- [administration-r06-mfa-state.spec.ts](/D:/kndoom/valet-platform/apps/dashboard/e2e/administration-r06-mfa-state.spec.ts)
- Existing navigation registry/access tests.

Proposed new focused files:

| File under repository root | Ownership |
|---|---|
| `apps/dashboard/e2e/issue234-security-shell.spec.ts` | Integrated/direct shell, active nav, request scope |
| `apps/dashboard/e2e/issue234-security-authority.spec.ts` | Role/mixed-membership presentation |
| `apps/dashboard/e2e/issue234-security-lifecycle.spec.ts` | Delayed reads/material, logout, replacement, Back |
| `apps/dashboard/e2e/issue234-security-privacy.spec.ts` | Setup/disclosure storage and request budget |
| `apps/dashboard/e2e/issue234-security-accessibility.spec.ts` | Focus, keyboard, RTL inputs |
| `apps/dashboard/e2e/support/issue234-security-fixture.ts` | Focused delays/errors/material fixtures |
| `apps/dashboard/src/components/security/account-security-lifecycle.test.ts` | Deterministic transition/ticket/unknown-state logic |
| `apps/dashboard/src/lib/navigation/account-security-navigation.test.ts` | Account eligibility independent of selected role |
| `apps/api/test/staff-mfa-eligibility.integration.test.ts` | Missing real role/multi-membership denial matrix; no backend changes |
| `apps/dashboard/e2e-runtime/issue234-security.spec.ts` | Real direct entry, lifecycle and independent sensitive freshness |

Each stays below 300 lines. Split by failure family if lifecycle/transport coverage approaches the limit.

## 39. Visual / Accessibility Proof Plan

Use 1440×900 and 480×900, each in:

- English Light.
- English Dark.
- Arabic Light.
- Arabic Dark.

Cover scoped and scopeless Security, all four states, checking/error and safe fixture disclosure.

Exact focus behavior:

| Event | Target |
|---|---|
| Route entry | Security H1 using existing page-navigation expectations |
| Open setup | Setup heading, then normal Tab order to input |
| Invalid TOTP | Input with associated error description |
| Successful confirmation | Recovery disclosure heading |
| Open recovery | Recovery input |
| Invalid recovery code | Recovery input/error |
| Reissue disclosure | Disclosure heading |
| Done | Recovery management heading/control, or next foundation destination |
| State retry completion | Status region; avoid stealing focus during passive announcements |
| Mobile menu close | Existing opener restoration through `FocusDialog` |

Use `dir="ltr"` for TOTP and recovery inputs and existing `BidiText` for raw codes. Translate labels, never code characters.

This turn inspected current CSS and test definitions; it did not produce new viewport screenshots.

## 40. Browser Privacy Proof Plan

Use distinct synthetic sentinels for:

- Setup secret.
- Recovery input.
- Confirmed recovery list.
- Reissued recovery list.

Inspect while visible, after dismissal, after navigation, after logout and after replacement:

1. localStorage keys and values.
2. sessionStorage keys and values.
3. IndexedDB keys and stored values.
4. CacheStorage request URLs and response bodies.
5. Browser-context cookies.
6. DOM after teardown.
7. Captured console/error/telemetry test sinks.

Real-runtime tests must use disposable credentials and avoid retained screenshots, traces or response dumps containing real generated material.

Storage-negative tests do not claim protection against a user intentionally copying a displayed secret or against arbitrary browser extensions.

## 41. Request-Budget / Performance Plan

Recommended budgets:

| Scenario | Expected budget |
|---|---|
| Authenticated direct Security with fresh token | One logical MFA state read; zero Management discovery/data requests |
| Cold reload with valid refresh cookie | One bootstrap refresh plus one state read |
| State GET 401 | At most one refresh plus one GET replay |
| Explicit ceremony | One POST; no automatic POST replay |
| Uncertain mutation | One reconciliation state-read cycle |
| Mutation 401 | At most one shared refresh; no repeat POST |
| Locale/theme changes | No MFA request |
| Security idle | No polling |
| Enter from active workspace | One Security state cycle; reuse already resolved navigation presentation |

Account eligibility consumers share an in-flight state read. Do not have the route, sidebar and panel each issue their own initial GET.

Navigation presentation snapshots contain no secrets and no broad business data. Locale changes resolve labels from destination IDs without refetching.

Test development Strict Mode cancellation separately from completed production request counts; canceled effect attempts must not create an unbounded loop.

## 42. Validation Ladder With Exact Current Commands

These are **future implementation commands**, not commands run during this audit.

Run from `D:\kndoom\valet-platform`.

First, structure and focused existing frontend units:

```powershell
pnpm architecture:check

pnpm --filter @valet/dashboard exec vitest run `
  src/lib/mfa/dashboard-mfa-client.test.ts `
  src/lib/api/dashboard-api-client.test.ts `
  src/lib/auth/staff-auth-client.test.ts `
  src/components/security/mfa-ui.test.ts `
  src/lib/navigation/navigation-registry.test.ts
```

Add the proposed unit files once created.

Then focused fixture browser coverage:

```powershell
pnpm --filter @valet/dashboard test:e2e `
  e2e/md-r11-security.spec.ts `
  e2e/mfa.spec.ts `
  e2e/issue234-security-shell.spec.ts `
  e2e/issue234-security-authority.spec.ts `
  e2e/issue234-security-lifecycle.spec.ts `
  e2e/issue234-security-privacy.spec.ts `
  e2e/issue234-security-accessibility.spec.ts
```

Independent freshness and visual regression:

```powershell
pnpm --filter @valet/dashboard test:e2e `
  e2e/administration-behavior.spec.ts `
  e2e/administration-r06-mfa-state.spec.ts `
  e2e/md-r11-visual.spec.ts

pnpm --filter @valet/dashboard lint
pnpm --filter @valet/dashboard typecheck
```

Use the repository-owned test runner for focused backend evidence:

```powershell
pnpm --filter @valet/api exec node `
  ../../scripts/test-harness/run-owned-tests.mjs `
  api vitest.config.mjs `
  test/mfa-assurance-policy.test.ts `
  test/staff-mfa-enrollment.integration.test.ts `
  test/staff-mfa-assurance.integration.test.ts `
  test/staff-mfa-security.integration.test.ts `
  test/staff-mfa-session-races.integration.test.ts `
  test/staff-mfa-authority-races.integration.test.ts
```

Add the new eligibility test after creation. This runner selects the owning PostgreSQL lanes; do not bypass their capacity controls.

For a prepared **disposable real runtime**, with MFA bypass explicitly off:

```powershell
pnpm --filter @valet/dashboard test:e2e:runtime `
  e2e-runtime/issue234-security.spec.ts `
  --trace=off
```

Runtime prerequisites are material: correct disposable DB, actual versioned migrations, matched API/test MFA keys, valid browser auth transport and no destructive fixture reset against shared data.

Finally, the repository’s PR-readiness gates remain:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Do not run these broad suites merely for planning. Local passes do not substitute for observed remote CI.

## 43. Security Risk Analysis

| Risk | Existing protection | Remaining action |
|---|---|---|
| Selected scope becomes MFA authority | Strict account endpoints | Assert no Organization/Location in URLs/bodies |
| Mixed-membership account falsely denied | Backend checks any eligible CA membership | Account-level navigation eligibility |
| Stale secret publishes after identity change | API generations and keyed remount | Deterministic Security-specific delayed-response tests |
| Stale Verified after read failure | Initial null state only | Clear authority-bearing view state on failed reread |
| Unknown mutation replay | API does not replay writes | All-method failure matrix and body-read failure test |
| Sensitive action blocked in retry loop | Server freshness still enforced | Narrow dialog TOTP repair |
| Secret captured by test artifacts | Application storage is separate | Disable real-secret traces/screenshots |
| Eligibility revocation during MFA write | Session/User/factor locks exist | Do not claim plain membership SELECT closes every check-use race |

The final row needs precision:

- **Transaction A:** MFA command locks session/User, reads CA eligibility, then locks/uses factor.
- **Transaction B:** role/membership/Organization authority changes.
- **Resources:** membership/Organization predicate versus session/User/factor locks.
- **Unsafe candidate interval:** B changes the qualifying predicate after A’s read but before A’s protected write.
- **Existing protection:** some staff-role changes lock admin factors; this is not a blanket proof covering every predicate and ordering.
- **Missing evidence:** an exhaustive real interleaving test and accepted winner/loser interpretation.
- **Commit/rollback:** B commit can invalidate eligibility; B rollback does not; caller disconnect still leaves outcome unknown.
- **Classification:** unresolved backend race evidence, not a demonstrated exploit from this pass.
- **Owner:** focused backend security follow-up if reproduced. Do not silently add locks or change authorization in #234.

All subsequent standalone MFA requests recheck eligibility. That does not establish stronger commit-time revocation semantics for every concurrent case.

## 44. Rollback / Failure-Safe Considerations

The recommended implementation changes frontend composition and presentation only.

- Preserve existing MFA endpoints and persistence throughout.
- Keep compact `AccountSecurityPanel` usable by foundation enrollment/step-up consumers.
- A presentation-provider failure must fall back to account-only chrome, not guessed navigation/scope.
- A state read failure must show unavailable, not prior Verified.
- Eligibility failure must remove ceremonies/material.
- Unknown mutation outcomes require reconciliation and deliberate action.
- Rolling back the frontend must not undo committed enrollment/recovery state.
- No migration rollback or secret-format conversion is involved.

Do not use persistent storage as a fallback for provider or route-lifetime problems.

## 45. Implementation Order

1. Accept the authority recommendation and scopeless-shell architecture.
2. Update task documentation with account-versus-selected-scope semantics.
3. Add focused regression tests for stale Verified, direct scope-free entry and sensitive ASSURED challenge.
4. Extract ceremony state while preserving existing consumers and endpoints.
5. Add request-ticket fencing and truthful reread/error/retry handling.
6. Add shared non-secret account eligibility coordination.
7. Add memory-only navigation presentation retention.
8. Integrate Security into the existing shell for scoped and scopeless entry.
9. Align navigation, foundation links, Help and bilingual copy.
10. Apply native card/header composition and focus/LTR corrections.
11. Fix the sensitive-dialog freshness UX within its existing contract.
12. Run focused units, fixture browser tests and real eligibility/freshness tests.
13. Complete visual/privacy/manual runtime proof.
14. Run required final gates and obtain independent review/CI.

No step changes backend eligibility. Any newly demonstrated backend defect is reported and scoped before repair.

## 46. Exact #234 Acceptance Mapping

The current issue contains **49 checkboxes across seven acceptance groups**. The mapping below covers every group and checkbox range.

| Issue acceptance group | Count | Current coverage | Planned closure |
|---|---:|---|---|
| Shell integration | 7 | Account-scoped requests implemented; integrated chrome/active nav/mobile continuity missing | Sections 11, 28–29, 38–41 |
| MFA states and ceremonies | 12 | Existing state/ceremony tests substantial; retry/reconciliation failure gap | Sections 12–18, 23, 37–38 |
| Authorization/security | 9 | Server authority/no replay implemented; targeted lifecycle/privacy/freshness proof incomplete | Sections 7–9, 14, 17–22, 37, 40, 43 |
| Page presentation | 9 | Existing standalone typography/theme/locale tests; integrated design/focus missing | Sections 24–27, 39 |
| Preferences/remnants | 4 | Standalone duplicates currently present | Sections 25, 28–29 |
| Direct route/no scope | 4 | Current standalone route is scope-free; selected new presentation unimplemented | Sections 10–11, 29, 41 |
| Authority mismatch | 4 | Unresolved in current UI; backend unchanged | Sections 8–9, 30, 33–34 |

Coverage classifications:

- **Already implemented, retain:** account request scope; four MFA states; core ceremonies; one-time code dismissal; no automatic mutation replay; independent backend guards.
- **Partially covered:** lifecycle clearing, browser storage, real MFA runtime, visual variants.
- **Missing:** integrated shell; active Security in that shell; comprehensive direct-route budget; mixed-membership navigation; delayed sensitive-response replacement cases.
- **Obsolete expectation to change:** Sensitive dialog’s Retry-only ASSURED branch.
- **Conditional acceptance item:** expanded-role DEC applies only if expansion is selected; the recommendation does not select it.

## 47. Blockers / Owner Decisions

There is no need to invent a new MFA model, endpoint or selected-scope requirement.

One precise decision remains for plan acceptance:

> **Should Account Security retain the current eligibility rule—an active Staff User with at least one active ORG_ADMIN membership in an active Organization, independent of the selected workspace—with LM-only/SUP-only accounts excluded, and any broader own-account MFA support deferred to a separately accepted security design?**

**Recommended answer: yes.**

The scopeless shell is the recommended implementation architecture, not an unresolved choice for the implementation agent.

The sensitive-dialog repair is a concrete frontend dependency of the requested five-minute-freshness acceptance proof. The possible backend revocation interleaving remains a separately identified evidence gap; this report does not claim it is fixed or proven safe.

No implementation should begin until this planning result is reviewed and accepted, as explicitly required by the request and #234.

## 48. Final Readiness Classification

**READY WITH RECOMMENDATION**

The current source supports a concrete frontend implementation: **existing Dashboard shell with truthful null scope, current CA-account eligibility, unchanged MFA contracts, explicit sensitive-material ownership, and independent server freshness enforcement**.

The recommendation needs acceptance; implementation and runtime proof remain future work. No source, tests, documentation, branches, worktrees or GitHub issue content were changed.