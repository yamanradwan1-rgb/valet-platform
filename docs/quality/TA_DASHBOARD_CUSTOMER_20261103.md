# Dashboard and Customer Vitest reliability audit — 2026-11-03

**Scope and baseline:** Independent, read-only source review with docs-only outputs on
`cos/test-audit-dashboard-20261103`, based on immutable merge
`f9ecebd9af85b44580771b4027515d06c0a31de4`. The companion
`TA_DASHBOARD_CUSTOMER_CASE_LEDGER_20261103.csv` enumerates **each statically
declared test case**, with its source path, declaration line, title, app, candidate
lane and triage area. **The ledger is an inventory, not a claim that each case
received an independent manual semantic proof.** Prioritization below reflects
source inspection of selected risk-bearing families and adjacent checks.

## Execution ownership and measured discovery

| Evidence | Dashboard | Customer | Total |
| --- | ---: | ---: | ---: |
| `src/**/*.{test.ts,test.tsx,test.mjs}` files | 178 | 74 | 252 |
| Static `it`/`test` declarations | 820 | 390 | **1,210** |
| Static `.each` declarations (combined) | | | **127** |

These are source declaration counts, **not expanded runtime test cases**, and
do not include test cases created by dynamic registration, helper side effects,
or the cross-surface Playwright projects. The CSV records parameterized rows as
`YES: runtime expands rows`; runtime expansion must be obtained from an actual
Vitest reporter before any per-case cost claim. Its `triage_area` labels are
path-based search cues (321 authority/privacy, 168 UI/copy, 721 workflow), not
evidence of individual assertion strength. All 1,210 entries deliberately
retain `review_status=INVENTORY_ONLY` pending a case-by-case invariant ledger.
The additional `case_invariant_hint` is the authored test title, not an inferred
proof. `file_level_source_signals` records syntax-level signals such as file
source scans, string/markup assertions, mocks, browser startup and fixed waits;
**the signal describes its whole file and does not imply each row uses it**.
`assertion_strength=NOT_ASSESSED_PER_CASE` and
`redundancy_verdict=NOT_PROVEN` prevent heuristic flags being mistaken for an
approved rewrite/removal. Only two exact-title groups were repeated (four
declarations); title identity alone establishes no duplication of invariants.

`apps/dashboard/package.json:11` and `apps/customer/package.json:11` each run
`vitest run src`. `scripts/test-harness/run-root-tests.mjs:15-35` includes both
in the root pure Turbo test lane; `.github/workflows/ci.yml:86-94` runs that
lane under the required `unit` job and installs Chromium for browser-backed
unit suites. The two browser-backed Help Vitest suites therefore belong to the
unit lane, despite their Playwright machinery.

The Dashboard has a distinct `test:e2e` Playwright project (`./e2e`) and a
`test:e2e:runtime` project (`./e2e-runtime`):
`apps/dashboard/package.json:12-13`, `apps/dashboard/playwright.config.ts:4-6`,
`apps/dashboard/playwright.runtime.config.ts:4-6`. The required workflow invokes
**only** `test:e2e:runtime` at `.github/workflows/ci.yml:384-385`. A repository
workflow search found no required invocation of `@valet/dashboard test:e2e`.
Thus the mock-backed neighbors `apps/dashboard/e2e/md05-analytics.spec.ts:43-110`
and `apps/dashboard/e2e/issue321-policies-studio.spec.ts:16-100` **exist but
cannot be cited as required-CI execution or PostgreSQL-backed evidence**.
Changing the required gate or shifting costs between lanes requires a separate
owner-approved change with execution proof. This audit did not run those suites.

## Prioritized candidate decisions

`KEEP` means retain the named negative/positive invariant. `REWRITE` means
preserve the invariant while fixing an assertion or fixture. `MERGE` means a
conditional consolidation only after proving case-level equivalence. `REMOVE`
is **not authorized** for any current case: no case has passed a unique-invariant,
adjacent proof and required-lane-preservation deletion gate.

