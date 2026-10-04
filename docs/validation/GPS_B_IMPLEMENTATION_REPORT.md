# GPS-B — Issue #257 implementation and evidence

Independent review handoff, 2026-10-04. Authority: Accepted DEC-099/100 and
`docs/NATIVE_261_262_264_257_IMPLEMENTATION_PLAN.md`. This report accompanies the
GPS-B implementation commit; its final SHA and verified remote SHA are supplied
in the final Git handoff. No merge or production activation is represented.

## A. Git

- Actual fetched task-start main: `168da01e6822049ee0a45eebec4780c5b2b1fbd9`.
- Initial native Windows working tree was clean; branch created from that main:
  `codex/native-257-presence-enforcement`.
- GPS-A migrations 058/059 were present and unchanged; DEC-099/100 were Accepted.
  Main had SQL OFF gating and no public GPS-B surface. Issue #257 was read.
- Commit/push target: `origin/codex/native-257-presence-enforcement`. Exact final
  local/remote SHA and clean working-tree observation belong to the final handoff.
- No PR, merge, Issue closure, GPS-C or #262 work.

## B. Public contract

The complete literal route, success status, request/response schema and error
catalog is frozen in [GPS_B_PUBLIC_CONTRACT.md](GPS_B_PUBLIC_CONTRACT.md).

Operational prefix `/v1/staff/shifts/presence`: POST `challenges`; GET
`operations/:operationId`; GET `operations/:operationId/challenge`; POST
`operations/:operationId/exception`; GET `exceptions/:exceptionId`.
Existing POST `/v1/staff/shifts/start` and `/v1/staff/shifts/:shiftId/end` accept
optional typed evidence; successful legacy response shapes are unchanged.

CA prefix `/v1/staff/management/organizations/:organizationId/shift-presence`:
Company GET `policy`, PUT `policy/default`, GET `results/:mutationId`.
Exact Location surfaces are beneath CA `locations/:locationId` or LM
`/v1/staff/dashboard/locations/:locationId/configuration/shift-presence`.
They expose policy read/SET/CLEAR, readiness, bounded zone list/exact read/create/
update, bounded exception queue/history/exact read/approve/reject, exact results.
Lists use UUID cursors, default limit 25, maximum 100. No ordinary delete.

Shared strict schemas live in `packages/contracts/src/shift-presence-public.ts`,
`shift-presence-result.ts`, `shift-presence-management.ts` and
`shift-presence-public-errors.ts`. Transport rejects client authority/inside flags,
generic states and free-text exception notes. Controlled reasons remain
LOCATION_UNAVAILABLE/GPS_UNAVAILABLE/OUTSIDE_ZONE/AMBIGUOUS_FIX.
The error catalog has 16 public presence codes; scope mismatch is concealed as
404 AUTHORIZATION_DENIED. Legacy cash/work/auth errors retain their mappings.

Operational recovery is PENDING, EXPIRED or a RECOVERABLE exact terminal result,
with immutable Start or End response reconstruction and controlled denial reason.
Changed evidence/cash/target under an existing identity conflicts. Management
correlation uses the dispatched mutation UUID as safe audit identity and checks
exact actor/tenant/Location/entity/type. COMMITTED proves that mutation's audit;
UNKNOWN carries current authorized canonical state and null attribution facts.
No-op/equal values cannot prove success. Reads never replay protected writes.

## C. Database

| Forward migration                           | Purpose                                                                                                                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 060 `shift_presence_authority_denial`       | Typed Operation denial reason and one-time request-policy digest; typed Exception expiry cause; immutable guards and narrow current-approver early-expiry command.                                        |
| 061 `shift_presence_policy_commands`        | Replace GPS-A OFF-only checks with OFF/WARN_ONLY checks; keep REQUIRE/REQUIRE_OR_OVERRIDE SQL-closed. Exact-session/MFA/authority protected one-field policy command, positive CAS and atomic safe audit. |
| 062 `shift_presence_retention_execution`    | Owner-only bounded expiry/purge, independent Exception terminalization and preserved Decision history.                                                                                                    |
| 063 `shift_presence_management_entitlement` | Narrow authorized subscription row locking without granting runtime UPDATE on the read-only commercial table.                                                                                             |

