# Dashboard and shared UI audit checkpoint

Baseline: `66968655b8bd90c6681daf53fb9d8da9b9ab9f79`, isolated worktree `<AUDIT_WORKTREE>`. Scope: `apps/dashboard`, `packages/ui`. Read-only engineering assessment; no source/test/configuration changes, installs, commits or remote writes. Git status was clean at final checkpoint. This is **partial coverage**, not an exhaustive dashboard audit or completed Codex Security scan.

## Coverage

The tracked inventory contains **1,079 files / 128,714 newline-delimited lines**, including tests, styles and binary data (binary line counts are inventory byte-newline counts, not source LOC). At final checkpoint: **81 files fully read (7,025 lines), 2 partially read, 7 tool-assisted by execution, 981 not reviewed, 8 excluded binary/placeholder files**. See `coverage.json` for exact paths/status/evidence and `inventory.json` for grouping. “Fully reviewed” here means full source text inspected and local logic considered, not complete runtime or end-to-end proof. No whole large feature module was reviewed completely. Do not aggregate the file count into 100% feature/route/authorization coverage.

All 25 `src/app/**/page.tsx` route entry files were inspected. Registered product destinations and their access requirements were read. Foundation/session behavior, API JSON/binary transport, shared read hooks, operational list pages, branding mutation flow, guest privacy/contact editors, date-period selection, navigation and focus-dialog behavior received focused source review. The two partial files are Investigation workspace/live-support, where output truncation prevented complete review. Most dashboard tests, styles, management settings/staff details, maps, report export, and Investigation controllers remain unreviewed; the ledger explicitly lists them. Physical responsive rendering, screen reader use, actual browser zoom, EN/AR dark/light combinations and provider/API runtime were **not tested**.

## Architecture and feature map

The Dashboard is a Next 16 / React 19 application, port 3003. `next.config.ts` rewrites Staff API traffic to the configured API origin. Memory-resident Staff auth is accessed through `StaffAuthClient` and provider; API requests include credentials, access bearer, schema validation, identity/session fences and safe GET refresh/retry. Mutations rejected by 401 are surfaced for explicit retry instead of generic POST replay. `SelectedManagementShell` revalidates route and navigation authority, keys protected feature context by session/scope selection, and clears incompatible generations. These are inspected design properties, not proof that all server enforcement paths are correct.

