# Issues #250–#252 — Native shell presentation

Owner-authorized implementation scope, 2026-10-03.
Baseline: `origin/main@6edd94e0021e38b49776e971496e9476b59d3f0d`.
Branch: `fix/VAL-250-252-native-shell-polish`.

## Contract ledger

The latest owner brief makes the existing Native UI the visual authority for
this task. It narrows DEC-071 / execution-plan visual-reference guidance to the
current Native components. No Employee Web source is an implementation reference.

| Behavior | Binding source | Implementation boundary |
| --- | --- | --- |
| Replace initials with a deterministic decorative gear | #250; owner brief §§6–8 | Existing SVG Employee icon architecture; same Account Menu entry |
| Preserve 36×36 circle, navy3, hitSlop 6 and pressed opacity 0.7 | #250; owner brief §§6–8 | Existing entry styles and press handler |
| Fix only header physical structure to LTR | #251; owner brief §§9–12 | EmployeeAppHeader and its structural rows |
| Preserve Arabic human RTL and identifier LTR | #251; owner brief §11 | Existing employeeTextStyle; frame remains locale-directed |
| Derive elapsed display from persisted scope.shiftStartedAt and wall clock | #252; owner brief §§14–16; DEC-032 §9 | Presentation only; no Shift operation timestamp changes |
| Reuse exact duration grammar and unit dictionaries | #252; owner brief §15 | Extract pure formatter; full Shift screen only changes its import |
| Refresh at minute boundaries; pause in background; refresh immediately on resume | #252; owner brief §§16–18 | Component-scoped presentation hook observing AppState, no global lifecycle owner |
| Clean timers/listener when strip unmounts or start changes | #252; owner brief §18 | Existing operational snapshot still owns strip presence |
| Announce active Shift, elapsed duration and Location | #252; owner brief §20 | Existing single accessible surface; no live-region announcements |

Affected projections: existing Shift and Location fields of
EmployeeOperationalScope. User, membership, Organization, Location and Shift
identity/authority remain separate and unchanged (DEC-032, DEC-072, DEC-081).
There are no ValetSession, Task/Dispatch or Shift transitions, writes, new retry
semantics, DB constraints/indexes, audit events, persistence, API calls or
configuration-policy changes. Company-default/Location-override rules are not
affected. This is within the existing bilingual Employee MVP presentation.

No dependencies, package/lockfile changes, logo changes, Account Menu sheet
changes, Shift screen redesign, global RTL change or out-of-scope app changes.
All task-owned authored code must remain within 300 physical lines.

## Baseline and evidence plan

Source baseline: 64px white header, horizontal padding 20, brand/context gap 12,
divider 1×20, utilities gap 8, existing logo height 28; frame direction inherited
by header before #251. Settings entry is a 36×36 navy3 circle with VE/VS content.
Strip is one navy3 row, padding 20/10, gap 8, 8×8 green dot, existing 12px
supporting text and numberOfLines=1; secondary text is localized start–now.

Tests cover EN/AR gear/header together, menu open/close and locale callbacks,
unchanged sizing/styles, global frame RTL, authoritative duration, minute
boundary, foreground catch-up, new start/locale, future-start clamp and cleanup.
Existing Tasks gating and Shift formatter tests remain regression evidence.

ADB discovery before edits returned no connected device. Physical Android EN/AR
rendering, TalkBack, elapsed advancement and before/after screenshot comparison
are EVIDENCE OPEN. Static/style and simulated lifecycle evidence cannot close
those gates or establish remote CI / production readiness.

## Implementation and acceptance trace

- #250: `EmployeeSettingsIcon` uses the existing react-native-svg Path/Circle
  architecture, white token and size 20 inside the unchanged 36×36 navy3 circle.
  Radius 999, hitSlop 6, pressed opacity 0.7, testID, localized label and original
  menu handler remain. Dead initials-only plumbing was removed after caller
  inspection. The menu sheet, fade, backdrop, controls and RTL behavior remain.
- #251: explicit `direction: "ltr"` on appHeader, brandContext and
  headerUtilities fixes structural rows. EmployeeFrame still receives locale
  direction; Arabic human text retains RTL/right alignment; identifiers remain
  LTR. Tests exercise EN/AR/EN with the gear and preserve baseline geometry.
- #252: the original pure formatter was extracted verbatim to
  `shift/native-shift-duration.ts`, with a compatibility re-export at its old
  module. Full Shift-screen rendering and its existing timer remain unchanged.
  A component-scoped hook schedules one timeout at the next elapsed-minute
  boundary (at most 60 seconds), recomputing from Date.now() and the persisted
  start. AppState inactive/background clears it; active immediately recomputes
  and schedules again. New start and unmount clear the timer and subscription.
  No elapsed counter, persisted clock, background work or server poll exists.
  Existing Tasks scope/phase gating removes the strip when authority disappears.
- Existing duration examples: EN `2h 5m`; AR `2 س 5 د`. Resume after 30 minutes
  derives `2h 35m` directly from wall clock and the same authoritative start.
- The strip keeps its original styles and single accessible surface. Its label
  now includes elapsed duration and Location, without a live region.

## Local gate evidence