Early revocation expiry preserves reviewer User/member, reviewedAt and expiresAt;
actual terminalAt starts retention. The five existing Exception states remain.
Runtime cannot write expiry provenance directly. The atomic DENIED result requires
matching early-expiry provenance; no Shift effect or consumption is recorded.
No raw evidence/request JSON is added. Digests stay only on the 90-day Operation.

The three narrow operational/management definer functions have private EXECUTE
grants and fixed search paths. Runtime has no maintenance EXECUTE, DELETE,
TRUNCATE or trigger-helper execution; immutable column restrictions remain.
Privilege verification checks actual function owners, PUBLIC ACLs and every
table/column grant. All historical migration files remain unchanged.

Fresh-database contexts run versioned Prisma migrate deploy and runtime provision.
The representative upgrade test executes unchanged real SQL through 059, seeds
existing OFF policy/Operation/Challenge/Exception, then executes 060–063 and
checks preserved data, new nullable facts and closed strict constraints.

## D. Start

The command takes settings/lifecycle guards, proves exact current session and
ordinary persisted Start authority, resolves a committed exact attempt first,
then locks the membership's ACTIVE Shift. Same-Location ACTIVE convergence
returns that existing Shift without consuming a new challenge or adding Decision/
SHIFT_STARTED. Another Location remains a conflict.

For a new Shift it resolves current policy/zones, proves any required exception
authority, locks Operation → Challenge → Exception, binds the exact attempt,
evaluates, creates Shift, appends minimized Decision, consumes evidence/approved
exception, completes Operation and appends exactly one SHIFT_STARTED in one
transaction. Session is rechecked before commit, including concurrent-start
unique-index recovery. Denied presence produces no Shift/success audit.
Owned revoked-approval terminalization is a narrow denial path that grants no
Start authority even when the target Organization/Location has become ineligible.

| Mode                | Existing-client / evidence behavior                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| OFF                 | Legacy request keeps ordinary behavior without requiring a digest key. Evidence, when supplied, is scoped and may journal truthful minimized facts. |
| WARN_ONLY           | Missing evidence uses an internal MISSING attempt and truthful unverified classification; ordinary guards still apply. Valid evidence is evaluated. |
| REQUIRE             | Missing, unusable, outside or ambiguous evidence is denied by the server command.                                                                   |
| REQUIRE_OR_OVERRIDE | Accepted measured evidence or exact live approved exception with DEC-100 current authority; missing evidence cannot bypass.                         |

All strict enforcement tests use disposable owner fixtures. Production strict
policy remains closed; headers/User-Agent/device/client version cannot bypass.

## E. End

End proves active User and exact persisted own Shift/operational membership role,
then locks that Shift. It resolves a committed exact attempt and already-ended
recovery before new cash/work processing. Safe-own-End retains detached/inactive
membership or revoked-access cleanup under ordinary OFF behavior.

For ACTIVE Shift, cash parsing/precision/currency and canonical
ASSIGNED/ACCEPTED/IN_PROGRESS work blockers precede evidence consumption.
Only then does presence evaluate; cash is derived and the Shift/cash snapshot,
Decision, challenge/exception/result and exactly one SHIFT_ENDED commit together.
Cash/work/audit/later failures roll back all effects. Same-operation changed cash
conflicts; identical cash/evidence recovers. Exception-use End additionally requires
active requester membership and exact access under DEC-100. Force-end remains a
separate existing command and was regression-tested.

## F. Exceptions

Request binds requester User/member/tenant/Location/action/exact END Shift,
Operation/Challenge and one controlled reason. It creates no Shift or approval.
Duplicate exact request converges; changed reason conflicts. Owned status
reauthorizes before allowlisted disclosure.