| Feature group / routes | Actual UI → client → API / result path | Status and limits |
|---|---|---|
| Foundation `/`, `/security`, `/help`, `/staff/activate` | protected route → ManagementFoundationApp/selected shell → auth/scope/MFA clients → Staff API; activation has separate public ceremony | Implemented; entry and selected-shell logic read, most ceremony/scope controllers not fully reviewed |
| Live Operations `/live-operations` | LiveOperationsPage → readLiveSessions/readStateCounts/readRetrievalQueue → `/v1/staff/dashboard/locations/:id/overview/{live-sessions,session-state-counts,retrieval-queue}` → exact-location projection → rows/drawers | Implemented read-only CA/LM view; stale-KPI candidate below; no field mutations expected here |
| Vehicles `/vehicles` | VehiclesPage → readSessions → `/.../overview/sessions` → session/vehicle/resource projection → rows and photo drawer | Implemented; search/state filter explicitly loaded-page-only, not an invented global search defect |
| Tasks `/tasks` | TasksPage → readTasks → `/.../overview/tasks` → task/assignee projection → drawer | Implemented; status/type filters explicitly loaded-page-only. Historical GPS route map is known missing presentation, tracked #343/design gate, not a new bug |
| Keys & Spots `/keys` | KeysPage/resource inspector → operations/physical-resource clients → exact-location keys/spots management reads and mutations | Implemented entry; detailed inspector/mutation files not manually reviewed |
| Incidents `/incidents` | incident read → overview projection → drawer → ResolveIncidentControl → versioned operation ID/expected status → POST incident resolve → authoritative response | Implemented; resolve control read, full producer and evidence views not reviewed |
| Maps `/maps-zones` | maps UI → map setup/live-map clients → authorized API → map adapter / configured Google Maps with coordinate fallback | Implemented, CA/LM plus narrowly authorized Supervisor; detailed map/refresh modules unreviewed in this worker |
| Employees & Shifts `/employees` | StaffPage directory/shift tabs → staff APIs → management authorization → staff, grant and shift records → drawer and sensitive mutations | Implemented; directory query and tab/recovery logic read; detailed mutation/shift flows not fully reviewed |
| Locations `/locations` | location list/detail → management locations lifecycle commands → CAS version, readiness/drain guards → result/reload | Implemented; lifecycle/resume/currency/timezone client read; server integrity belongs to other worker |
| Policies `/policies`, `/integrations` | settings tabs → company/location policy clients → management API; integrations redirects to `/policies?tab=services` | Implemented; two-level secondary navigation is #321 owner design-gated work, not an authorized redesign or new defect |
| Privacy & Contact `/guest-information` | GuestInformationPage → privacy/contact/preview clients → organization + selected location APIs → revisioned drafts / separately published policy → guest-visible preview | Implemented; preview failure candidate below. Separate save/publish semantics and location inheritance are represented |
| Roles `/roles-permissions` | RolesPage → fixed bilingual reference definitions; no editable permission backend implied | Intentional read-only fixed role reference, CA only; not a missing role editor |
| Branding `/branding` | BrandingPage → company/management-location/LM branding clients → versioned set/clear command → typed response/reload | Implemented; per-field save and inherited overrides; detailed server behavior not assessed here |
| Subscription `/billing-subscription` | SubscriptionPage → company/location subscription API → current subscription/entitlements → read-only status | Intentional read-only view; not a payment/upgrade interface |
| Overview / Analytics / Payments | Intelligence pages → bounded period keys and company/location readers → management intelligence API → measured aggregates / explicit unavailable values | Implemented; date calendar/validation and Analytics/Payments source read, detailed metrics producer not verified |
| Reports `/reports` | report page/export intent → authorized preview/binary export API → generated CSV/PDF/download | Implemented entry; detailed report recovery/export flow remains unreviewed |
| Visit Contacts `/customers` | VisitContactsPage → purpose-limited search/detail clients → authorized management contact data → bounded results/drawer | Implemented entry; detailed feature remains unreviewed |
| Audit `/audit-log` | AuditPage → event list OR owner-approved live Investigation → authorized search/timeline sources → event/session history | Implemented, not just demo UI; current labels are disclosed as current, histories can be bounded. Detailed search/timeline controllers not fully reviewed |
| `packages/ui` | AppShell renders title + children in main | Tiny shared primitive fully read; no defect found |

## Findings register

| ID | Priority | Category | Feature | Finding | Confidence | Existing issue |
|---|---|---|---|---|---|---|
| DASH-01 | P2 | Functional correctness / freshness | Live Operations | Successful KPI read is never refreshed when the operational rows are refreshed | HIGH (source-level; no mounted browser reproduction) | No matching open issue found in supplied open-issues snapshot; recently closed issues not exhaustively checked |
| DASH-02 | P3 | Functional recovery / error state | Privacy & Contact | Guest preview read failures render a permanent “Loading…” state | HIGH (source-level; no mounted browser reproduction) | No matching open issue found in supplied open-issues snapshot; recently closed issues not exhaustively checked |

### DASH-01 — Live Operations KPIs remain at their initial snapshot

