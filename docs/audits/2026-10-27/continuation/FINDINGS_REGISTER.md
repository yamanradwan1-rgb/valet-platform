# Findings register

Original ten findings remain in the [original complete report](../VAYLET_AUDIT_2026-10-27.md), with original confidence/risk assessments. No GitHub issue was changed or created.

| Original finding | Existing issue |
|---|---|
|OPS-001|#352|
|DB-01|#353|
|DASH-01|#354|
|VAL-002|#355|
|CUST-001|#356|
|INT-001|#357|
|NATIVE-WEB-01|#358|
|DASH-02|#359|
|CUST-002|#360|
|TEST-001|#361|

## SEC-011 — recovery replacement MFA seed disclosed to a second password-only session

1. **ID:** SEC-011 (worker candidate alias SEC-C001-H01).
2. **Title:** Any live same-user management session can capture the recovery-created replacement TOTP factor.
3. **Severity:** P1. A password-only foothold can cross the intended second-factor boundary during a legitimate recovery window.
4. **Confidence:** HIGH; exact source path and synthetic execution of actual services/repositories/cryptography. Full PostgreSQL/HTTP runtime reproduction remains unverified.
5. **Feature:** Management account MFA recovery, enrollment and exact-session assurance.
6. **Source:** frozen `66968655b8bd90c6681daf53fb9d8da9b9ab9f79`: [enrollment.begin lines 60–77](https://github.com/yamanradwan1-rgb/valet-platform/blob/66968655b8bd90c6681daf53fb9d8da9b9ab9f79/apps/api/src/modules/auth/mfa/mfa-enrollment.service.ts#L60); [confirm lines 98–166](https://github.com/yamanradwan1-rgb/valet-platform/blob/66968655b8bd90c6681daf53fb9d8da9b9ab9f79/apps/api/src/modules/auth/mfa/mfa-enrollment.service.ts#L98); [recovery lines 96–138](https://github.com/yamanradwan1-rgb/valet-platform/blob/66968655b8bd90c6681daf53fb9d8da9b9ab9f79/apps/api/src/modules/auth/mfa/mfa-recovery.service.ts#L96); [factor repository lines 16–67](https://github.com/yamanradwan1-rgb/valet-platform/blob/66968655b8bd90c6681daf53fb9d8da9b9ab9f79/apps/api/src/modules/auth/mfa/mfa-factor-repository.ts#L16); [session checks lines 17–62](https://github.com/yamanradwan1-rgb/valet-platform/blob/66968655b8bd90c6681daf53fb9d8da9b9ab9f79/apps/api/src/modules/auth/mfa/mfa-session-repository.ts#L17); [HTTP begin/confirm lines 79–124](https://github.com/yamanradwan1-rgb/valet-platform/blob/66968655b8bd90c6681daf53fb9d8da9b9ab9f79/apps/api/src/modules/auth/mfa/staff-mfa.controller.ts#L79).
7. **Expected:** Replacement provisioning material created after recovery proof remains restricted to the authorized recovery ceremony; an unrelated password-only session cannot acquire the new second factor.
8. **Actual:** Generic enrollment.begin re-discloses any current PENDING user's seed. Recovery retires ACTIVE and inserts an ordinary PENDING factor. Another live session of that user can fetch it, calculate a valid TOTP, confirm, receive new recovery codes and establish assurance on itself.
9. **Root cause:** Factor persistence binds only user/factor, not the recovery session or ceremony capability. Generic initial-enrollment retry and recovery-pending states share disclosure/confirmation authorization.
10. **Execution path:** Victim enrolled with active factor; attacker has another unassured live session. Victim POST recovery/begin with valid one-use recovery code; transaction commits replacement pending factor. Attacker POST enrollment/begin with its bearer and empty JSON; server returns replacement ID/seed. Attacker computes current TOTP and POST enrollment/confirm; factor activates and attacker's exact session becomes assured. Synthetic model in evidence reproduces all steps without a network/database.
11. **Preconditions:** Same-user valid password-authenticated session or equivalent live bearer; active eligible ORG_ADMIN/LOCATION_MANAGER membership and organization; legitimate recovery starts; attacker accesses pending interval before another confirmation. Does not require recovery code, old authenticator, server key, SQL access, cross-tenant identity or production probing.
12. **Impact:** Second-factor compromise; attacker can satisfy MFA on its own session and may retain the shared replacement authenticator for subsequent step-up. Any sensitive management action still needs its normal role/tenant authorization. No claim of arbitrary-role escalation.
13. **Affected roles/environments:** Eligible management accounts with MFA enabled and recovery executed. Ordinary deployment path; local development bypass is unrelated. Compromised employee-only or different-user sessions do not meet this path.
14. **Existing tests:** staff-mfa-enrollment.integration.test.ts:61 repeated begin converges within same session; staff-mfa-assurance.integration.test.ts:63 keeps assurance session-bound; staff-mfa-security.integration.test.ts:149 verifies recovery remains pending/unassured. Inspected relevant cases; no observed assertion forbids a second same-user session from obtaining a recovery pending seed. Existing suite was not rerun.
15. **Missing validation:** Disposable PostgreSQL + real HTTP two-session regression, runtime role privileges and transaction behavior, initial enrollment versus recovery policy approval, UI-visible recovery race and revocation during ceremony. Model uses SQL/Nest/audit/limiter adapters and cannot prove those boundaries.
16. **Proposed remediation:** Define and persist recovery ceremony/session binding or dedicated proof capability; require it for both replacement disclosure and confirmation. Preserve safe initial-enrollment retry separately; consider revoking other sessions per approved recovery policy. No patch implemented.
17. **Regression risks:** Cross-device onboarding, interrupted recovery resume, browser refresh, code one-use accounting, lost-response recovery and old-factor revocation must retain approved behavior.
18. **Related issue:** No new issue. #362 tracks continuation; existing #352–361 findings are distinct and unchanged.
19. **Independent challenge:** Security worker discovered hypothesis; coordinator independently read routes, runner, auth wiring, password login/session checks, factor schema/trigger and service branches. ACTIVE factor blocks seed read; different user gets own factor; user/advisory locks serialize but do not authorize recovering session; at-rest encryption decrypts after the insufficient gate; session-bound assurance does not prevent attacker from obtaining a newly disclosed TOTP. Both controls passed in the synthetic model. Shared initial enrollment may be intentional, but it does not justify lifting established MFA recovery proof to every password-only session. A policy permitting that would need explicit security acceptance; none established here.
20. **Final disposition:** **HIGH-CONFIDENCE / RUNTIME UNVERIFIED**. Model-confirmed control flow; not a confirmed live exploit. Reported immediately to owner during execution. Requires independent engineering/runtime review before remediation.

## DASH-AUTH-01 — failed sign-out continuity marker lost across reload with denied browser storage

- **Priority/confidence:** P2; HIGH_SOURCE_CONFIDENCE / RUNTIME_UNVERIFIED; new in C003. No controlled browser exploit or server authentication bypass claimed.
- **Affected workflow:** Management Dashboard sign-out, restricted localStorage, and bootstrap cookie refresh on the same browser/device.
- **Expected:** A sign-out with unconfirmed authoritative server completion remains blocked across reload until server/session status is explicitly reconciled.
- **Actual source chain:** staff-auth-client.ts lines 141–148 sets logout-unconfirmed and clears local identity before POST. Lines 265–271 save the durable marker only to localStorage; denied writes are swallowed. A fresh instance begins with false memory, and hasUnconfirmedLogout lines 80–89 returns false when storage read throws. staff-auth-context.tsx lines 81–93 then automatically refreshes. If server logout never completed, credentials=include sends the still-valid HttpOnly refresh cookie and auth can be restored.
- **Conditions:** localStorage read/write denied while cookies remain functional; logout network failure before server revocation; fresh Dashboard client mounted. Not a cross-user or cross-tenant claim.
- **Impact:** A user who tried to sign out may unexpectedly regain protected management access after reload. Shared-device and cookie-lifetime conditions affect severity.
- **Root cause:** Same-instance memory fail-closed fallback lacks a durable or server-derived barrier when client storage is unavailable.
- **Existing controls/counterevidence:** Successful server logout revokes/clears cookie; normal writable localStorage retains the marker; same-instance memory blocks access. These narrow but do not close the combined failure case.
- **Tests:** staff-auth-client.test.ts lines 128–148 checks failed logout across reload with functioning storage only. No denied-storage failed-logout case was executed in C003.
- **Recommendation:** Owner-approved durable fail-closed logout uncertainty or server-session-based logout reconciliation for storage-denied browsers. Preserve explicit successful login, cookie refresh and transient failure semantics.
- **Regression risks:** storage policy/quota exceptions, cross-tab behavior, failed/successful logout, network loss, explicit re-login and refresh cookie controls.
- **Duplicate/owner decision:** Distinct from CUST-001 restricted-storage preferences and existing SEC-011 MFA recovery. No GitHub issue created; broader duplicate search and policy acceptance pending.
- **Evidence:** [structured C003 record](evidence/C003-DASH-AUTH-01.json).

## DASH-I18N-01 — restricted browser storage splits Dashboard Arabic locale and DOM direction

- **Priority/confidence:** P3; HIGH_SOURCE_CONFIDENCE / RUNTIME_UNVERIFIED; new in C003.
- **Expected:** Switching to Arabic consistently updates Dashboard translated React content and document lang/dir even when preference persistence fails.
- **Actual:** Dashboard locale.ts readDashboardLocale lines 19–26 falls back to EN whenever localStorage read throws. commitDashboardLocale lines 29–39 ignores denied writes, changes document lang/dir to AR/RTL and dispatches an event; locale-provider.tsx lines 45–61 derives its useSyncExternalStore snapshot and dictionary from readDashboardLocale, so the React snapshot stays EN and its effect can restore EN/LTR. UI appears not to switch or briefly flashes inconsistent direction.
- **Conditions/impact:** Browser localStorage denied, Dashboard locale switch in Arabic-first use cases. React presentation and document direction may disagree; this is not an authorization failure.
- **Existing controls:** With storage available the event and snapshot agree. Server fallback is EN; this does not address denied storage at runtime.
- **Tests:** Existing locale preference tests do not establish blocked-storage mounted Dashboard behavior; no browser test was executed in C003.
- **Remediation direction:** Use an in-memory authoritative locale snapshot with best-effort persistence, preserving EN/AR and RTL/LTR UI Freeze. Coordinate with CUST-001/#356 shared failure class but inspect this separate Dashboard implementation.
- **Regression risks:** Hydration, cross-tab storage events, theme/locale independence, translations, document direction, private/restricted browsers and persistence recovery.
- **Duplicate/owner decision:** Related cause to CUST-001 but distinct Dashboard source/route. No issue created; owner may extend #356 or register separately after deduplication.
- **Evidence:** [structured C003 record](evidence/C003-DASH-I18N-01.json).

## C004-DASH-001 — old standalone Integrations fixture assertions after Service Status relocation

- **Priority/confidence:** P3; HIGH static source confidence, RUNTIME_UNVERIFIED.
- **Expected:** Default Dashboard E2E cases exercise accepted #238 navigation under Policies → Service Status.
- **Observed:** administration-authority.spec.ts:30–47 requires the retired Integrations navigation link; administration-behavior.spec.ts:183–223 and administration-concurrency.spec.ts:192–242 expect the old /integrations page/projection. Current administration-navigation.ts:24–109 has no such destination and /integrations/page.tsx redirects to /policies?tab=services; issue238-service-status.spec.ts explicitly asserts the new contract.
- **Impact and limits:** Running the legacy/default `pnpm --filter @valet/dashboard test:e2e` can yield obsolete failures; current CI runs `test:e2e:runtime` using `./e2e-runtime`, so this is **not** evidence of present CI blocking. No test was run in C004.
- **Proposed action:** Reconcile legacy fixture assertions under UI Freeze without restoring the retired navigation. Preserve new Service Status behavior, adjust race tests to its accepted route and review suite ownership.
- **Duplicates:** Different from VAL-002 (#355) audit event count and TEST-001 (#361) official GPS discovery exclusion. GitHub issue duplicate check/owner disposition pending; no issue created.
- **Evidence:** [structured source chain](evidence/C004-DASH-001.json).

## C006-DASH-001 — legacy Keys & Spots default E2E entry after #304 Option 3

- **Severity/confidence:** P3; HIGH static source confidence, RUNTIME_UNVERIFIED. This is test-suite debt, not a product runtime/security vulnerability.
- **Observed:** `apps/dashboard/e2e/support/keys-spots.ts` (lines 15–27) expects retired `Keys & Spots` heading and `Physical Resources` outer tab. Thirteen assigned Issue #232/#236/#237 tests enter through that helper. Current `keys-page.tsx` (lines 3–12) renders `ResourceInspectorLive` directly and explicitly replaces the former page-level tabs after #304. New `apps/dashboard/tests/issue304-*` tests encode the current presentation and authority semantics.
- **Impact:** Default `pnpm --filter @valet/dashboard test:e2e` uses `playwright.config.ts` with `./e2e`; stale tests can fail before exercising their intended race, CAS, reconciliation and privacy assertions. CI currently uses `test:e2e:runtime` with a different test directory, so no current CI-gate blocker is claimed.
- **Suggested follow-up:** Migrate the old regression intents onto #304 Option 3 or retire/relabel deliberately obsolete fixture tests, preserving UI Freeze and authoritative scope/MFA/idempotency. No test run or code change was made.
- **Evidence:** [frozen source chain](evidence/C006-DASH-001.json).