Review requires current exact-session sensitive MFA and current CA or exact active
LM authority, a different requester User, positive revision, PENDING/live exact
Operation/Challenge/Exception and action-appropriate requester eligibility. It
locks and checks fresh database time after waits, then changes review state and
safe management audit atomically. No Supervisor/Employee approval power.

Consumption protects current active requester facts and the original approver's
current active User and CA-for-Organization OR exact-LM-for-Location capability.
Current role may change between the two valid capabilities. Original logout,
session expiry and MFA age do not revoke approval. Real User/member/access/target
authority loss expires APPROVED → EXPIRED, denies the exact Operation with
APPROVER_AUTHORITY_REVOKED and writes one safe terminal audit atomically, without
Shift effect or consumption. Contention is BUSY with rollback, never fake revocation.
Committed history remains recoverable after later authority changes.
Timed expiry is independently executed by privileged maintenance, including
Exceptions whose Operation already terminalized or Challenge was purged.

## G. Management

Company policy changes one typed field under positive presence revision. Location
SET/CLEAR uses its own revision plus expected Company revision and active-zone
configuration fingerprint; CLEAR inherits the current default, while explicit OFF
remains an override. Policy no-ops create neither revision nor fictitious audit.
Zones have independent positive revisions, scoped create/update/state commands
and no normal delete; they do not increment Location policy revision.

Readiness derives current effective policy, active validated circular zones,
paired revisions, fingerprint and authoritative observedAt. It separates usable
configuration from strict release; strictActivationAllowed is always false.
Valid bounded circles remain intrinsically usable after a valid move/shrink;
current employee fixes are reevaluated against the changed geometry. Invalid
coordinates/radii cannot be saved; disabling the last usable strict zone fails.
Existing currency/timezone lifecycle readiness remains intact.

Configuration writers acquire exclusive Organization settings before lifecycle;
Company writers resolve all persisted Locations, including inactive setup, and
take lifecycle guards in sorted persisted-ID order. Creation/activation joins the
same settings boundary, preventing escaping new inheritors. Currency correction's
former lifecycle-before-settings inversion is corrected. No unbounded API fanout.

The complete transaction protects current session/User/member, Organization,
commercial subscription, exact Location/access and referenced MFA factor. CA may
configure inactive setup; LM requires exact active target/access. Sensitive MFA
and exact session are refreshed against database time before commit. The same
authority wrapper governs reads and reconciliation; no client tenant claim is
trusted as ownership.

## H. Concurrency proof

All matrix races use real PostgreSQL transactions and lock-wait witnesses.
COMMIT and ROLLBACK execute the real SQL outcome. UNKNOWN executes COMMIT then
injects acknowledgement loss; exact database/audit/result reads decide truth.
The helper never sleeps to manufacture a race or automatically replays a command.
Below, audit counts describe new effects; preexisting fixture/approval history is
checked separately by the tests. Paths are relative to `apps/api/test/`.

