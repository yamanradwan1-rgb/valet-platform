# Issue #333 U-002 / W5 — CA/LM advisory lock falsification

Status: **test-only experiment; no runtime GO**.
Worktree: `D:/kndoom/valet-platform/tmp/issue-333-u002-falsif-w5-locks`;
branch `audit/issue-333-u002-falsif-w5-locks`;
baseline `a4f5f2c6589b6be01b7db99cac4e6829986007f1`.

## Contract and implementation boundary

- **LOCKED (DEC-108:15-42):** once canonical LocationAccess revoke
  commits, protected Location data cannot continue delivery to the former
  holder. The old five strict RED requests stay untouched.
- **LOCKED (DEC-081:14-34,67-97):** CA/LM sensitive management writers
  depend on persisted role, membership, grants, CAS, MFA, proper handover and
  transaction/audit authority. Emergency disable has distinct stricter rules.
- **DERIVED:** current CA `authorizeCompanyAdminManagement` acquires
  `pg_advisory_xact_lock(hashtextextended('staff-management-org:' || orgId,0))`
  after MFA and before CA membership `FOR UPDATE`
  (`management-authorization.ts:95-132`). LM management writer checks
  role hint, MFA, same EXCLUSIVE org xact advisory, then membership `FOR UPDATE`
  and active Location `FOR SHARE`
  (`staff-management-authorization.ts:37-139`).
- **PROPOSED / UNVERIFIED:** a grant-dependent reader holds session-level
  SHARED on the same org key until protected HTTP `finish`, while CA
  independently takes its existing EXCLUSIVE transaction lock. These tests
  only falsify lock compatibility, ordering and pool capacity; they are not
  proof of a production session-lock fence.
- **FORBIDDEN:** production edits; schema/migrations/DB grants; alteration of
  old RED evidence; shared/production DB; W3 PostgreSQL artifact.
  No ValetSession, Task or Dispatch state transition or configuration change.

## Planned schedules

| Case | Owned PG17 barrier | Required observations |
| --- | --- | --- |
| CA+CA | Two independent EXCLUSIVE org xact holders | Second waits on first PID, then progresses after COMMIT; no SHARED on CA path |
| CA+LM | Session SHARED LM vs CA EXCLUSIVE, both orders | Exact blocker PID, progress after owner release; no implicit upgrade |
| LM+LM / revoker waiting | Two SHARED session readers, one EXCLUSIVE writer | Writer blocked by both PIDs, then one, then zero |
| Upgrade counterexample | Two SHARED holders each request EXCLUSIVE in the same organization | Bidirectional blocker graph; naturally raised deadlock or timeout code, cleanup of both sessions |
| Role hint transition | Persisted LM hint, canonical MFA CA role update to VALET_SUPERVISOR, then fresh SHARED recheck | New persisted role, fail-closed/restart requirement; no EXCLUSIVE-under-SHARED |
| Pool max=4 | Three session SHARED readers + EXCLUSIVE waiter + fifth client | Four checked-out connections, queued acquisition timeout, bounded recovery |
| Authentic HTTP revoker | Synthetic LM SHARED session lock, canonical sensitive-MFA CA `POST /location-access/revoke` | Actual writer PID blocked; after release `201`, persisted grant count zero and version/audit effect |

Record numeric `pg_backend_pid()`, exact `pg_blocking_pids()`, PostgreSQL
SQLSTATE, `pg_stat_activity.wait_event_type`, latency bounded by explicit
timeouts and cleanup. No bearer/TOTP/password, response body, private contact,
raw database URL or bootstrap credential in committed logs.

## Isolation and reporting protocol

Run solely from this W5 worktree using the existing
`scripts/validation/issue333/run-owned-postgres.ps1` and a new
`test/dashboard-issue333-u002-locks.integration.test.ts` file selected by
its strict `-TestFile` allowlist. Helpers must be named
`apps/api/test/issue333-u002-lock*`; each new authored code file <=300 lines.
The runner must attest private PG17 owner, loopback port, data directory and
non-superuser runtime role before use, then require zero child databases/
connections, stop and remove **only this run's** own clean cluster. On RED
or failed attestation/cleanup: notify Prime immediately; stop remediation,
retain evidence. Do not touch the historical W3 cluster.

A session-lock SQL graph is **SQL-LEVEL ONLY**, even if it naturally raises
`40P01`. The separate canonical HTTP revoker test validates a real writer
blocked by a synthetic SHARED holder, **not** a protected five-route reader
or server `finish`. Unknown COMMIT, lease watchdog loss, emergency preemption,
and protected delivery are assigned to other U-002 falsification slices.

## Execution ledger — completed W5 test-only falsification

All commands executed from this isolated worktree at baseline
`a4f5f2c6589b6be01b7db99cac4e6829986007f1`. Before PostgreSQL,
`pnpm install --offline --frozen-lockfile --ignore-scripts` succeeded
(1043 reused/resolved; no downloads), `pnpm --filter @valet/api typecheck`
and scoped ESLint succeeded. A first typecheck exposed an undefined tuple
member in the test-only pool setup; fixed before running PostgreSQL.

