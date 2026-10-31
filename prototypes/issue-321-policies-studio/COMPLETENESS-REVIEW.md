# Issue #321 — configuration completeness and prototype review

## Review target

Prototype-only addition: `prototypes/issue-321-policies-studio/`.

Verified current upstream baseline: `92638c499a1062db3f814687ca3761f235361298`. The user's original checkout remains on `main` at `eba55b76916a6892059e45622252b87483f4cb1e`, with its two existing untracked documents preserved. Delivery uses a new isolated worktree and `codex/issue-321-policies-studio`; no original worktree switch/reset/stash/clean is needed.

The current upstream settings/contract comparison includes the newer last-zone readiness feedback. The ordinary settings, operating-hours/SLA and Presence/WhatsApp input catalogs are unchanged between the original design baseline and the verified delivery baseline.

## Decision and documentation authority

The latest Owner instruction authorizes checking configuration completeness and pushing the prototype if it passes. It supersedes the initial no-push instruction only for this prototype branch. Previous Owner amendments removing Service Status/search and adding current location/section icons remain binding. No new production policy or feature is introduced.

Relevant contracts: AGENTS; source-of-truth, product scope, engineering/security rules, Definition of Done, Blueprint bridge, structure/collaboration rules; Accepted DEC-058, DEC-083, DEC-090, DEC-099/100 and DEC-105. Issue #321 supplies the design gate; #278 supplies Help semantics. The existing closed #311 does not authorize WhatsApp relocation or provider activation.

## Configuration inventory

| Area                                        | Existing configuration represented                                          | Logical fields |
| ------------------------------------------- | --------------------------------------------------------------------------- | -------------: |
| Vehicle operations                          | Photo requirement, handoff method, OCR assist, required parking spot        |              4 |
| Payments and validation                     | Service fee, payer, methods, tips, validation, release payment requirement  |              6 |
| Tracking                                    | Task-scoped tracking flag, raw GPS retention days                           |              2 |
| Language and notifications                  | Default language, employee retrieval notification, guest ready notification |              3 |
| Operating hours / SLA                       | Seven-day informational schedule; Location-only SLA target                  |              2 |
| Shift Presence                              | Independent Start and End modes, maximum accuracy, maximum fix age          |              4 |
| WhatsApp Guest Access                       | Enabled policy, language, approved template version, provider binding       |              4 |
| Attendance zone                             | Code, label, latitude, longitude, radius, ACTIVE/DISABLED                   |              6 |
| **Total in Company Admin Location context** | **All current configuration keys / zone attributes represented**            |    **31 / 31** |

Company context excludes Location-only SLA and the six zone attributes: **24 / 24**. Location Manager retains only its exact ten ordinary Location keys plus four Presence fields and six zone attributes: **20 / 20**. Company Admin authority is not assumed to imply Location Manager role inheritance.

The exact arrays, schema comparisons and 37 executed contract checks are committed in `evidence/settings-parity.json`. Counts treat the weekly schedule as one compound configuration key, not 21 separate day/time controls.

## Source trace

- Dashboard ordinary catalog and role-specific composition: `apps/dashboard/src/features/administration/settings/setting-definitions.ts`, `company-settings-panel.tsx`, `management-location-settings-panel.tsx`, `location-manager-settings-panel.tsx`, and `settings-page.tsx`.
- Backend shared catalogs/values: `packages/contracts/src/management-settings.ts`, `location-configuration.ts`, `payments.ts`, `shift-presence-management.ts`, `shift-presence-policy.ts` and `shift-presence.ts`.
- Presence authority: Dashboard LM controllers extend the shared management controllers. `presence-management-authority.ts` re-proves current actor/role/scope/access/entitlements/MFA. The prototype demonstrates presentation against synthetic capabilities; it does not replace these checks.
- Strict readiness: `apps/api/src/modules/management/presence-management-policy-command.ts` requires usable zones for every resulting strict policy, including Company fanout. `presence-management-zone-command.ts` rejects a resulting unusable strict configuration. The current Dashboard `shift-presence-zone-readiness.ts` diagnoses final-zone rejection without replaying the write.
- Zone values and case-sensitive uniqueness: `shift-presence.ts` and the committed `shift_presence_zones_code_key UNIQUE(location_id, code)` constraint in the foundation migration.
- WhatsApp: existing panel/API types and `apps/api/src/modules/notifications/whatsapp-settings-validation.ts` / `whatsapp-settings-service.ts`. Policy saves remain bundled; missing catalog/binding prevents enabling. No provider credentials or live transport are composed.
- Current-location interaction: the existing `use-attendance-zone-location.ts` hook is imported directly, preserving explicit one-shot acquisition and retirement of stale results.
- Help: existing `ContextHelp`, bilingual registry, `FocusDialog` and Save-adjacent controls are imported directly.

