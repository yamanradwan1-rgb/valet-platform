# Issue #300 — W7 independent wave-0 QA handoff

**Worktree:** `D:/kndoom/valet-platform/tmp/issue-300-w7-qa`

**Branch/base:** `codex/issue-300-w7-qa` / `2f1311575507eae06c6166270e748687762fb508`
**Scope:** new W7-exclusive acceptance files only. No UI, writers, contracts,
backend feature code, DB schema, migration or root harness changes.

## Observed checks

| Level | Command / evidence | Outcome | Scope of claim |
| --- | --- | --- | --- |
| STATIC / G0 | `node scripts/validation/issue300/verify-frozen-ui.mjs "<prime-root>" "<G0-manifest>"` | **PASS**, 124/124 SHA matches; exit 0 | Inspected Prime G0 tree at execution instant only |
| ORACLE | `node --test apps/api/test/issue300-acceptance/independent-oracle.test.mjs` | **PASS**, 10/10; exit 0 | Synthetic reference facts; no domain writers |
| STATIC / lease guard | `node --test packages/database/test/issue300/disposable-lease-guard.test.mjs` | **PASS**, 5/5; exit 0 | Only shape/DSN refusal; not DB ownership proof |
| STATIC / ledger | `node scripts/validation/issue300/build-ledger.mjs` | **PASS**, exactly 70 ordered T rows; exit 0 | Criteria complete, each runtime status GAP |
| STATIC runner | `node scripts/validation/issue300/run-static-qa.mjs` | **PASS**; exit 0 | Runs the two Node suites and ledger check; does not contact PostgreSQL |
| Dashboard TypeScript | `pnpm --dir apps/dashboard typecheck` | **ENV GAP**, exit 1: `tsc` not found, `node_modules` absent | No assertion about code correctness |
| DB/actual writers/HTTP/load | No command run | **GAP** | Prime reports disposable PG17 port 55430 provisioning blocked |
| Browser/real disclosure | Future `apps/dashboard/e2e/issue300-live-disclosure.spec.ts` | **GAP** | Requires G2, authenticated disposable CA/LM session and exclusive browser lease |

## Critical acceptance handoff

The approved frozen `apps/dashboard/src/features/audit/audit-page.tsx:88-93`
labels the Investigation view **DEMO DATA**, says event references are
fictional and **no real customer records or Investigation API queries** occur.
When real APIs replace the local demo source, those words would become false.
The conditional Playwright test explicitly fails if a successful authenticated
`/audit-investigations/` response coexists with that claim or a fixture ID.
The Owner's absolute no-copy/no-UI-change freeze prohibits W7 from changing
this notice. **Prime/Owner decision required before declaring real-data G2 ready.**

Source oracle covers historical A→B→C slot sequence, separate in-window
slot/employee witnesses, QUEUED null actor, reassignment actor vs assignees,
task completion actor vs current assignee, same-time release+completion,
distinct Incident/Audit creation records, inclusive/exclusive time edges,
full-timeline events outside the discovery interval and tenant isolation.
These are test expectations, **not proof** that the new feature implements them.

The lease guard's positive test uses invented inert text/PID and never connects.
It is a preflight rejector, not Prime's creation/ownership proof. Any future
actual-DB run still requires independently validated process/cluster ownership,
explicit exclusive permission and G2 candidate/runtime identity.

## Next acceptance prerequisites

Prime to publish G1 contracts/guard, U05 migration disposition and precise
source-writer integration commitments; then pin G2 source SHA and real runtime
identities. Prime must obtain an explicitly owned disposable PostgreSQL lease
and acceptance browser lease, avoiding all existing shared resources. Only then
W7 will execute T01–T70 levels with written observations and change GAP rows
using candidate-specific commands, timestamps and evidence. No P0/P1 waiver
or feature-accepted conclusion is made by this report.
