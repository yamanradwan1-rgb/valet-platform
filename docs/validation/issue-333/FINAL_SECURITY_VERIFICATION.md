# Issue #333 — security verification and owner handoff

> **Later Owner contract — 2026-10-31:** U-001 has now been accepted in
> [DEC-108](../../decisions/DEC-108_LOCATION_ACCESS_REVOCATION_DELIVERY.md).
> The earlier classifications and unresolved-U-001 statements below are the
> preserved evidence snapshot from commit `22360d666539f1817ea1dc221f53e17d2a2c4b86`.
> Current conclusions, the P1-B follow-up and the conditional remediation plan
> are maintained in [U001 Owner contract and remediation](U001_OWNER_CONTRACT_AND_REMEDIATION.md).

Status: **repeatable security RED observations; accepted in-flight grant contract requires Owner decision; Issue remains open**. Baseline `c638a437749cae1f78a8c8a417fd4d53e6a34920` from freshly fetched `origin/main` on 2026-10-31. Worktree `tmp/issue-333-prime`, dedicated branch `audit/issue-333-authorization-concurrency-verification`. This is development PostgreSQL evidence, not production certification.

## 1. Repository facts discovered

- Owner repository: `yamanradwan1-rgb/valet-platform`; #333 open, #319 accepted/closed. Baseline verified against origin after fetch; the owner's last observed SHA matched.
- An existing main workspace had two untracked owner documents. Both were preserved. Prime and each attempted worker had independent task worktrees at the verified baseline; no user branch reset, deletion, or force push occurred.
- Prime integrated the narrow verification commits `c6362cd3` (PG lab), `65b707d2` (P1-B source/blocker report), and `20df84ff` (P1-C tests/evidence). Additional P1-A and P1-B tests, private-suite CI ownership registration, and final evidence are Prime-owned.
- W1 independently audited contracts and test claims. W3, W4, W6 completed scoped work. W2, W5, W7 attempted but failed to start due to worker browser handoff; Prime independently audited P1-A and Priority 2. Do not count seven successful worker reviews.
- Final HEAD, remote SHA, clean state and UTC handoff time must be recorded after commit/push, not inferred from these source-evidence notes.

## 2. Binding requirements

- Accepted DEC-023 governs PostgreSQL-backed Staff session resolution; **some already-resolved logout requests can finish**. It does not establish unlimited survival of a revoked Location grant.
- Accepted DEC-049, DEC-078, DEC-080, DEC-081, DEC-084 and DEC-094 govern Live Map eligibility, Staff session/MFA, Company Admin, canonical Staff Management writers, contact privacy, and inactive historical Location visibility. See `source-audit.md` for route/source crosswalk.
- The #315/#319 regression and object-scope contracts remain binding. The #319 inventory of 40 Dashboard, 45 Management and four adjacent GET route patterns is an **inventory**, not 89 separately induced races.
- All Dashboard UI, Policies Studio, #321 integration, production authorizers, roles, MFA, API contracts, schema/migrations, audit semantics, business states and configuration were frozen. Tests use synthetic identities and private marker values; committed evidence contains no raw bearer tokens, MFA secrets, production connection data or customer records.

## 3. Existing implementation patterns

| Family | Actual reader | Canonical invalidating writer | Snapshot / protection |
| --- | --- | --- | --- |
| P1-A | `GET /v1/staff/locations/:locationId/live-operations-map`; tracking controller, `live-map-query.ts`, `live-map-read-authorization.ts` | MFA-authenticated CA Staff Management Location grant revoke, role/status, Shift/session writers | One `REPEATABLE READ` read transaction; exact LM grant authorization, then vehicle/GPS projection in the same snapshot; no matching grant writer fence demonstrated. |
| P1-B | `GET /v1/staff/dashboard/organizations` and `.../:organizationId/locations`; `dashboard-scope-discovery.service.ts` | MFA-authenticated Staff Management grant/role/status, Location lifecycle, session writers | Explicit session recheck; subsequent `READ COMMITTED` membership/grant projections without a retained staff-management advisory fence. |
| P1-C | Management contact search, customer visits, vehicle visits; `management-visit-contact-authorization.ts` and service | Real MFA-authenticated CA Staff Management revoke endpoint | `READ COMMITTED` aggregate LM grant set captured before private contact/history projection; no grant lock across the latter. |