| Race                                                                    | Serialization point                                                                                 | Winner / loser and durable facts                                                                                                                                                                                                                                                                      | Audit/result facts                                                                                                                 | Test path                                                                                           |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| R01 two policy writers                                                  | Exclusive Organization settings plus policy CAS                                                     | First committed/unknown writer yields revision 2; stale contender conflicts. First rollback lets contender win from revision 1.                                                                                                                                                                       | Exactly one change audit; first mutation attributable only after commit.                                                           | `shift-presence-configuration-races.integration.test.ts`                                            |
| R02 two zone writers                                                    | Settings guard plus exact zone CAS                                                                  | One revision-2 winner; stale writer cannot overwrite. Rollback lets other edit win.                                                                                                                                                                                                                   | One zone audit, Location policy revision unchanged; exact UUID result.                                                             | Same configuration-races file                                                                       |
| R03 edit vs disable                                                     | Same zone/settings boundary                                                                         | Commit/unknown retains first ACTIVE edit; rollback permits DISABLED contender.                                                                                                                                                                                                                        | Exactly one real update audit and canonical zone state.                                                                            | Same configuration-races file                                                                       |
| R04 last zone disable vs strict entry                                   | Shared configuration snapshot behind exclusive settings                                             | Disable commit/unknown leaves no usable zone: strict NOT_READY. Rollback leaves usable zone: strict RELEASE_CLOSED. Company stays OFF/revision 1.                                                                                                                                                     | No strict policy audit; only committed zone delta.                                                                                 | `shift-presence-readiness-races.integration.test.ts`                                                |
| R05 Company strict/default vs inheriting Location                       | Settings serialization and sorted lifecycle guards; Location create joins settings                  | Committed/unknown new inheritor has no zone and cannot escape fanout. Rollback excludes it; strict release still closed.                                                                                                                                                                              | Correct creation cardinality; no stranded strict policy/audit.                                                                     | Same readiness-races file                                                                           |
| R06 CLEAR vs Company change                                             | Settings guard, paired revisions and zone fingerprint                                               | Company commit/unknown makes old inherited context conflict. Rollback permits CLEAR against original context.                                                                                                                                                                                         | Company/Location revisions and each mutation audit/result checked.                                                                 | `shift-presence-configuration-races.integration.test.ts`                                            |
| R07 approve vs reject                                                   | Protected reviewer/session/member rows then Operation → Challenge → Exception/CAS                   | Commit/unknown approval wins at revision 2; rejection conflicts. Rollback permits rejection. No Shift.                                                                                                                                                                                                | One approve or reject audit, exact first-mutation attribution.                                                                     | `shift-presence-authority-races.integration.test.ts`                                                |
| R08 approve vs expiry                                                   | Actual Operation row wait and database wall clock                                                   | After expiry all blocker outcomes reject review; no approval, then maintenance expires pending Exception at revision 2.                                                                                                                                                                               | Zero approval audit/Shift effect; UNKNOWN acknowledgement explicitly lost.                                                         | `shift-presence-expiry-races.integration.test.ts`                                                   |
| R09 review vs revocation                                                | Actual staff invalidator plus protected requester authority rows/Organization boundary              | Revocation commit/unknown denies review; rollback permits one approval.                                                                                                                                                                                                                               | Correct revoked-access facts, zero ghost approval/Shift.                                                                           | `shift-presence-authority-races.integration.test.ts`                                                |
| R10 exact token replacement                                             | Existing staff User security boundary and exact session identity                                    | Replacement commit/unknown fences stale context with 401, no policy write. Rollback permits revision-2 WARN_ONLY.                                                                                                                                                                                     | Zero/one policy audit respectively; acknowledgement loss injected after real commit.                                               | `shift-presence-session-races.integration.test.ts`                                                  |
| R11 consumption vs original approver revoke, START and END, both orders | Early common staff boundary plus nonblocking original User/member/access proof, held through commit | Revoke-first while staged is BUSY; after commit/unknown, explicit attempted consumption yields EXPIRED revision 3 + DENIED, no new Shift effect. Rollback permits consume. Consume-first commits/unknown consumes once; later revoke preserves history. Rolled-back consume remains PENDING/APPROVED. | Zero/one Decision/real Shift event as appropriate; expiry audit exactly once for real denial, never for busy or valid consumption. | `shift-presence-authority-races.integration.test.ts`, `shift-presence-approver.integration.test.ts` |
| R12 move/shrink/disable last usable zones                               | Exclusive settings before zone write; operation evaluates only coherent current zones               | Move/shrink commit/unknown denies the issued old fix; rollback allows one Start. Two disables cannot leave zero usable strict zones.                                                                                                                                                                  | Zone revision/audit and Shift/Decision/event cardinalities checked for every outcome.                                              | `shift-presence-zone-evaluation-races.integration.test.ts`                                          |
| LM authority revoked during zone write                                  | Actual StaffManagementMutationService grant revoke and protected writer interval                    | Committed/unknown zone edit stands before later revocation; rollback removes it; future LM write denied.                                                                                                                                                                                              | Zone revision/label, grant fact, zero/one update audit.                                                                            | `shift-presence-current-authority-races.integration.test.ts`                                        |
| Membership deactivated during policy write                              | Actual staff status command, common Organization guard and protected member                         | Writer commit/unknown yields revision 2 before deactivation; rollback leaves revision 1; future writer denied.                                                                                                                                                                                        | Correct policy and zero/one audit.                                                                                                 | Same current-authority-races file                                                                   |
| Location lifecycle vs configuration                                     | Lifecycle guard and current exact LM scope                                                          | Deactivation commit/unknown denies pending LM create; rollback permits it.                                                                                                                                                                                                                            | Correct lifecycle state and zero/one zone-create audit.                                                                            | Same current-authority-races file                                                                   |
| Currency/settings inversion                                             | Settings guard acquired before lifecycle                                                            | Real currency correction waits at settings while configuration owns it, then completes without old cycle.                                                                                                                                                                                             | USD correction, one currency audit and normal policy effect.                                                                       | `shift-presence-readiness-races.integration.test.ts`                                                |