1. **ID/title:** DASH-01, Successful Live Operations KPI read is never refreshed with operational rows.
2. **Severity:** P2. Operational management misinformation with page reload workaround; not P0/P1 and no data corruption demonstrated.
3. **Confidence:** HIGH. Conclusive static request-key/dataflow evidence; not counted as browser-reproduced.
4. **Category:** Functional freshness defect and test gap.
5. **Affected feature:** Live Operations active/requested/in-transit/handoff counters and their relationship with the session/retrieval table.
6. **Exact paths:** `apps/dashboard/src/features/operations/live-operations/live-operations-page.tsx`; `apps/dashboard/src/features/administration/use-authoritative-read.ts`; `apps/dashboard/src/features/operations/live-operations/live-operations-controls.tsx`; `docs/24_MANAGEMENT_DASHBOARD_INTEGRATION_PLAN.md`.
7. **Lines:** live page 69–84, 109–133, 140–152 and 165–195; read hook 64–66, 79–108; controls 53–68; integration plan 797–799.
8. **Expected:** Current operational projections use bounded refresh; explicitly refreshing the operational list should reconcile the related Location KPI snapshot, and active use should not silently leave counters indefinitely stale.
9. **Actual:** Counts use constant `${scopeKey}:live:counts` and stable load callback. Changing filters, switching retrieval view and pagination increments `listRevision` for rows only. `counts.refresh` is reachable only when `counts.error` is truthy; after a successful first count read its retry control disappears. The read hook has no timer, subscription, visibility/focus event, invalidation bus, or source change listener.
10. **Root cause:** Data freshness ownership is omitted for the successful count read; row refresh generations and count generation are disconnected.
11. **Credible execution:** Manager opens Live Operations while two cars are active. Other employees check in additional vehicles or complete handoff. Manager clicks a filter (even the selected filter); session endpoint reads again and returns current rows. Count key/revision does not change, so cards still show the original counters. Remaining on the page without interactions also performs no bounded refresh of these reads.
12. **Preconditions:** Authorized CA/LM, exact active Location, successful initial KPI load, stable scope/auth generation, subsequent server-side operational changes.
13. **Business impact:** Staffing/queue decisions can use obsolete workloads and cards can contradict the currently loaded rows.
14. **Security/data impact:** None demonstrated; no unauthorized read/write, no persisted state corruption.
15. **Affected roles:** Company Admin and Location Manager.
16. **Affected environments:** Any browser environment using this source, including pilot; API/backend may be healthy.
17. **Existing test coverage:** Focused API transport and presentation tests pass; these prove parsing/KPI projection, not continued mounted freshness. No browser freshness test run. Maps has a separate refresh owner and is not evidence that this page refreshes.
18. **Missing validation:** A mounted two-actor sequence with controlled counts/session responses, bounded request counts, visible/hidden/offline transitions, scope/session changes, and cleanup. Inspect all global invalidation behavior before implementation; no such invalidation is imported by the shown hook/page.
19. **Suggested fix:** Add explicit bounded page-level freshness ownership consistent with accepted load budget, co-refresh counts and relevant rows on explicit refresh/view changes, expose truthful stale state. Keep UI geometry frozen; get owner decision only for any additional visible control or cadence policy not already approved.
20. **Complexity:** Small to medium; shared refresh ownership and race-safe cleanup/testing matter more than request syntax.
21. **Regression risk:** Medium; auth/scope fencing, request amplification and hidden/offline behavior must remain correct.
22. **Existing issue:** No matching open issue in `<AUDIT_WORKDIR>/open-issues.json`. Do not claim globally untracked without closed-issue search.
23. **Attempted disproof:** Read entire count/list hook, control and page. Counts can refresh on error, remount, scope/session transition, or browser reload, so claim is deliberately limited to stable successful mounts and row interactions. The active filter is clickable and does refresh its list, proving a concrete card/list inconsistency rather than merely objecting to an arbitrary lack of polling. Requirements call for bounded current operational refresh, not unbounded polling. Pilot: fix or require deliberate full-page refresh with clear operator training; do not treat unchanging counters as live truth.

### DASH-02 — Guest preview API failure becomes indefinite loading

1. **ID/title:** DASH-02, Privacy & Contact guest preview drops its error state.
2. **Severity:** P3 (limited admin-preview recovery defect; no guest-facing outage established).
3. **Confidence:** HIGH, source-level dataflow; no browser/API fault injection run.
4. **Category:** Functional recovery/error-state bug.
5. **Affected feature:** Dashboard Privacy & Contact → Contact → Guest preview.
6. **Exact paths:** `apps/dashboard/src/features/guest-information/guest-information-page.tsx`; `apps/dashboard/src/features/guest-information/contact-section.tsx`; `apps/dashboard/src/features/administration/use-authoritative-read.ts`.
7. **Lines:** page 85–93, 104–107, 254–266; contact section 51–59; read hook 91–99, 121–126.
8. **Expected:** Failed preview read shows a truthful recoverable error with a retry action; it must distinguish failure from an in-flight request.
9. **Actual:** The page creates `preview` state, but global `error` includes privacy/contact/company defaults only. It passes `preview.data` without preview.error/loading/retry. ContactSection renders “Loading…” whenever preview is null, including after a completed failure. Normal loaded UI does not expose the page `retry` callback for this failure.
10. **Root cause:** Preview state is reduced to nullable data at the child boundary, losing terminal error and recovery information.
11. **Credible execution:** Load otherwise successful Privacy & Contact page; make only `readPreview` fail (transient API 5xx/network failure or invalid preview response). Open Contact and expand Guest preview. Shared read settles with data=null/error populated/loading=false, while child continues “Loading…”.
12. **Preconditions:** Authorized manager, selected Location, successful privacy/contact reads and (for CA) company defaults, independent preview failure.
13. **Business impact:** Managers cannot distinguish failed guest-visible preview from loading or directly retry; troubleshooting and policy/contact verification are hindered.
14. **Security/data impact:** None demonstrated. Saved settings and guest API behavior are not proven broken by this UI failure.
15. **Affected roles:** Company Admin, Location Manager.
16. **Affected environments:** All dashboard browser environments on this baseline.
17. **Existing test coverage:** Guest feature tests were not executed or fully inspected by this worker. Passing general read-hook/transport tests cannot establish child recovery correctness.
18. **Missing validation:** Mounted fault injection only on preview endpoint, retry success, locale change and scope-loss cleanup. Actual browser behavior unverified.
19. **Suggested fix:** Pass preview error/loading/retry to the child and render an existing error/retry treatment; preserve approved UI layout. Include a failed-preview regression case.
20. **Complexity:** Small.
21. **Regression risk:** Low to medium; preserve local drafts during preview retries and locale changes.
22. **Existing issue:** No matching open issue in supplied snapshot; full closed-issue dedup not performed.
23. **Attempted disproof:** Read complete page, child and hook. Parent global error excludes preview explicitly; no child retry exists. Changing locale/location or page reload may recover, so indefinite loading is limited to an unchanged mounted preview after failure. Other successful save actions call `retry` and can incidentally recover; that does not supply error disclosure or direct recovery. Pilot: can defer with reload workaround; not a release blocker by itself.