Canonical grant revoke: `POST /v1/staff/management/organizations/:organizationId/staff/:membershipId/location-access/revoke`; the real HTTP writer authenticates and authorizes a CA, requires sensitive MFA, checks target/version, uses an organization-wide exclusive advisory serialization scope, commits audit and persisted grant change together, and returns `201` in the successful labs. Test fixture inserts only establish initial synthetic rows; **race invalidation uses the canonical writer**.

## 4. LOCKED decisions

The reader must belong to the correct Organization and exact granted Location where the role requires it; Company Admin authorization includes session-bound MFA; Supervisor Live Map eligibility includes an active eligible Shift; private contact projections exclude foreign tenants and ungranted Locations. Session revocation blocks *future* resolution. Standard role/grant changes use the accepted Staff Management transaction, version and audit semantics. Historical visits at a still-granted inactive Location may be authorized. Sources: `docs/08_DECISIONS_LOG.md`, focused Accepted DEC-049/078/080/081/084/094 and `docs/validation/issue-319/`.

## 5. DERIVED conclusions

- A transaction snapshot can retain authorization state across another connection's committed writer. The reader's authorization and data projection must be inspected together; an HTTP `200` or green characterization test alone proves nothing about private contents.
- Historical #319 remediated adjacent Physical/Configuration paths with shared authorization fences, showing that this codebase has established writer/reader serializing mechanisms. That does not automatically extend their locks to Live Map or Visit Contacts.
- P1-A reader-first and three P1-C route-specific reader-first schedules **returned private Location data after a canonical grant revoke committed**; fresh reads removed access. PostgreSQL PID/snapshot/ordering, actual bodies and writer commit were captured. These are RED observations. Whether each ordinary in-flight request violates the exact adopted policy needs the owner's U-001 clarification; independent reviewer assesses the remaining Location-disclosure boundary as P2, not proven cross-tenant/P1.
- P1-B **in-flight** behavior is UNVERIFIED: source inspection found a possible fence gap, but W3 SQL barriers were not reached. Fresh multi-Organization/Location and MFA checks are meaningful narrower evidence.

## 6. UNRESOLVED decisions

- **U-001 — ordinary Location grant revocation linearization:** Must a previously authorized reader's private projection be fenced until the reader finishes, so a canonical revoke cannot commit before disclosure, or is a response from an already-authorized read permitted to complete after ordinary revoke? DEC-023 explicitly addresses Staff *session* logout; DEC-081 distinguishes immediate emergency disable but does not unambiguously settle every ordinary in-flight grant reader. Owner must confirm the accepted rule before approving a production remediation. Preserve immediate emergency/security-disable requirements.
- **U-002 — scope of follow-up verification:** Prioritize P1-B deterministic service-level interception; extend role downgrade, membership deactivation, Supervisor Shift, session/MFA replacement, multi-reader and unknown-commit/retry/deadlock branches after confirming canonical writer/linearization expectations. Untested cases must remain UNVERIFIED.
- **U-003 — preserved W3 private test artifact:** One failed W3 teardown left a *stopped*, task-owned cluster with one child test database and zero active connections. The safety guard retained its directory and raw local logs. Owner should direct deliberate investigation/cleanup; no automatic deletion is authorized by this verification report.

## 7. Risks / boundary violations