| Rank / disposition | Exact case evidence and diagnosed coupling | Adjacent independent evidence; business consequence and safe action |
| --- | --- | --- |
| **P1 REWRITE** | `apps/dashboard/src/features/administration/policies-studio/adapters/settings/studio-settings-confirmation.test.ts:18-27`: `it.each(["mfa", "conflict", "network"])` never consumes the scenario argument; all three cases call the same `vi.fn().mockResolvedValue(undefined)`. Three green cases would still not exercise three failure classifications. | `:6-16` tests the positive guarded-success callback, and `studio-settings-confirmation.ts:2-15` shows confirmation is based on `onSuccess`, not the return of `run`. `studio-settings-commands.test.ts:23-71` separately proves versioned payloads and client validation. Rewrite to inject **distinct** MFA, conflict and network failure behavior through the real mutation adapter or declare one generic no-callback test plus separate meaningful classification tests. Verify no save-success, no reload, no automatic mutation replay and no unintended requests; never assert a rejected callback is swallowed without checking the caller contract. **Impact:** false-green settings save/MFA recovery. |
| **P1 KEEP + REWRITE harness** | `apps/dashboard/src/features/help/context-help.test.tsx:51-103` bundles an isolated browser and launches Chromium with a browser context per **10 cases**; `:87` imposes unconditional `page.waitForTimeout(150)` per case (minimum 1.5 s of explicit waiting, excluding setup/teardown and browser time). `apps/dashboard/src/features/help/administration-settings-help.test.ts:29-81` launches a separate Chromium server and builds another harness for **3 cases**. | Real browser assertions in `context-help.test.tsx:105-285` check AR/RTL, keyboard focus, nested dialog draft retention, scope revocation and no API/geolocation/form side effects. `administration-settings-help.test.ts:117-151` checks drafts survive Help. Keep these required-unit negatives; replace fixed sleeps with observable ready signal (e.g., awaited accessible Help button plus mounted-state assertion) and benchmark repeated cold/warm timings before deciding whether a shared browser fixture reduces cost without cross-test contamination. **Impact:** avoidable CI latency and timing flakes. |
| **P1 KEEP / coverage gate** | `apps/dashboard/src/features/intelligence/intelligence-generation.test.ts:65-145,178-205` rejects inactive/supervisor scopes, differentiates authority/period/generations and drops stale A→B→A outcomes. | `apps/dashboard/src/features/intelligence/analytics-presentation.test.ts:202-280` tests financial/metric projection but not current persisted tenant authority; `apps/api/test/management-company-analytics-authorization.integration.test.ts`, `management-company-analytics-boundaries.integration.test.ts` are the backend evidence candidates, subject to actual PostgreSQL execution. Preserve both layers. **Impact:** cross-tenant analytics disclosure if only UI visibility is asserted. |
| **P1 KEEP / coverage gate** | `apps/customer/src/features/session/guest-request-coordinator.test.ts:157-175,187-247` refuses old-client results, wrong visit identity, stale mutations, invalid guest authority, and respects 503 cooldown; `:250-265` tests read cadence and freshness. | `apps/customer/src/features/session/guest-branding.mounted.test.tsx:79-110` independently proves old branding cannot appear after Location/Organization replacement or expiry. Preserve both; separate backend tests must prove visit-Location authority. **Impact:** wrong guest vehicle/branding or unintended retrieval. |
| **P2 REWRITE** | `apps/dashboard/src/features/help/context-help-phase-e-mounts.test.ts:29-56` and `context-help-administration-mounts.test.ts:29-55` use `readFileSync(...).toContain('helpKey="..."')` or `ContextHelp` source substring as proxy for an actually mounted accessible Help owner. A dead branch/comment could satisfy them, while harmless prop extraction breaks them. | `context-help-coverage.test.ts:67-175` reconciles actual route inventory, setting keys and sections; `context-help-registry.test.ts:21-84` validates catalog completeness and AR copy; real Help mount/lifecycle is tested in `context-help.test.tsx:105-285`. Keep 13 Phase E and 20 Administration ownership expectations, but verify the authoritative owner via AST/import manifest and at least a representative *mounted* reachable trigger; negative fixtures must fail when a key is commented out or hidden by unauthorized rendering. **Impact:** missing Help despite green source-string tests. |
| **P2 REWRITE** | `apps/customer/src/features/session/guest-branding.test.tsx:106-121` builds `company` and `cleared` from the **same input**, so their equality does not independently establish an override-clear transition; the string substitution of Arabic name likewise compares HTML rather than the change sequence. | `guest-branding.mounted.test.tsx:62-77` **does** supply three successive `loadSession` snapshots for Company→Location override→Company and asserts shell/sibling tokens. `guest-branding.test.tsx:123-198` checks client fencing and a stale command retaining B branding. Keep mounted proof; change the weaker SSR assertion to independent before/after projections or move its unique locale/geometry assertion into the mounted test only after verifying the same visible name, color and stale-read negatives. DEC-085 requires effective Location server resolution, also examined in `apps/api/test/guest-effective-branding.integration.test.ts`. **Impact:** stale or incorrect venue identity. |
| **P2 REWRITE** | `apps/customer/src/features/session/guest-session-ready-alert-composition.test.ts:9-24` inspects literal source snippets (`observeGuestReadySnapshot`, `setTimeout`, absence of old constant), vulnerable to inert text and valid scheduling refactors. | Actual coordinator scheduling/identity behavior at `guest-request-coordinator.test.ts:157-175,198-265` and provider mounting in `apps/customer/src/app/guest-refresh-mounted.test.tsx` are adjacent checks, **not** proof that the live provider calls the correct boundary. Replace source-token checks with an instrumented, fake-clock provider composition that counts observers, timers and network calls across canonical/POST snapshots; retain exactly-one-scheduler and no duplicated alert invariants. **Impact:** duplicate READY alerts or increased Guest traffic. |
| **P2 REWRITE with KEEP negatives** | `apps/customer/src/features/session/guest-branding-coverage.test.tsx:22-63` pins serialized inline CSS/classes on CTA, badges and QR, while `:65-75` recursively scans only `.tsx` (excluding demo) for three exact blue hex literals and named tokens. Neither guarantees computed contrast on every production consumer, nor covers `.css` sources. | `guest-branding.test.tsx:200-259` rejects malformed colors and preserves dark/theme defaults; `guest-brand-palette.test.ts` checks palette conversion; `guest-branding.mounted.test.tsx:62-110` checks real shell and sheet transition. Preserve the contrast/trust/QR exceptions; add computed-style checks in a mounted EN/AR consumer before replacing brittle literal-CSS assertions; widen scan deliberately if color ownership extends to `.css`. **Impact:** unreadable branded primary CTAs or misleading trust colors. |
| **P2 KEEP** | `apps/dashboard/src/features/administration/policies-studio/adapters/settings/studio-settings-read.test.ts:35-93` distinguishes inherited `false`, Location Manager legacy keys and rejects server-scope mismatch. `studio-settings-commands.test.ts:23-71` tests CAS, explicit clear, forbidden LM key and invalid type before transport. | These use `DashboardApiClient` method mocks and prove *client adapters*, not server MFA, tenant rights or durable CAS. `apps/dashboard/e2e/issue321-policies-studio.spec.ts:16-100` uses a fixture and is outside required CI; backend PostgreSQL authorization/receipt checks must remain independent. Preserve false-vs-null and deny-before-dispatch cases per DEC-083/095. **Impact:** Location policy/entitlement data loss and unauthorized writes. |
| **P2 KEEP + REWRITE selected selectors** | `apps/dashboard/src/features/intelligence/customer-feedback-section.test.tsx:42-58` checks raw HTML `feedback-sample-count">78` and specific classes/strings: markup refactors can break without changing meaning. | The distinct tests at `:60-100` preserve unavailable vs real zero cohort, AR direction isolation, and hide stale rating references or private errors on denied/loading/error states; `:102-108` proves persisted Location timezone handling. Move sample count to semantic accessible DOM/text assertion when feasible, preserve denial privacy and cross-timezone facts. DEC-095:180-189 forbids raw guest identity in analytics. **Impact:** PII display after authority loss. |
| **P2 KEEP** | `apps/dashboard/src/features/intelligence/analytics-presentation.test.ts:202-250,253-280` checks raw exact decimals/multi-currency, null vs zero, timezone-boundary ordering and suppression of `byEmployee`, ratings/contact prototype concepts. The `:254-264` Company `.toBe(source...)` checks pass-through identity, not backend recomputation. | `apps/api/test/management-company-analytics-weighting.integration.test.ts` and `...-authorization.integration.test.ts` are separate source-of-truth checks whose CI success is unverified here. Keep all client privacy and decimal invariants; do not infer DEC-092 aggregation correctness from pass-through references or the mocked Dashboard E2E fixture. **Impact:** money aggregation errors, employee identity exposure. |
| **P2 KEEP** | `apps/dashboard/src/features/administration/settings/shift-presence-guided-apply.test.ts:77-158` tests four separate CAS versions, no replay after UNKNOWN, no writes on conflict/unready strict settings, and cancellation mid-apply. | `shift-presence-guided-copy.test.ts:89-172` checks explanatory words but cannot substitute guarded mutations. Keep failure-path cases and direct server permission proofs elsewhere; no UI/copy consolidation should loosen location or GPS privacy gates. **Impact:** duplicate or unauthorized sensitive policy edits. |
| **P2 KEEP** | `apps/customer/src/features/rating/guest-rating-submission.test.ts:24-93` serializes duplicate submit, suppresses stale cross-visit callbacks, invalidates unmount/logout, and *uses* each seven-case error input. | `apps/customer/src/app/guest-auto-rating-eligibility.mounted.test.tsx` and `apps/customer/src/features/post-visit/guest-auto-rating.mounted.test.tsx` are distinct presentation gates. Keep DEC-106 exact visit/explicit submit and unknown-outcome suppression; cannot merge by keyword. **Impact:** duplicate or wrong-visit immutable rating writes. |
| **P3 MERGE candidate** | `apps/dashboard/src/features/help/context-help-registry.test.ts:22-43` and `context-help-coverage.test.ts:163-174` both assert **110** catalog IDs and exact registry completeness. Some repeated cardinality / equality work is plausibly redundant. | Registry uniquely guards raw pre-spread collisions, bilingual content and prototype keys; coverage uniquely guards route/setting/section manifests and missing keys (`context-help-coverage.test.ts:86-147`). Only merge the repeated numeric check after a mutation-based proof that deletion, duplicated source key and undeclared key still fail in the required unit lane; retain both unique negatives. **Impact:** minor maintenance/copy drift; no measured CI speed benefit yet. |
| **P3 REMOVE candidate: NONE** | No observed case has proved fully subsumed invariants and equivalent failure signal after the above rewrites. | Any future removal requires exact old-case → new-case mapping, mutation tests for negative branches, equal execution ownership, reproducible runtime case counts, no privacy/permission loss, and explicit owner authorization. **Impact:** unjustified removal could silently turn a regression green. |