| Gate | Observed result |
| --- | --- |
| Focused eight-file Native regression suite | PASS: 63 tests, 8 files, final focused run |
| Full `pnpm --filter @valet/valet-native test` | FAIL: 1,317 passed / 3 failed; 173 files passed / 1 failed (before two additional gating tests) |
| Native lint | PASS; also successful in root lint's 10 successful packages |
| Native typecheck | FAIL: five missing-timezone errors in four untouched test files |
| Additional focused TSX typecheck | PASS: header tests, strip tests and new hook fixture, with Native asset declarations; temporary config only |
| `pnpm architecture:check` | PASS; existing grandfathered-file warnings only |
| Scoped Prettier / `git diff --check` | PASS |
| `pnpm build` | PASS: 10 targets; 9 cached. Verification build, not an Android app/device build |
| `pnpm lint` | FAIL: untouched Dashboard hooks, 9 errors / 3 warnings |
| `pnpm typecheck` | FAIL: untouched Employee Web fixtures missing timezone; Native full typecheck failure separately recorded |
| `pnpm test` | FAIL: pure workspace failures, API ownership assertion and local PostgreSQL authentication failures |
| Physical Android / screenshots / TalkBack | UNAVAILABLE: ADB has no connected device |
| Remote CI | NOT VERIFIED; no PR created |

The three Native HTTP failures are in `native-operational-http.test.ts`:
validated context, authenticated context/queue routes, and safe-GET refresh.
Operational response fixtures omit required currentLocation.timezone.
The Native type errors are in native-incident-recovery-context.test.ts,
native-push-route-denial.test.ts, native-push-route-lifecycle.test.ts and
native-shift-retirement.test.ts. A Git archive of the exact clean baseline
reproduced all three HTTP failures and the same five type errors, using the
unchanged installed workspace contracts. No worktree or baseline checkout was
created, and no failing assertions were weakened.

Root tests additionally observed two Dashboard assignment-presentation failures,
Employee Web retrieval/context failures, and a Native push-bootstrap timeout
under the broader concurrent run (not present in the standalone Native run).
API non-PostgreSQL tests had 471 passes and one Auth-module controller ownership
failure involving existing StaffActivationController. PostgreSQL projects could
not initialize: password authentication failed for local user `valet` (28P01).
These untouched paths were left outside this task; broader gates were run once.
Root failure does not provide a complete pass count for interrupted packages.

Command logs and the baseline archive are local, task-specific ignored evidence
under `.tmp/VAL-250-252-validation/` and `.tmp/VAL-250-252-baseline/`; no credentials
or environment contents were copied into this document.

## Exact file inventory

Modified, all under `apps/valet-native/`:

- src/employee-ui/employee-action-icons.tsx
- src/employee-ui/employee-frame.tsx
- src/employee-ui/employee-icons.tsx
- src/shell/native-account-menu-styles.ts
- src/shell/native-account-menu.tsx
- src/shell/native-active-header-utilities.tsx
- src/shift/native-shift-summary-details.tsx
- src/tasks/native-task-shift-strip.tsx
- src/tasks/native-tasks-panel.tsx
- test/employee-shell-contract.test.mjs
- test/native-active-header-parity.test.tsx
- test/native-task-shift-strip.test.tsx
- test/native-tasks-panel.test.tsx

New files:

- apps/valet-native/src/shift/native-shift-duration.ts
- apps/valet-native/src/tasks/use-native-task-shift-duration.ts
- apps/valet-native/test/native-shift-strip-render-fixture.tsx
- docs/validation/ISSUE_250_252_NATIVE_SHELL_POLISH.md

## VAYLET review record

Review target: baseline SHA above to final task diff for #250/#251/#252. Issues
were re-read before commit. Contracts checked: latest owner brief, AGENTS,
DEC-032/071/072/081, Native execution plan, Blueprint bridge, engineering/security,
DoD and code-structure rules. VAYLET review matrix and evidence gates applied.

Findings: no scoped implementation defect identified. NOTE: baseline Native and
broader gate failures remain. NOTE: physical visual/accessibility evidence open.
This is a self-review and does not replace human cross-review.

- Security & tenant/location: unchanged authoritative scope projection; no
  protected mutation or new resource lookup. Existing authority gates retained.
- Retry/concurrency & DB: no command, write, migration, retry or DB change.
- Abstraction compatibility: formatter grammar preserved with old export;
  existing callers covered. Icon uses existing dependency and token contracts.
- Audit/privacy: no logging, audit or persistence changes; internal scope IDs
  absent from strip text and accessibility labels in focused tests.
- Downstream consumers: Native presentation only; shared contracts untouched.
- Architecture/300-line: PASS; largest modified authored code file is 272 lines;
  no baseline exception, dependency change or generic timer framework.
- Test adequacy: deterministic minute/resume/start/locale/cleanup cases, combined
  gear/header locales, preserved style contracts and authoritative strip gating.
  Simulated host-element tests do not prove Yoga/device rendering or TalkBack.
- Scope leakage: none in final file inventory; Web, Dashboard, Customer, API,
  database, packages, lockfile, logo, navigation and menu-sheet UI untouched.
- Gate evidence: local results above; no green full-suite or CI claim.

Owner merge decision — 2026-10-03: the scoped #250/#251/#252 code is approved
for direct merge. The failing broad gates are reproduced baseline/unrelated failures,
and full Android packaging plus physical-device EN/AR/minute-advance/TalkBack proof
are intentionally deferred to the Native batch closure gate rather than blocking
this focused code merge. This does not convert unavailable physical evidence into
PASS and does not mark the three issues production-acceptance complete.