| Finding | Priority | Proven behavior | Contract and limit |
| --- | --- | --- | --- |
| F333-A (Live Map) | **UNVERIFIED** accepted-contract classification; P2 candidate, RED observed | Reader holds RR snapshot and returns synthetic protected vehicle data after authenticated canonical grant revoke `201` and persisted grant=0; fresh read `404`. | Granted-Location Live Map confidentiality, DEC-049/081. Reader started authorized; ordinary in-flight linearization U-001 is material. No cross-tenant read observed. |
| F333-C (Visit Contacts) | **UNVERIFIED** accepted-contract classification; P2 candidate, RED reproducible | Three private routes each return a synthetic Location A contact/visit marker after canonical revoke committed, while a fresh LM response excludes it. Five independent local runs reproduced 3 strict RED assertions each. | Contact and visit Location scope, DEC-084/081. U-001 governs timing interpretation. No production data or P0/P1 exploit established. |
| F333-B (Dashboard Scope Discovery) | UNVERIFIED | Source candidate for stale aggregate Location scope; failed SQL test barrier means no deterministic reader-first result. | Fresh negatives safe only for tested requests; cannot infer race safety or defect. |
| Harness status | P3 verification gap | W3 second attempt timed out in fixture teardown and retained one child DB; #321-origin test-file classification expects 42, discovers 43. | These are test-harness defects/limits, not proof of a production authorization defect; no unrelated harness baseline was altered. |
| CI private-suite integration | Resolved P2 review blocker | Independent reviewer found Issue #333 tests would enter default API Vitest projects and fail their strict private PostgreSQL attestation in CI. | Scoped classifier and API Vitest config now own W6/Prime and W4 Issue #333 tests separately as **opt-in private projects**. A new Node test proves ordinary CI projects exclude every Issue #333 private file; Issue #319's own routing is unchanged. |

No observed foreign-tenant disclosure, unauthorized same-Organization ungranted Location read, password-only CA grant mutation, or production MFA bypass. These negatives apply only to the actual exercised HTTP routes and schedules.

## 8. Proposed implementation plan

Verification implementation is confined to `apps/api/test/dashboard-issue333-*`, `apps/api/test/issue333-w4-*`, a guarded task-owned PostgreSQL runner, narrow **test-only** registration in `apps/api/vitest.config.mjs` and `scripts/test-harness/test-classification.mjs` with a dedicated classification test, and `docs/validation/issue-333/`. The focused evidence includes source inventory, deterministic lock/timeout/cancel proof, authenticated reader/writer races, fresh negatives and explicit unverified cases. An independent reviewer inspected the integrated delta and identified the private-suite registration gap; that gap has now been fixed and requires final delta review.

**Conditional only, not approved for execution:** After U-001 is resolved, examine a narrowly scoped authorization lifetime/fence for Live Map's RR transaction and Visit Contacts' grant-scope to projection handoff, in the established Staff Management writer lock domain or an equivalent accepted mechanism. Preserve tenant/Location/MFA/session semantics; test reader-first/revoker-first with real canonical HTTP and PostgreSQL, cancellations, rollback/unknown outcomes, pool/lock cleanup, regression suites and bounded latency. Production code, grants, policy, API, schema, migration and UI remain unchanged under #333.

## 9. Test matrix

The authoritative run ledger is below. A PASS for orchestration or characterization never upgrades a RED disclosure to safe.