## Refactor acceptance examples (proposals only; no code changed)

**Settings failure matrix.** Use each actual scenario input in an independent
setup rather than three identical `mockResolvedValue(undefined)` callbacks:

```ts
it.each([
  { name: 'MFA', outcome: makeSensitiveMutationMfaOutcome },
  { name: 'conflict', outcome: makeSensitiveMutationConflictOutcome },
  { name: 'network', outcome: makeSensitiveMutationNetworkOutcome },
])('does not claim saved on $name', async ({ outcome }) => {
  const { run, operation, reload } = setupGuardedMutation(outcome());
  await performAndObserve(run, operation, reload);
  expect(reload).not.toHaveBeenCalled();
  expect(noSavedStateWasPublished()).toBe(true);
  expect(noAutomaticWriteReplay()).toBe(true);
});
```

Names above are **illustrative**, not present functions or executable edits.
Assert the distinct classification *at the real adapter*, and keep the generic
`confirmedStudioSettingsMutation` callback test focused on its actual interface.

**Help ownership.** Keep an authoritative semantic key manifest and fail for an
unmatched active route/section. Parse actual JSX imports/mount ownership or
mount the authorized route and query `getByRole('button', { name: /Help:/ })`;
verify a missing/unreachable trigger fails. Preserve AR title, nested focus,
Escape, scope-revocation and zero-mutation browser checks. Replace fixed timing
with awaited observable readiness; keep each browser test isolated.

