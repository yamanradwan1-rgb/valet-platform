# Issue #408 — Prime adversarial self-review

This is implementer self-review using the VAYLET Code Review skill, not independent
COS approval. Independent review is BLOCKED by `tunnel_client_not_seen` on all three
configured endpoints. Evidence: [implementation report](ISSUE_408_IMPLEMENTATION_REPORT.md).

## 1. Review target

Base `0a1d7420c9690d15c9765f9624e6d8e7c2470294` to the delivered local feature commit,
branch `feat/408-mfa-self-service-disable`. Tracked diff, every new source/test/SQL
file, staged manifest, module wiring, existing runtime transaction/outcome helper,
account-security writer/function, schema, assurance and recovery callers reviewed.

## 2. Decision/docs checked

AGENTS, primary 20-document binding read set, relevant focused Accepted Decisions,
DEC-078/079/080/081/108, actual #408 package and owner's final U/C approvals.
[Accepted amendment](ISSUE_408_MFA_DISABLE_CONTRACT.md) governs the narrow policy change.
No active contract choice remains unresolved; historical alternatives in the reviewed
package are not treated as authority.

## 3. Findings, ordered by severity

No open confirmed in-scope BLOCKER/MAJOR/MINOR from this self-review.
No independent P0/P1/P2/P3 verdict is available.

| Fixed finding                                                                             | Severity  | Remediation and evidence                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A failed try-lock could escape as 409 busy even when ROLLBACK response was unavailable.   | MAJOR /P1 | Service only reports busy after observed rollback; unknown outcome becomes 5xx. Real PostgreSQL proxy test drops rollback response and proves no false busy.                                                          |
| Account-policy snapshot correctness depended on database default isolation.               | MAJOR /P1 | Explicit READ COMMITTED before transaction reads; complete FK/membership/Organization locks preserve check/write boundary. Real policy race suites pass.                                                              |
| Asynchronous confirmation open left the cancel focus target disabled when dialog mounted. | MINOR /P2 | Explicit focus restoration to surviving trigger;8 locale/theme/viewport keyboard cases pass.                                                                                                                          |
| Background forced state refresh could clear freshly disclosed one-time recovery codes.    | MINOR /P2 | While an existing ceremony is active, background attention reads availability only. Explicit code acknowledgment forces canonical state read. Existing MFA/#409 regressions and full re-enrollment browser case pass. |

NOTEs: unrelated Hybrid Dispatch inventory assertion and 12 s HTTP socket failure
reproduce at the exact base. Their fixes are outside #408. Browser CDN 403 required a
system-Chromium adapter, without weakening assertions or increasing test timeouts.

## 4. Security and tenant/location verdict

Locally supported. A stolen session alone cannot retire a factor; unused current
TOTP is mandatory regardless of existing assurance. Target comes from exact persisted
User/session. Substituting a foreign factor UUID only compares against caller's own
factor and returns neutral state-changed; two-principal HTTP test proves no foreign
transition. No tenant/Location identifier or fictitious audit scope is introduced.
Account-wide mandate includes every active Company Admin scope; lower membership
selection cannot bypass it. All-user ceremony eligibility grants no Management or
field authority. Existing platform identity and mandatory-MFA guards are unchanged.

Authorization-before-mutation: authenticated principal → active User/exact session
locks → complete persisted membership/Organization mandate → own current factor lock
and expected-ID comparison → pending reservation/audit lock → current clock/session
and unused TOTP → guarded retirement → limiter success/audit → COMMIT. Admission
reservation is separately bounded anti-abuse bookkeeping, not factor mutation.
Retries and reconciliation re-prove authentication and ownership before protected state.

## 5. Retry/concurrency and DB verdict

Locally supported, with no exhaustive scheduling claim. Six mutation cases:
first success 200; repeated/stale/post-success calls 409; concurrent identical calls
one 200 plus 409 busy/state-changed; conflicting commands preserve current factor and
audit cardinality; changed-payload request-identity case is inapplicable because the
accepted API has no idempotency key. No request is automatically replayed.

New path tries existing account advisory lock, User UPDATE NOWAIT, exact session
UPDATE NOWAIT, MFA try-lock, all memberships SHARE NOWAIT sorted, all referenced
Organizations SHARE NOWAIT sorted, factor UPDATE NOWAIT, pending limiter UPDATE
NOWAIT, audit UUID try-lock. User row conflicts with immediate membership-FK key-share,
closing new-membership/reparent insertion gaps. Locked membership role/status and
Organization status cannot change through commit. Real insert-first, promotion,
activation/revocation, commit/rollback and advisory/row contention tests support this.
Opposing existing orders fail/roll back the new transaction instead of waiting on a
new advisory/row lock. Explicit READ COMMITTED avoids stale default-isolation snapshots.

