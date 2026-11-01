# E-001 current emergency User-disable strict RED — reproduced after isolated build

**Current security result: CONFIRMED VULNERABILITY — strict RED FAIL 1/1**, exit 1. This is **not** a passing security test or a repaired U-002 result. Source baseline before test-only changes `9079706ad322e87f6f33fb61335fdc3b6bfd2528`. Verified 2026-10-31 UTC.

## Exact execution and preflight distinction

1. Initial task-owned run `ba613741dc804e9f9d7670bf1792bdb1` exited 1 **BLOCKED** with `Owned API peers require compiled API and contracts artifacts`. No protected-response race ran. PG17 stopped, owned cluster removed, and test source was unchanged. This is not an E001 RED finding.
2. Existing pinned builds, no dependency changes: `pnpm --filter @valet/contracts build` **PASS** and `pnpm --filter @valet/api build` **PASS**. Three harness-required files were confirmed under `packages/contracts/dist` and `apps/api/dist`; generated files are ignored and not staged.
3. Definitive authenticated run on a **new owned PostgreSQL17** cluster:
   `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/issue333/run-owned-postgres.ps1 -Suite issue333 -TestFile test/dashboard-issue333-u002-emergency.integration.test.ts`.
   Run ID `f77cffe4a02b4164b6c71dbac854d228`; local ignored sanitized output `tmp/issue-333-w6-evidence/f77cffe4a02b4164b6c71dbac854d228/tests.txt` lines13–45. Private listener port **51971**, PG server version code **170011**, witness backend PID **31024**; **two actual compiled Nest API PIDs 26928/29364** and real supported security-disable CLI calls. The two API processes and SQL writer were controlled test identities, not mocked Promise callbacks.

## Actual ordered witness

| Event/branch | Exact observed |
| --- | --- |
| Reader first, prepared private Location response | Test gate at **23:47:22.027Z**; reader authenticated before disable |
| Canonical global security-disable CLI | Started **23:47:22.277Z**, exited **23:47:22.775Z** |
| Independent persisted authority after COMMIT | Witness at **23:47:22.806Z**, **User disabled** and relevant session/push invalidated/audit confirmed through test fixture |
| Old protected HTTP delivery | Server response finished at **23:47:22.811Z** (**5 ms after persisted disable witness**), **HTTP200**, private Location marker delivered (**true**) |
| Emergency-first fresh request | **HTTP401**, `privateLocationSent=false` |
| Retry after caller lost acknowledgement | Retry exited **23:47:23.162Z**, persisted disabled true, **auditCount=1**; this simulates lost *consumer/CLI success output*, **not** a genuine PostgreSQL COMMIT-ACK loss |
| Client disconnect | `AbortError`, `closeFinished=false`, `laterFinish=false` before disable exit; this narrower branch does not prove remote live-replica fencing |
| Queued admission / User lock | Real advisory waiting with `pg_blocking_pids` recorded; after disable, queued read **HTTP401**, no private marker |
| Strict line | `apps/api/test/dashboard-issue333-u002-emergency.integration.test.ts:243`, unchanged original `expect(result.body).not.toContain(first.location.name)` FAILED. Suite **1 file, 1 test, FAIL**, exit1 |

The authoritative order is persisted User disable (including Staff session revocation/audit) **before** the protected old HTTP200 finishes. It violates DEC-081's current-access requirement. A correct fresh401 or queued401 is **not** proof that the old current response was safe.

Cleanup: private runner verified **0 child databases / 0 other connections**, stopped PostgreSQL, and reported `removed=True` for its **own new cluster**. Neither run touched the historical retained W3 PostgreSQL artifact. No credentials, tokens, MFA secrets or raw production data are included in this report.

## Limits and classification

This is a **reproduction of current runtime security RED** in two genuine API processes, a real canonical global disable and task-owned PostgreSQL17. It did **not** inject a live but coordinator-partitioned API, an actual PostgreSQL COMMIT acknowledgement loss, network-fence failure, or any approved new response-delivery protocol. Those design candidates remain **UNVERIFIED**. The prior W3 and two Prime E001 runs on immutable 907 are preserved and independently consistent with this new result.
