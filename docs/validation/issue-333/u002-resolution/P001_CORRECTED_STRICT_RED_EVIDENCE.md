# P-001 corrected numerical assertion — private PostgreSQL 17 strict RED reproduction

**Security result: FAIL 4/6 (intentional, CONFIRMED VULNERABILITY), PASS 2/6 relevant negatives.** Exit 1. This is NOT a repaired-runtime GREEN. Verification time 2026-10-31 UTC (host local Nov 1). Source baseline before test-only change `9079706ad322e87f6f33fb61335fdc3b6bfd2528`. Final test source SHA256 `7d4ce87b171355241d012b984000ded6a8178766a618b7ff766287f1118754dd`.

## Exact, reproducible command and ownership

`powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-333/w4-visit-contacts/run-private-lab.ps1`

- Worktree: `audit/issue-333-u002-resolution-prime`; task-owned Windows/PowerShell PostgreSQL **17.11**, loopback port **51008**, role `issue333_w4_owner`, new private PGDATA under `tmp/issue-333-w4-private/issue333w4-bc0fcd5495b54eaf80afd357778a234a/.issue333-w4-private-cluster`.
- Immutable private run ID `bc0fcd5495b54eaf80afd357778a234a`.
- Local ignored source-hash/identity/test/cleanup evidence: `tmp/issue-333-w4-private/evidence/issue333w4-bc0fcd5495b54eaf80afd357778a234a/`. Evidence is task-owned and synthetic; no tokens/MFA/passwords copied into Git.
- Test file `apps/api/test/issue333-w4-mixed-privacy.integration.test.ts` lines81/83 changed **only** from comparing JSON numeric counts to quoted strings, to comparing `"completedVisitCount":2` and `"completedVisitCount":1`. Original shared strict `expect(previousBody).not.toContain(privateMarker)` at `apps/api/test/issue333-w4-visit-contact-race.ts:160` remains unchanged.
- Private harness confirmed zero child databases and zero other connections (**0/0**), stopped its own PostgreSQL and returned `OWNED_CLUSTER_DIRECTORY_REMOVED=True`. The separately retained W3 artifact was **not touched or deleted**.

## Observed strict schedule and privacy witness

| Boundary | Real observation |
| --- | --- |
| Reader identity | Authenticated LM with synthetic Organization and Locations A+B; separate authenticated MFA-verified CA writer |
| Reader barrier | After `authorizeVisitContactRead` returns A+B grant scope and before C1 real aggregate SQL (no claim of after-SQL barrier) |
| Canonical writer | Actual authenticated Staff Management revoke A POST **HTTP201** |
| Persisted authority | A grant count after COMMIT **0** |
| Reader SQL | Actual PostgreSQL backend PID **29084**; `read committed`, snapshot `3132:3132:` at gate; no blocking PIDs then |
| Old reader response | HTTP **200**, synthetic A plate present, B plate present, completedVisitCount **numeric 2** |
| Fresh reader | HTTP **200**, synthetic A absent, retained B present, completedVisitCount **numeric 1** |
| Strict result | Test callback's numeric old/fresh checks passed, reaching shared **line160**; old A private sentinel then failed strict `not.toContain`, proving a real unauthorized post-COMMIT response |
| Sample timing | One mixed-case reader **131 ms**, canonical writer **84 ms**, fresh **27 ms**; **not** p50/p95 or production latency |
| C1/C2/C3 original | All three unchanged private-contact strict RED assertions also failed at helper line160 after canonical commit |
| Negative coverage | Two other W4 scope/role negative cases passed; neither proves in-flight concurrency safety |

Exact local log witness positions within `tests.txt`:
- line46 `ISSUE333_W4_CANONICAL_RACE` for P001: `revokeStatus=201`, `grantCountAfterCommit="0"`, old200/fresh200, `staleDisclosure=true`/`freshDisclosure=false`.
- line53 P001 strict failure; line66 shared strict test-helper line160.
- lines22/27/32 C1/C2/C3 canonical race booleans; lines94/116/138 corresponding unchanged strict RED.
- lines150–151: **2 files failed; 4 failed / 2 passed of 6**.
- Owned-cluster cleanup output: **0 / 0 / removed=True**.

An earlier unformatted first rerun `57e2f2fd34f041c79860482527bd043b` also produced 4 RED/2 PASS and cleanup, but this second run is authoritative for the final formatted source SHA. The historical P001 run `70b157865ca544fb8eee35d12534d15b` showed the same disclosure but failed first at a malformed quoted-numeric callback; that failure attribution is superseded. No original strict RED assertion has been weakened, skipped, reclassified as GREEN or deleted.

## Limits

This verifies the **current source violation**, not a repaired protocol. The P001 A+B SQL executes after canonical revoke because the gate is after initial authorization and before SQL. A separately held **after-aggregate-SQL** A+B response remains UNVERIFIED. There was no live-partitioned replica, cross-instance egress kill, partial-byte response, unknown COMMIT-ACK or future mechanism under test. These remain D-001/D-002/ D-005 design and future real PostgreSQL fault-injection requirements.