| Boundary / schedule | Observed test and status | Raw local log / sanitized evidence |
| --- | --- | --- |
| Historical #315 | **PASS 28/28**, four files, real private PostgreSQL, all child DBs/connections 0 and cluster removed. | `tmp/issue-333-w6-evidence/1ee01444ff6e4b3682332e997a77cedb/` (ignored) |
| Historical #319 | **PASS 89/89**, 20 files, canonical F319-01/02 regression in both schedules, real private PostgreSQL, all child DBs/connections 0, cluster removed. | `tmp/issue-333-w6-evidence/840f73fdac2d4db693426383009e1064/` (ignored) |
| P1-A Live Map revoker-first / fresh scope negatives | **VERIFIED SAFE IN TESTED CONTRACT**, real authenticated LM and CA MFA HTTP, grant=0, fresh `404`, foreign/ungranted `404`. | `p1a-live-map-evidence.md` |
| P1-A Live Map reader-first | **RED observed**, HTTP `200` with synthetic vehicle after canonical revoke commit, then fresh `404`; observational Vitest case passed its trace assertions. | `p1a-live-map-evidence.md`; native PG RR PID 7280 / snapshot `1906:1906:` |
| P1-B in-flight grant/role/deactivation | **BLOCKED / UNVERIFIED**; W3 service SQL barrier never reached; second teardown left one owned child DB; safety guard retained stopped cluster. | `w3-scope-discovery/source-and-blocker-report.md` |
| P1-B fresh multi-Org/grant/MFA negatives | Initial W3 **PASS 3/3**; Prime independent scope-negatives **PASS 3/3** in Issue #333 11-test suite. | W3 report; `tmp/issue-333-w6-evidence/801bd948557247929d27fc6021eff5e0/` (ignored) |
| P1-C Contact search/customer visits/vehicle visits reader-first | **RED 3 strict failures + 2 positives in each of five W4/Prime private PG runs**; canonical `201`, grant=0, old body marker present, fresh body marker absent. Independent Prime rerun exit **1** due to exactly three security-negative assertions, with owned cleanup verified. | `w4-visit-contacts/reproduction.md`; Prime `tmp/issue-333-w4-private/evidence/issue333w4-8c70415fc99048978245cb84887ad5f0/` (ignored) |
| Two SHARED PG readers/EXCLUSIVE writer, lock timeout, cancellation, injected SQLSTATE | W6 private PostgreSQL **PASS 4/4**: real advisory blocker graph; real `55P03`, `57014` and pool rollback/reuse; `40001` injected, *not* naturally induced. | `w6/README.md`, ignored W6 native PG lab evidence |
| Focused #333 W6, P1-A, P1-B private suite | **PASS 11/11**, four files, 73.08 seconds, native private PG17, child DBs/connections 0 and directory removed. **Includes P1-A observational RED** and must not be read as 11 safe security outcomes. | `tmp/issue-333-w6-evidence/801bd948557247929d27fc6021eff5e0/` (ignored); Live Map PID `29332`, RR snapshot `1906:1906:` |
| CI ownership regression | **PASS 2/2** Node tests: synthetic classifier assigns all private files to specific owners; actual default CI Vitest config excludes Issue #333 cases. | `node --test scripts/test-harness/issue333-private-classification.test.mjs` |
| #321 historical harness classification | **FAIL 11 pass / 1 fail**, expected PostgreSQL test file count 42 vs observed 43; replicated on baseline-compatible W6 worktree. No waiver applied. | `node --test scripts/test-harness/classification.test.mjs`, expected 42 / actual 43 |
| Unknown writer commit, true `40001` serialization, deadlock/retry exhaustion, two HTTP readers/one revoker, simultaneous role/grant revoke, reader disconnect and several session/Shift branches | **NOT RUN / UNVERIFIED**, not covered by harness SQLSTATE injection or unrelated #319 cases. | Explicit coverage limit; no invented HTTP codes |

## 10. Files expected to change

Only test-only `apps/api/test/dashboard-issue333-*`, `apps/api/test/issue333-w4-*`, `scripts/validation/issue333/run-owned-postgres.ps1`, private-suite selection in `apps/api/vitest.config.mjs` and `scripts/test-harness/test-classification.mjs` with its new dedicated test, and sanitized `docs/validation/issue-333/**`. Reviewed runtime readers/writers include tracking Live Map, Dashboard Scope Discovery, Management Visit Contact and Staff Management grant/membership/session/MFA paths; **they remain untouched**. `apps/dashboard/**`, shared UI, schema, migrations, package manifests/lockfiles and infrastructure config are outside the actual patch. Conditional remediation targets are tracked above, without code changes.

## 11. Explicitly out of scope

Production runtime remediation, stronger or altered authority policy, new endpoints/public contracts, roles, grants, MFA/session rules, DB schema/migrations, Dashboard/Policies Studio/UI changes, privileged grants, deployment, PR, merge and issue closure. Raw private lab secrets/data are ignored and not committed; no production/shared QA database is accessed.

## 12. Ready-to-implement verdict

**DECISION REQUIRED** for any runtime remediation: U-001 ordinary in-flight grant revocation semantics must be resolved, and a separate Owner GO is required to modify production authorizers. The verification-only tests/docs are within already authorized Issue #333 scope. Security verification conclusion: **SECURITY VERIFICATION INCOMPLETE**. Actual post-commit protected data disclosures are confirmed as *observed behavior*, but **CONFIRMED VULNERABILITY** is deliberately withheld until an Accepted rule establishes that these already-authorized ordinary in-flight responses violate policy. W3 and other requested branch schedules are also unexercised. Keep #333 **open** pending owner review. No PR, merge, deployment or issue closure.