## I. Privacy

Raw employee GPS durable storage added: **NO**. Coordinates are transient inputs
to validation/geometry/HMAC only. Operation stores keyed digests under its bounded
retention; Decision/Exception history, audit and management history contain no raw
latitude/longitude, exact accuracy/distance, capturedAt or request payload.
Configured zone centers are allowed configuration data.

Raw employee GPS in audit: **NO**. Writers use typed safe entity/scope/revision/
state/field/revocation reason only. Projection discards hostile metadata and invalid
values even on allowlisted keys. No free-text note or label/center enters audit.
Raw employee GPS in observer/log inputs: **NO** in the exercised HTTP paths;
observer spy checks actual emitted payloads, and error logging uses safe operation
and request identity. No new body logging exists.
Raw employee GPS in public responses: **NO**; strict schemas and explicit projections
exclude it. Zone responses intentionally contain configured centers.

## J. Retention

Executor: `pnpm --filter @valet/database shift-presence:maintain`, using trusted
MIGRATION_DATABASE_URL and existing production TLS policy. Runtime credentials
are rejected. It invokes owner-only `shift_presence_maintain(1000)`, at most 20
batches, reporting aggregate counts only. Backlog requires subsequent operator runs.
No scheduler, queue, archive or runtime deletion privilege was introduced.

Exact recovery ends at terminalAt+14 days; terminal Operation/digests purge at
terminalAt+90 UTC days. Consumed Challenge is immediately eligible; unconsumed
Challenge at expiresAt+24h. Decision retention is decidedAt+24 UTC calendar months;
terminal Exception retention is terminalAt+24 UTC calendar months. Independent
Exception expiry starts its real terminal clock even after ephemeral state is gone.
Live Decision references are protected; deleting ephemeral rows does not delete
independent Decision identity/result/history. Actual CLI, owner purge eligibility,
runtime denial, 14/90-day boundaries and 24-month independent history are tested.

Deployments must provision a persistent protected HMAC key and retained rotation
keys and arrange controlled operator execution cadence before a later strict release.
This branch provides the executable mechanism and keeps strict rollout closed.

## K. Exact validation ledger

PostgreSQL command prefix, from repository root in PowerShell:

```powershell
$env:TEST_DATABASE_URL = Get-Content -LiteralPath 'C:/Users/LP/.codex/tmp/gpsb-verification-url.txt' -Raw
pnpm --filter @valet/api exec node ../../scripts/test-harness/run-owned-tests.mjs api vitest.config.mjs <files>
```

The disposable verification URL was generated for the task, kept outside the
repository and never printed. It is removed after testing; future runs supply
their own disposable TEST_DATABASE_URL. PostgreSQL 16 ran in the explicitly
task-owned Docker container on port 55439. All harness runs cleaned their databases,
roles and children. The preexisting unrelated database service was not changed.

The first regression command selected all then-existing `test/shift-presence*.test.ts`
plus these exact regression arguments:

```text
test/shift-start.integration.test.ts
test/shift-end.integration.test.ts
test/shift-eligibility.integration.test.ts
test/shift-cash-reconciliation.integration.test.ts
test/shift-api.integration.test.ts
test/staff-shift-force-end.integration.test.ts
test/staff-shift-force-end-scope.integration.test.ts
test/staff-shift-force-end-audit.integration.test.ts
test/management-settings.integration.test.ts
test/management-settings-concurrency.integration.test.ts
test/management-location-lifecycle.integration.test.ts
test/management-location-preactivation.integration.test.ts
test/management-location-currency-correction.integration.test.ts
test/management-location-timezone-correction.integration.test.ts
test/management-location-idempotency-readiness.integration.test.ts
test/management-location-races.integration.test.ts
test/management-audit-projection.integration.test.ts
test/management-audit-privacy.integration.test.ts
test/feature-module-ownership.test.ts
```

Initial GPS-B selection comprised approver, authority-races, configuration-races,
current-authority-races, enforcement, evaluator, exceptions, expiry-races, failure,
fingerprint, forward-migration, foundation, HTTP, maintenance, management-authority,
management, readiness-races, recovery, retention, session-races, zone-evaluation-races.
These are literal `test/shift-presence-<name>.integration.test.ts`, except evaluator,
fingerprint and retention use `.test.ts`, HTTP is `http`, and authority/management
names match the inventory. Results: **28 race-profile files / 171 passed tests**;
**8 standard-profile files / 61 passed tests**. Non-PostgreSQL results: **38 passed,
3 failed across 4 files**. The three failures are preexisting stale assertions in
feature-module-ownership for Parking, Auth and Check-In (see M), not GPS-B logic.

Subsequent targeted commands used the same prefix and the following exact groups:

| File arguments (all `test/`, common `shift-presence-` prefix unless stated)                                                                                                                                                                                                                                                                                                                                           | Actual observed result                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `negative.integration.test.ts management-failure.integration.test.ts zone-evaluation-races.integration.test.ts`, plus `test/presence-api-errors.test.ts` and `module-ownership.test.ts`                                                                                                                                                                                                                               | 12 standard tests, 6 grouped zone tests, 19 unit tests passed.                                                                                               |
| `configuration-races.integration.test.ts current-authority-races.integration.test.ts readiness-races.integration.test.ts zone-evaluation-races.integration.test.ts maintenance.integration.test.ts management.integration.test.ts enforcement.integration.test.ts http.integration.test.ts evaluator.test.ts fingerprint.test.ts retention.test.ts module-ownership.test.ts`, plus `test/presence-api-errors.test.ts` | 37 race tests passed, 1 grouped SHRINK timeout; 23 standard and 47 unit tests passed. No timeout increased; zone outcomes were split into independent cases. |
| `zone-evaluation-races.integration.test.ts management-http-recovery.integration.test.ts`                                                                                                                                                                                                                                                                                                                              | **10 race tests and 4 standard tests passed** after the split; all six move/shrink commit/rollback/unknown variants preserved.                               |
| `maintenance.integration.test.ts maintenance-expiry.integration.test.ts forward-migration.integration.test.ts expiry-races.integration.test.ts`                                                                                                                                                                                                                                                                       | 12 passed, 1 aggregate-key ordering expectation failed while the correction was being saved. Actual maintenance/new expiry/upgrade behavior passed.          |
| `maintenance.integration.test.ts`                                                                                                                                                                                                                                                                                                                                                                                     | **5 passed**, including exact corrected CLI aggregate keys.                                                                                                  |
| `session-races.integration.test.ts expiry-races.integration.test.ts`                                                                                                                                                                                                                                                                                                                                                  | **7 passed** with explicit acknowledgement-loss injection for UNKNOWN.                                                                                       |
| `negative.integration.test.ts audit-projection.test.ts`                                                                                                                                                                                                                                                                                                                                                               | **10 standard tests and 2 unit tests passed**; includes same-User/different-membership denial and hostile audit projection controls.                         |