## Findings resolved before publication

1. The original local strict-mode simulation could save REQUIRE without a usable zone. The prototype now derives readiness from local saved state and rejects this candidate. Company changes check all affected fixture locations. Disabling the last usable zone while strict mode is effective also fails without changing saved state. Five browser scenarios verify these outcomes.
2. The original local zone duplicate check folded case, although the backend preserves case-sensitive code uniqueness. The simulation now compares trimmed codes exactly; a browser case verifies `ARRIVAL` and `arrival` remain distinct.
3. Malformed boolean editor input previously collapsed to false in the parser. Unsupported boolean text now fails validation; actual frontend values remain the existing controlled booleans.
4. Host-specific runtime/typecheck paths made the isolated source unsuitable for another checkout. Runtime source/dependency discovery and generated ignored typecheck paths now support a repository-contained prototype without modifying root dependencies or lockfiles. The packaged source was typechecked, built and browser-tested against the current upstream checkout.

No unresolved finding blocks prototype configuration coverage or publication. This is a self-review; no independent reviewer or production acceptance is claimed.

## Explicit exclusions and evidence limits

- Service Status is intentionally removed by Owner instruction, not an accidental missing setting.
- Privacy & Contact stays in its separate destination.
- Presence exception approval/rejection/history is an operational workflow, not a configuration key. This prototype does not claim to simulate that operational process.
- Actual WhatsApp catalog/connection readiness is not queried. Empty fixture lists and disabled sending are deliberate; no verified connection or approved provider asset is fabricated.
- Live API reads/writes, authentication, MFA assurance, database CAS/transactions/reconciliation/audit and provider activation are not tested or enabled by local controls.
- Mocked geolocation tests are not physical GPS/device evidence. Native browser zoom was not verified; effective-width reflow is recorded separately.
- No remote CI, PR, merge, deployment, Issue closure or Owner design approval is part of this publication.

## Review verdicts

| Review pass                      | Verdict                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Settings / enum / scope fidelity | PASS: 24/24, 31/31, 20/20 against actual current schemas                                                                       |
| Security and tenant/location     | PASS for local fixture separation and transport isolation; real authorization remains unproven and unmodified                  |
| Retry/concurrency and database   | N/A for production mutations; browser navigation/draft guards tested; no schema/migration changes                              |
| Abstraction compatibility        | PASS: direct shell/Help/geolocation reuse; no production helper broadening                                                     |
| Audit and privacy                | No production audit or custody mutation; no secrets/recipient data/provider credentials; location automation mocked            |
| Downstream boundary              | Phase B remains a separate task preserving real typed APIs, MFA, revisions, reconciliation and audit                           |
| Architecture                     | All authored files below 300 formatted physical lines; repository architecture check passes with existing grandfather warnings |
| Test adequacy                    | Current-source parity, browser interaction/matrix, location failure fencing and strict-readiness cases pass                    |
| Scope leakage                    | Only the new prototype directory; no production/root dependency/navigation changes                                             |
| Publication gate                 | PASS for prototype-only branch push                                                                                            |

## Local gate evidence

TypeScript and isolated build pass. Contract parity: 37 checks. Main browser suite: 18 flows and 261 view/edit/reflow/navigation checks, with zero page errors, failed HTTP responses, external requests, API calls or mutation requests. Current-location suite: 20 mocked/failure/responsive checks. Strict-readiness/code comparison suite: five scenarios. Curated result paths are in the README and `evidence/validation-summary.json`.

The full production workspace lint/test/build gates are not represented as run: production code is untouched and no merge is requested. The repository architecture check did run. CI is configured for main pushes and PRs into main; this isolated branch push is not a CI acceptance claim.

**Merge verdict: BLOCK MERGE into production.** The prototype publication gate passes; production integration still requires separately authorized Phase B and Owner design review.