## Final validation and push ledger

At baseline plus verification-only changes: `pnpm architecture:check` **PASS** (existing grandfathered warnings only), `pnpm --filter @valet/api typecheck` **PASS**, root `pnpm lint` **PASS 11/11 package tasks**, root `pnpm build` **PASS 10/10 build tasks**, changed-test formatting corrected with Prettier, and native PostgreSQL private tests as recorded above. Historical `node --test scripts/test-harness/classification.test.mjs` **FAIL 11/12** because existing `database-postgres-direct` expectation 42 differs from observed 43; independently reproducible before new CI ownership registration and explicitly **not waived**. The new Issue #333-specific classification tests are **PASS 2/2**. The fifth independent P1-C security RED test is intentionally **FAIL 3/5 assertions (2 positives PASS)**, exit 1; cleanup 0 child DBs/0 child connections, cluster removed. Local private raw logs are ignored; this sanitized report is the portable review artifact. The final commit/remote SHA and UTC verification time are supplied in the Owner handoff after push, avoiding a self-referential SHA in this committed file.

### Exact command ledger

All commands below ran on the owner's Windows host in isolated `/valet-platform/tmp/issue-333-prime` at source baseline `c638a437` plus the verification-only branch changes. Real DB tests used *distinct random* owner-attested localhost PostgreSQL 17.11 clusters. Earlier W3/W4 worker evidence ran from their own isolated worktrees, as documented separately.

| Exact command | Status | Test count or scope | Local ignored evidence / limit |
| --- | --- | --- | --- |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite baseline` | PASS | 28/28; four #315 files | `tmp/issue-333-w6-evidence/1ee01444ff6e4b3682332e997a77cedb/`; cleaned |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite audit` | PASS | 89/89; 20 #319 files | `tmp/issue-333-w6-evidence/840f73fdac2d4db693426383009e1064/`; cleaned |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite issue333` | PASS **orchestration only**; P1-A RED observed | 11/11; four #333 W6/P1-A/P1-B files | `tmp/issue-333-w6-evidence/801bd948557247929d27fc6021eff5e0/`; cleaned |
| `powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-333/w4-visit-contacts/run-private-lab.ps1` | **FAIL / 3 SECURITY RED** | 2 positives passed, three strict sentinel negatives failed | `tmp/issue-333-w4-private/evidence/issue333w4-8c70415fc99048978245cb84887ad5f0/`; cleaned |
| `node --test scripts/test-harness/issue333-private-classification.test.mjs` | PASS | 2/2; includes actual ordinary CI config exclusion | No PG required |
| `node --test scripts/test-harness/classification.test.mjs` | FAIL (pre-existing #321-era issue) | 11/12, 42 expected versus 43 observed database-direct tests | No waiver, no assertion count change |
| `pnpm architecture:check` | PASS | New files within 300-line ceiling | Existing grandfathered source warnings only |
| `pnpm --filter @valet/api typecheck` | PASS | API TypeScript | No generated changes to production source |
| `pnpm lint` | PASS | 11/11 tasks, nine cache hits on most recent initial run | Source/CI classification changes rechecked separately |
| `pnpm build` | PASS | 10/10 tasks | Next.js transient `next-env.d.ts` generation was removed; final Dashboard diff empty |
| `git diff --cached --check` | PASS | Issue #333 verification-only staged patch | No whitespace errors |

Prettier passed for new test sources and verification documents. A strict whole-changed-file format check reports the two existing **legacy** files `apps/api/vitest.config.mjs` and `scripts/test-harness/test-classification.mjs` as unformatted; wholesale formatting the classifier expands it to approximately 313 lines, violating the 300-line architecture policy. Only the narrow six-line classification and 24-line private-project registration amendments were made. This partial formatting gate is disclosed rather than waived or hidden. No inherited #321 CI waiver applies.