Database commands, using the same disposable environment:

```powershell
pnpm --filter @valet/database exec node ../../scripts/test-harness/run-owned-tests.mjs database vitest.config.mjs src/shift-presence-persistence.integration.test.ts src/shift-presence-runtime-role.integration.test.ts src/shift-presence-privacy.integration.test.ts
pnpm --filter @valet/database exec node ../../scripts/test-harness/run-owned-tests.mjs database vitest.config.mjs src/shift-presence-persistence.integration.test.ts src/shift-presence-release-gate.integration.test.ts
```

Results: **18 passed in 3 files**, then **8 passed in 2 files** after extracting the
release gate to preserve the 300-line ceiling. The former OFF-only test now checks
GPS-B WARN_ONLY permission and continued strict denial; 058/059 SQL is unchanged.

Contracts:

```powershell
pnpm --filter @valet/contracts exec vitest run src/shift-presence-public.test.ts src/shift-presence.test.ts src/management-audit.test.ts
```

Final result **29 passed in 3 files**. Initial stale event-count expectation was
reconciled to the actual 100-event catalog, including GPS-B's seven safe events.

Static/build commands:

```powershell
pnpm --filter @valet/api typecheck
pnpm --filter @valet/contracts typecheck
pnpm --filter @valet/database typecheck
$env:MIGRATION_DATABASE_URL = Get-Content -LiteralPath 'C:/Users/LP/.codex/tmp/gpsb-verification-url.txt' -Raw
pnpm --filter @valet/database prisma:validate
pnpm --filter @valet/contracts build
pnpm --filter @valet/api build
node scripts/gps-b-validation.mjs
git diff --check
```

Final scoped typecheck/build/schema/structure/import/format/lint/diff commands pass. The final API typecheck caught an inferred UUID-template type in a test-helper parameter; an explicit string parameter fixed it, followed by a passing typecheck and all 10 negative tests. The scoped validator covers **95 authored files / 107 owned files**. Prisma's first invocation lacked
MIGRATION_DATABASE_URL; the configured invocation passes. Initial lint unused
omission bindings and script Node globals were fixed without suppressions; final
lint passes with zero warnings. The scoped validator checks every changed authored
file's 300-line ceiling, repository import policy, formatting, ESLint, diff whitespace,
scope and unchanged historical migrations. Full repository architecture scanning
was deliberately not run because it would read forbidden Employee Web source.
No architecture baseline was weakened. The existing harness emits DEP0190; no
timeout, race assertion, privacy assertion, CI or ownership rule was weakened.

| Evidence level         | Reached scope                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IMPLEMENTED            | All GPS-B backend capabilities, four forward migrations, controlled operator executor.                                                                                                                                                                                                                                                                                                                                       |
| STATIC VERIFIED        | Scoped lint/format/structure/imports/diff, three package typechecks, Prisma schema and API/contracts builds.                                                                                                                                                                                                                                                                                                                 |
| LOCAL COMMAND VERIFIED | Focused contracts/API/database/regression commands and forward migrations above.                                                                                                                                                                                                                                                                                                                                             |
| RUNTIME VERIFIED       | Disposable PostgreSQL 16, actual runtime grants, Nest HTTP routes, operator CLI and row/audit facts. Full production deployment was not exercised.                                                                                                                                                                                                                                                                           |
| FAILURE VERIFIED       | Actual owned PostgreSQL connection terminated before COMMIT; no ghost Shift/result. HTTP disconnect/malformed response after commit; exact recovery with no replay. Management audit INSERT failure rolls back policy/zone/review. Failed reconciliation remains unresolved. UNKNOWN race acknowledgement loss after real commit. Fresh Nest application reconstruction preserves zone/review recovery. No OS SIGKILL claim. |
| CI VERIFIED            | **NO** — no actual remote CI run was observed or claimed.                                                                                                                                                                                                                                                                                                                                                                    |
| PHYSICAL VERIFIED      | **NO** — no Native/device/client work belongs to GPS-B.                                                                                                                                                                                                                                                                                                                                                                      |