## Other observations / discarded candidates

- Do not report local Vehicles/Tasks filters as accidentally global: both show loaded-page scope notes by design.
- Do not report fixed Roles or read-only Subscription as missing management commands: current source deliberately says read-only.
- Do not count synthetic pre-approval historical-staff diagnostic tests as present production projection failure: live page now calls separate live-sessions schema/transport.
- Guest policy publish is intentionally separate from draft save, and dirty drafts disable publish. This is not incomplete persistence.
- Branding uses independent field saves and refreshes remount the editor. Potential loss of another unsaved field deserves a future UX review, but was not independently reproduced and is **not counted as a finding** here.
- Some Investigation current-state labels remain raw English in Arabic source, but no exhaustive localization/render proof was performed; **not counted**.
- #343 Task GPS route-history display, #321 Policies secondary navigation and #333 remaining authorization concurrency coverage are known open work; do not convert them into new confirmed defects or claim they were completed here.

## Validation actually executed

From isolated audit worktree:

```sh
<DEPENDENCY_CHECKOUT>/node_modules/.bin/vitest run --config apps/dashboard/vitest.config.mjs apps/dashboard/src/lib/api/dashboard-api-client.test.ts apps/dashboard/src/lib/api/dashboard-api-client-binary.test.ts apps/dashboard/src/features/operations/operations-api.test.ts apps/dashboard/src/features/operations/live-operations/live-operations-presentation.test.ts apps/dashboard/src/features/intelligence/dashboard-period-calendar.test.ts apps/dashboard/src/features/intelligence/dashboard-period-selection.test.ts apps/dashboard/src/features/administration/use-sensitive-mutation.test.ts
```

**PASS: 7 test files, 78 tests, duration 12.02s** (Vitest 4.1.10). Existing dependencies reused from primary checkout through parent-created external ancestor dependency directory; no install and no application source edits. Tests were executed, not all manually reviewed. They do not reproduce the two candidates above.

```sh
<DEPENDENCY_CHECKOUT>/node_modules/.bin/tsc --project apps/dashboard/tsconfig.json --noEmit --incremental false
```

Started but no terminal result retained: after task/session continuation, polling returned `Unknown process id 79264`. **Outcome UNKNOWN; do not count as pass or source failure.** No build scripts executed by this worker. Browser, full dashboard suite, real PostgreSQL/API, Google Maps, device tests, production provider and accessibility matrix were not run.

## Pilot assessment for this scope

Source shows a substantially integrated management interface, not just decorative mock pages. Scope/session generation fences, typed schemas, explicit unavailable metrics, CAS-style management commands and narrowed role navigation are positive observed controls. This does not establish production readiness. DASH-01 affects operational trust and should be corrected or controlled with deliberate reload procedure before relying on live management metrics. DASH-02 is acceptable with a reload workaround while scheduled for correction. General dashboard release approval remains unsubstantiated until unreviewed files and real browser/API revocation/concurrency, i18n/accessibility and operator workflows are qualified. No redesign is recommended or authorized; fixes should preserve the UI Freeze.
