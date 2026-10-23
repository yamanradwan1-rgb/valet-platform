# Issue #319 — real Nest HTTP post-remediation security acceptance

Historical baseline: branch audit commit `af62a11add5d97ec291ca0dbf49fdd29be88f708`
with unmodified app source `20998a069eb5d576895c0e6c149271a4a0e4028b`.
The original `../logs/audit-tests.txt` demonstrated F319-01/F319-02 stale
HTTP 200 after a committed grant revoker, even though its 25 tests were green.
`logs/adjacent-audit-tests.txt` subsequently reproduced F319-03/F319-04
stale HTTP 200 using real Nest reader + canonical SQL grant writer. Both
negative security outcomes remain preserved in historical raw logs.

## Protected readers and expected HTTP linearization

| Path and staff principal | When valid reader's fence predates revoker | When revoker commits before unlinearized reader acquires fence | Fresh after revocation |
|---|---|---|---|
| LM Physical key-slots | HTTP 200 with synthetic key slot; real CA MFA Staff Management POST waits, then returns 201 | HTTP 404, no protected slot | HTTP 404 |
| LM Physical RR overview | HTTP 200 with correctly fenced RR snapshot; CA POST waits, then 201 | HTTP 404 with fresh RR snapshot | HTTP 404 |
| LM legacy Configuration | HTTP 200 with all ten settings, incl. synthetic saved override, before queued CA 201 | HTTP 404, no saved setting | HTTP 404 |
| LM Branding | **Verified 200**, then real MFA-assured CA HTTP revoke returns 201 after reader releases fence | **Verified 404**, sentinel absent after real CA HTTP or canonical SQL revocation | **Verified 404** |
| LM Subscription | **Verified 200**, then real MFA-assured CA HTTP revoke returns 201 after reader releases fence | **Verified 404**, subscription and Organization ID absent after real CA HTTP or canonical SQL revocation | **Verified 404** |

The first three paths passed all **six** CA HTTP real-writer race tests in
`logs/races-first-audit-tests.txt` and again in the first 52/52 full patched
suite (`logs/patched-full-audit-tests.txt`). The same full log verifies
active/grant-negative all seven Physical GET patterns sequentially; five
other Physical routes use separate reader-first canonical SQL writer tests,
not a two-direction MFA-assured HTTP writer test per endpoint.

After the Owner's explicit expansion to Branding and Subscription,
`logs/adjacent-fixed-first-audit-tests.txt` records **2 PASS / 0 FAIL**
revoker-first real Nest HTTP reader + canonical SQL writer, using the same
initial-eligibility pause and the same synthetic data as their earlier RED
reproductions. The reader receives the expected 404 without the sentinel.
Full two-direction real authenticated CA HTTP tests for both paths passed
**4/4** in `logs/adjacent-ca-races-first-audit-tests.txt`; a held reader's
PostgreSQL PID was shown in the blocked real writer's `pg_blocking_pids()`,
and a queued writer's PID preceded a waiting SHARED reader in revoker-first
cases. All four preserve exact synthetic Branding/Subscription response
shape when authorized and suppress sentinels on prior-commit revocation.

## Session, MFA, tenant isolation and limitations

`logs/patched-full-audit-tests.txt`: exact Location Manager Staff refresh
semantics verified for Overview/Physical/Discovery, stale old access bearer
freshly denied with 401, and Company Admin refresh during the READ COMMITTED
Physical check denied 401. In-flight resolved LM Overview/Physical requests
may complete under previously accepted DEC-023 boundaries; no stronger
arbitrary cancellation guarantee is claimed. Password-only CA MFA denies,
MFA-assured CA remains authorized on its proper Physical read paths; foreign
tenant and ungranted Location denied by selected tests.

The CA MFA factor-retirement test included in those 52 asserts only a
**READ COMMITTED key-slot** HTTP request after **direct synthetic SQL**
retirement, and must not be described as real MFA recovery or RR overview
coverage. The independent reviewer requested a separate RR overview test
using canonical MFA recovery HTTP, an observable PostgreSQL snapshot and
post-commit factor state. Its result is decisive for any broad CA/MFA claim.

After separate Owner GO, the canonical CA recovery RR test was run unchanged
and is **1/1 PASS** on the corrected Physical Overview: its held pre-MFA RR
snapshot and real committed factor retirement now result in **HTTP 403** and
`containsSyntheticKeySlot=false` (original RED had HTTP 200 and `true`).
`logs/ca-rr-mfa-fixed-audit-tests.txt` preserves actual observed ordering.
An additional **2/2 PASS** HTTP race suite
(`logs/ca-rr-mfa-concurrency-audit-tests.txt`) exercises reader-first and
revoker-first with distinct same-user Staff sessions, actual MFA recovery,
exact PostgreSQL `pg_blocking_pids()` evidence, still-eligible CA 200 and
freshly denied 403. These facts establish **this** CA RR Physical Overview
boundary; they do not cover every other CA RR Management reader.

Every HTTP proof here is Nest/controller auth/session + actual PostgreSQL
queries on `127.0.0.1` with synthetic fixtures; instrumentation delays or
observes function boundaries without mocking protected SQL. Advisory wait
assertions inspect `pg_stat_activity`, `pg_locks` and/or `pg_blocking_pids`,
not a sleep alone. No bearer, factor secret, recovery code or real customer
value is persisted to these logs. Complete request traffic and all 85 core
GET patterns were **not** exhaustively interleaved; already-delivered bytes
and noncooperative DBA mutations remain explicitly excluded.