## L. Scope assertions

| Question                                | Answer                                      |
| --------------------------------------- | ------------------------------------------- |
| Native changed?                         | NO                                          |
| Dashboard UI changed?                   | NO                                          |
| Employee Web read?                      | NO                                          |
| Employee Web changed?                   | NO                                          |
| Start Shift behavior changed?           | YES — accepted server presence composition. |
| End Shift behavior changed?             | YES — accepted server presence composition. |
| Old OFF behavior preserved?             | YES                                         |
| Public presence routes added?           | YES                                         |
| Management presence routes added?       | YES — backend only.                         |
| New forward migration added?            | YES — 060–063.                              |
| Historical migration changed?           | NO                                          |
| Raw employee GPS durable storage added? | NO                                          |
| Strict production rollout enabled?      | NO                                          |
| #262 changed?                           | NO                                          |
| GPS-C started?                          | NO                                          |
| PR created?                             | NO                                          |
| Merge performed?                        | NO                                          |
| Issue #257 closed?                      | NO                                          |

## M. Review and remaining gates

Review target: complete GPS-B working diff/new files against fetched main above;
Accepted DEC-099/100, canonical plan, schema/security/DoD/structure rules and
actual helper/writer/invalidator implementations. VAYLET code-review's scope,
contract, mutation-order, authorization, concurrency, abstraction, audit/privacy,
downstream, architecture, test, consistency and failure-evidence passes applied.

The retention review finding (Exception could remain nonterminal after a terminal
Operation/Challenge purge) is fixed and regression-tested. Grouped zone timeout
was fixed by independent cases without increasing timeout or weakening barriers.
Initial lint/schema environment/event count/aggregate ordering failures are resolved.
No known substantive GPS-B authority, concurrency, privacy, reconciliation,
retention, readiness or old-client bypass finding remains.

The broader existing feature-module-ownership test has **three unrelated stale
baseline assertions**: it omits Cancellation/SpotValidation in Parking,
StaffActivation in Auth, and CancelCheckIn in Check-In. Those module declarations
and corresponding expectations exist in the recorded main baseline; GPS-B changes
only its Shift expectation. This is a real repository gate failure, not an
environment limitation, and is disclosed for the independent reviewer. No unrelated
module/test repair was silently included. The focused GPS-B ownership tests pass. Final source comparison proved the three baseline modules and corresponding assertion blocks unchanged. A final `pnpm --filter @valet/api exec vitest run --config vitest.config.mjs --project api-non-postgres test/feature-module-ownership.test.ts -t "keeps Shift ownership focused"` passed 1 selected test; the other 12 tests were not selected, not claimed to pass.
Full repository CI/architecture/client builds cannot be called green from this work.

Security/tenant verdict: reviewed exact actor/tenant/Location/ownership proof before
each protected effect; IDOR, disabled actor, stale session/MFA and role negatives.
Retry/DB verdict: reviewed exact results and actual races/rollback; history/grants
verified. Abstraction verdict: real Shift writer remains Shift-only; typed management
audit uses real scope. Audit/privacy verdict: minimized immutable history, no raw fix
storage/logging/projection. Downstream verdict: shared strict contracts and existing
Nest services supply GPS-C/D independently of UI. Architecture verdict: scoped
structure/import/lint checks pass without baseline exceptions. Test adequacy:
focused GPS-B matrix passes; the unrelated baseline module gate remains reported.
Scope leakage: no forbidden source read/change or client/rollout work.

Deployment gates remain protected HMAC provisioning/rotation, controlled maintenance
cadence and independent review/remote CI before any merge/release. Strict rollout
remains closed; GPS-C/D and physical #262 evidence are separate predecessor gates.

Merge verdict: **BLOCK MERGE** until independent review, required actual CI and the
reported repository baseline gate are resolved. This handoff requests independent
GPS-B review; it does not supply merge or production readiness approval.