NOWAIT row locking does not claim relation-lock protection. Actual factor/audit table
waits are bounded by runtime budgets and tested. Unknown commit and unavailable
rollback remain uncertain; real wire-proxy tests verify authoritative follow-up truth.
No additional factor index, isolation engine, token field or history cleanup is added.
Migration 107 verifies exact catalog identity/readiness and refuses unsafe nonempty
bootstrap. Real engine upgrade and runtime grants tested;106 old SQL files untouched.

## 6. Abstraction compatibility verdict

Supported. Existing Staff authentication, operation runner, HTTP mapper, TOTP crypto,
durable limiter, pg transaction observer and account-security writer are reused.
Audit accepts USER actor/subject and arbitrary validated event type without metadata;
its runtime database function supports this exact scope. No tenant writer broadening,
fake Location, new pool, duplicate coordinator or common→feature import. Existing
factor callers retain default locking. Ceremony-eligibility broadening is explicitly
owner-authorized and confined to own-account calls, not business authorization.

## 7. Audit/privacy verdict

Supported by actual SQL and failure tests. One append-only event in the same
transaction as one retirement and accepted-step/limiter update; no event for denial,
stale or repeated call. Trigger rejection rolls back the factor and proof step. Actor
and subject are authenticated User. No metadata argument exists. Generic error and
unexpected-error handling do not print proof/body/auth headers. Client code/UUID are
memory-only; storage-negative browser test and wire-fixture parser avoid Bind secrets.
Retired recovery rows remain historical but current active-factor verification rejects
them; refresh cannot renew effective MFA assurance. No operational audit is fabricated.

## 8. Downstream consumer verdict

No future consumer architecture is introduced. Existing `/state` and shared exports
remain compatible; shared strict disable schemas serve existing API/Dashboard only.
#409 standalone ceremonies retain their existing flow with disable disabled there.
No Task/Dispatch, Native or Customer dependency is pulled into this command.

## 9. Architecture/300-line verdict

PASS. All 47 changed authored JS/TS files are at most 296 physical lines; no grandfathered
file growth, baseline edits or compressed line-count exception. Controller/service,
policy/read, transaction locks/command, UI ceremony/refresh/render and test failure
fixture responsibilities are separated. Architecture gate passes with old warnings only.

## 10. Test adequacy verdict

Focused feature coverage passes:50 real API/PG cases,24 DB regression cases including
5 new migration cases,47 browser cases including existing #409/MFA, compiled 9-case
smoke,1,183 Dashboard unit tests and 541 contracts tests. Broader API/Native 97-case
run passed before final narrow hardening, followed by current 50-case run.
Regression API unit result is 1,437 pass/1 baseline fail/7 skip. Root non-Postgres
aggregate is not green; full PostgreSQL/all-E2E/remote CI not run. Browser fixtures are
not claimed as live backend integration. Push/device delivery and process SIGKILL
tests were not run. These evidence limits prevent a production or independent GO.

## 11. Scope leakage verdict

No unrelated product/auth redesign found. Existing migration inventory repair merely
adds already-authoritative 104–106 and new 107. Documentation records owner authority,
not a new agent-created DEC. Test expectation changes reflect U-002 and truthful
not-enabled wording. No dependency/lockfile/style or production configuration changes.

## 12. Gate evidence

See exact commands/counts and portable screenshots/engine results in the implementation
report. Lint 11/11, typecheck 11/11, selected builds 4/4, architecture, Prisma validation,
changed authored-file lint/format and whitespace checks pass. Existing failures are
independently reproduced on the untouched base, not hidden or relabeled as passes.
No remote CI, deployment, production authentication policy or production migration
execution is claimed. Resting visual changes are confined to the required new control
and lower-card extension, with exact unchanged pixels above it across 8 captures.

## 13. Merge verdict

**BLOCK MERGE**

Local implementation is reviewable; independent review is unavailable, broad baseline
API gates are not green, and the owner has authorized local work only. No push, PR,
merge or release recommendation is granted by this self-review. Final owner review
must assess the recorded limits and obtain the remaining independent/CI evidence.
