# Issue #300 — independent runtime test design and lease gates

This describes tests awaiting a frozen G2 candidate. **None of the following DB/HTTP/load
scenarios has been executed by W7.** The W7 oracle's eight passing Node tests prove only
the reference's expected behavior, never the production service.

## Actual source writers (read-only code evidence)

| Family | Existing writer/source to drive | Required discriminators |
| --- | --- | --- |
| Key custody | `apps/api/src/modules/keys/key-custody-event-writer.ts`; `assign-key-slot-command.ts:112,120`; `parking/confirm-parked-command.ts` | Persisted event slot, actor, clear+assign separate rows, optional checkout under DEC-068 |
| Dispatch | `dispatch/dispatch-event-writer.ts:13-29`; `queue-parking-task-command.ts:86-108` | QUEUED, nullable actor, prior/new assignee vs mutation actor, Task relation |
| Audit and release | `retrieval/complete-handoff-audit.ts:35-65`; `guest-retrieval-request-command.ts`; `parking/confirm-parked-audit.ts` | Distinct release/completion even at equal time; consumed verification does not imply release |
| Incident | `incidents/incident-reporting-command.ts:183-187` | Persisted Incident + separate `INCIDENT_OPENED` Audit, reporter, no invented resolution |
| Identity correction | `vehicles/vehicle-identity-command.ts` | Explicit current identity label and direct Session link; no historical plate snapshot |

All source paths are existing writers and outside W7 editing permission. The snapshot
and row projection must be verified against the actual G2 schema, not this design.

## Priority acceptance lanes

1. **Historical fact/adversarial writer:** T01,T03,T04,T06,T08,T10,T13,T18,T21,T24,T30,T35,T38,T68.
   Drive API commands under separate operational staff credentials, then query by a
   distinct CA/LM management session. Persist source IDs before reading. Include
   high-reuse slot K→clear→K, no-checkout normal park, QUEUED without Audit, null actor,
   changed assignee, reported Incident and equal-time release/completion. Compare
   independently expected `(source,id,time,actor,participant)` sets.
2. **DB correctness:** T12,T15,T25,T37,T39,T40. Use scoped direct/entity/Task
   overlap with Audit ID dedup; malformed links and cross-tenant metadata must not
   be attributed. Assert `[from,to)` down to milliseconds, ordered source rank and
   cursor tuple, no loss or duplication after pagination.
3. **Snapshot races:** T41–T44. Open connection A with an uncommitted insert that
   carries an early event timestamp, capture page 1 on connection B, then commit A.
   Page 2 must not admit an event invisible to the original database snapshot.
   Repeat with live-current plate/name changes; assert disclosed restart semantics,
   not an invented immutable current-identity snapshot. Legacy birth-null rows
   stay distinct; never backfill fabricated XIDs.
4. **Security/privacy:** T20,T26,T28,T29,T45–T55,T61,T66,T69.
   Repeat every search/selector/timeline/detail under CA with valid/expired MFA,
   LM with granted/revoked Location, Supervisor, Employee, guest and forged source ID.
   Capture status/no-store/request-ID/redaction; compare Audit/Custody/Dispatch/
   Incident row counts before/after GET. A legitimate CA activity timestamp update
   is excluded from the zero-domain-write assertion but may not refresh MFA.
5. **Browser truth:** T27,T36,T47,T56–T60,T70. Only after Prime's browser lease;
   use G2 real API data and existing shell, 320/390/768/1440 EN/AR and effective
   200% zoom. Assert no stale drawer after scope revocation or session replacement,
   focus return, non-overlap and native Audit Events parity. Critically, a
   **DEMO DATA / fictional / no API** notice is **FAIL** if actual authenticated
   Investigation API records are being displayed. The new conditional Playwright
   `issue300-live-disclosure.spec.ts` detects this without touching frozen JSX.
6. **Capacity/migration:** T62–T65. Disposable 100k then at least 1m mixed source
   records with one skewed Location/slot and at least five concurrent readers plus
   active writer. Record hardware, roles, precise row/DB size, `EXPLAIN (ANALYZE,
   BUFFERS)`, p50/p95/max, query count, writer latency and lock waits. Verify
   fresh/upgrade, interrupted rollout and runtime grant behavior if U05 is used.

## Resource preflight, current blocker

Prime reported that initialization of a wholly disposable PG17 cluster at port
`55430` was **blocked by safety checks**. This is a provisioning restriction,
not a failed product test. No fallback to an unknown cluster, local port 5432 or
the existing shared `valet` DB is authorized. W7 requires a Prime-supplied
**exclusive disposable DB lease** proving unique name, controlled process/port
and owner, migration version, DB/runtime roles, creation and cleanup authority,
plus the exact G2 SHA and managed API/browser runtime lease. Stop if any identity
cannot be established. All dependent ledger rows remain GAP.
