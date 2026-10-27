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