The two **accepted** independent real PG17 executions used exactly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite issue333 -TestFile test/dashboard-issue333-u002-locks.integration.test.ts
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite issue333 -TestFile test/dashboard-issue333-u002-lock-http.integration.test.ts
```

| Test / mode | Recorded real PostgreSQL evidence | Vitest case duration | Result |
| --- | --- | ---: | --- |
| CA+CA / SQL lock schedule | EXCLUSIVE holder `30796` blocked EXCLUSIVE PID `19832`; `pg_blocking_pids(19832)=[30796]`, `wait_event_type=Lock`, then COMMIT advanced waiter | 103 ms | **PASS** |
| CA+LM / SQL lock schedule | LM SHARED `26924` blocked CA EXCLUSIVE `20988`; after release CA `20988` blocked LM `26924` in reverse order | 90 ms | **PASS** |
| LM+LM / SQL lock schedule | Both session SHARED PIDs `27904`,`2516` coexisted; EXCLUSIVE revoker `30912` blockers `[2516,27904]`, then `[2516]` after first release, then advanced | 66 ms | **PASS** |
| SHARED→EXCLUSIVE / SQL counterexample | First upgrader `12776` blocked by SHARED `31360`, second upgrade attempted; PostgreSQL returned real SQLSTATE `40P01` (deadlock). Failed lease ROLLBACK/unlock freed survivor | 64 ms | **PASS / unsafe upgrade proven** |
| Role-hint transition / canonical HTTP writer plus SQL recheck | MFA CA role HTTP `201` changed `LOCATION_MANAGER` to `VALET_SUPERVISOR`; LM hint remained stale, session SHARED PID `25316` re-read persisted role. Reader's deny/restart behavior is a test assertion, not implemented delivery behavior | 987 ms | **PASS for observed role change/recheck** |
| Pool pressure / SQL lock schedule | SHARED PIDs `28656`,`11216`,`28512`, EXCLUSIVE PID `23316` blockers `[11216,28512,28656]`; four checked out, fifth acquisition timed out at configured 650 ms, writer advanced after releases | 722 ms | **PASS / pool starvation pressure** |
| Canonical HTTP `/location-access/revoke` + synthetic SHARED holder | Authenticated MFA CA writer PID `25976` blocked on reader PID `28804` (`pg_blocking_pids=[28804]`); grant still present while blocked. Upon unlock HTTP `201`, grant count `0`, membership version increased, one `STAFF_LOCATION_ACCESS_REVOKED` audit event | 1639 ms | **PASS for actual writer fence** |

The successful SQL suite was `6/6 PASS` in 36.55 s overall,
run `259ba7c47d294a39a1d4d55555b3a5ec`, PG17 `server_version_num=170011`,
port `61969`, role `issue315_owner`, data directory
`tmp/issue-315-pg-qa/issue319-259ba7c47d294a39a1d4d55555b3a5ec/.issue315-private-cluster`.
The HTTP writer suite was `1/1 PASS` in 36.29 s overall,
run `2d0f25b552f742868b1f78e6694314a1`, PG17 `170011`, port
`62625`, same private role and separate matching random directory.
Both runs' `cleanup.txt` reads **0 child databases / 0 other database
connections**; runners reported `exit=0 removed=True` after verified stop.
Local ignored raw logs remain under `tmp/issue-333-w6-evidence/<runId>/`
(`tests.txt`, `identity.txt`, `cleanup.txt`). No credentials are copied here.

An **original RED** run is deliberately retained as failure evidence:
`96d8ed9544ca44589a801b2b253524b8`, PG17 `170011`, port `61228`.
It had **5/6 PASS**, one test `FAIL` because a simultaneous two-sided
`pg_blocking_pids` observation raced PostgreSQL's deadlock detector/timeout;
the second PID `4848` did not match before its request ended. Vitest reported
67.09 s overall, upgrade case 4144 ms, and `exit=1 removed=True` with
`cleanup.txt` **0/0**. The test-only revision first confirms one real blocker
edge, then triggers the second upgrade and requires actual `40P01` or `55P03`
plus surviving transaction progress. Original RED logs remain unmodified.

The new leases set `lock_timeout=4000ms`, `statement_timeout=6000ms`;
blocker polling is bounded to 2800 ms and pool acquisition to 650 ms in
the pressure case. Vitest timings above include setup/query overhead and
are not dedicated protected-HTTP-delivery p95 measurements.

**UNVERIFIED:** actual protected five-route reader SHARED lock ownership,
response `finish` lease release, same-owner reentrancy and read→CA upgrade
prevention in production, cancellation/unknown-commit failure ordering,
emergency-disable precedence, and end-to-end delivery after committed revoke.
No production code changed; neither this test-only SQL demonstration nor
the authentic writer test resolves U-002/DEC-108 RED or authorizes a GO.
