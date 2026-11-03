# Test-audit low-risk fixes — exact before/after evidence

Date: 2026-11-03
Starting merged source: `f9ecebd9af85b44580771b4027515d06c0a31de4`
Scope: test-only corrections; no production application, authority, UI, PostgreSQL schema, or required CI gate changed.

## R01 — Remove invalid three-way MFA/conflict/network test duplication

Before: `apps/dashboard/src/features/administration/policies-studio/adapters/settings/studio-settings-confirmation.test.ts:18-27` used `it.each(["mfa", "conflict", "network"])`, but did not read the scenario argument. All three cases supplied the **same resolved no-callback `run` mock** and same assertion. They therefore never proved three distinct network/security failures.

After: one clearly named test checks the actual boundary contract: when the guarded runner withholds the `onSuccess` callback, `confirmedStudioSettingsMutation` returns `false`, never calls the supplied operation and never reloads. It also proves the runner receives the intended operation/callback. The positive callback case stays unchanged in behavior. The suite now registers **two runtime cases instead of four**, eliminating two duplicate cases without dropping a distinct failure-path proof.

Important: this change does **not** claim MFA/conflict/network classification is covered by this helper. Those outcomes require their own adapter/server authorization and error-routing tests, and cannot be inferred from a generic no-callback mock. No new CI skip was added.

## R02 — Remove fixed 150-ms browser-mount sleep

Before: `apps/dashboard/src/features/help/context-help.test.tsx:84-94` unconditionally waited 150ms after mounting the isolated browser harness, even when the Help trigger was ready instantly; when it was not ready after 150ms the test failed with a timing error.

After: wait for the actual **visible English Help button**, with a bounded 5-second condition wait and the existing detailed mount diagnostics on failure. Retain all ten browser tests for keyboard focus, modal semantics, Arabic RTL, dismissals, stale-scope revocation, privacy and no network/geo/mutation side effects. No product HTML/text/design changes.

## Execution evidence

- Targeted `vitest run studio-settings-confirmation.test.ts studio-settings-commands.test.ts`: **6/6 PASS** (two confirmation + four command cases).
- Targeted real Chromium-backed Vitest `context-help.test.tsx`: **10/10 PASS** using Playwright's browser server in the suite; one observed run completed in ~15.6s for ten cases. This is **not** a controlled before/after runtime A/B.
- Architecture check and full harness suite: earlier this audit branch passed 50/50 and source file size policy; rerun at final integrated SHA.
- Source AST audit is regenerated after these changes. A `.each` authored declaration becomes a direct `it` declaration, so its *static declaration count* stays the same even though the **executed test count decreases by two**. Never count static declarations as executed cases.

## Review gate

A separate reviewer should confirm that none of the R01 cases actually used the names or differentiated a real error, that policy/authorization negative cases remain, and that R02's visibility wait does not silently pass with a hidden control. Full mandatory PR CI remains required before any merge of this new audit branch.

References: https://playwright.dev/docs/best-practices and https://testing-library.com/docs/guiding-principles/ .