**Branding/polling.** Drive one mounted provider with Company snapshot, overriding
Location snapshot and cleared override, then an out-of-order old-visit GET.
Assert the name, visible color/contrast and two sibling surfaces remain matched
and that stale data does not reappear. Use fake time / request spies to verify
one provider scheduling owner and READY observer, without asserting the source
contains a specific function name, old constant or timer implementation.

## Verification and release boundaries

- Checked source tests, application scripts, root test orchestrator, CI job,
  adjacent Customer/Dashboard Playwright fixtures, named backend integration
  proofs and binding decisions. A few high-risk suites were read in detail;
  remaining test declarations were mechanically indexed, with candidate labels
  for future semantic audit.
- No dependency `node_modules` exists in this exclusive worktree, so **no
  Vitest, Playwright, PostgreSQL, E2E, latency benchmark or CI run was executed
  here**. No runtime pass/test-count or speedup claim follows from the static
  inventory. A green UI-mock test would not establish database-backed rights.
- Zero assertions, tests, product UI, required gates, timeout values, production
  endpoints, migrations or Accepted decisions were changed. Deliverables are
  documentation and a per-declaration CSV for Prime to integrate/review. Future
  semantic decisions must first map negative coverage to the proposed replacement
  and run the relevant required lane on a disposable environment.
