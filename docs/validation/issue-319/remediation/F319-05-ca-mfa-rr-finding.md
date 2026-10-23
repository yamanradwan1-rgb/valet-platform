# F319-05 — P2 confirmed: Company Admin RR overview stale MFA factor

This is a **new audit finding** discovered during the Owner-approved
F319-01..04 regressions on 2026-10-23. The Owner subsequently approved its
focused remediation ("صلحها بطريقك"). The historical RED evidence below is
preserved separately from the GREEN tests. This finding is distinct
from LM grant revocation and cannot be inferred safe from READ COMMITTED
Physical key-slot MFA tests.

## Real HTTP and PostgreSQL reproduction (RED)

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs/validation/issue-319/run-lab.ps1 -Suite audit -Evidence remediation -RunTag ca-rr-mfa-candidate -TestFile test/dashboard-issue319-ca-mfa-rr-candidate.integration.test.ts
```

`logs/ca-rr-mfa-candidate-audit-tests.txt`: **1 FAIL / 0 PASS / 0 SKIP**;
failure `expected 200 to be 403` (the test expects the security-safe denial).
The test fixture created a synthetic Organization, Location, key slot and a
Company Admin with real Staff bearer. It completed canonical HTTP MFA
enrollment/confirmation to receive a real recovery code; baseline CA Physical
`GET .../physical-resources/overview` returned the expected scoped key slot.

The actual in-flight HTTP GET was intercepted **after its first Company Admin
eligibility SELECT** inside a pinned PostgreSQL `REPEATABLE READ` transaction.
`pg_stat_activity.backend_xmin` demonstrated the held snapshot; the recorded
backend PID had no earlier Organization advisory. While the request paused,
`POST /v1/staff/auth/mfa/recovery/begin` with that actual recovery code
completed HTTP 200 and committed retirement of the old factor. A separate
committed read confirmed `user_mfa_totp_factors.state='RETIRED'`, non-null
`retired_at`, and unchanged `staff_auth_sessions.mfa_factor_id` and
`mfa_authenticated_at` on the same Staff session. The original pinned RR
snapshot was unchanged when the reader resumed; its response was HTTP **200**
instead of the required deny **403**.

Recorded trace relative timestamps (ms): initial RR snapshot `113661.997`;
snapshot/no-org-advisory check `113674.437`; actual MFA recovery committed
`113718.601`; factor-state verification `113719.936`; stale RR reader
resumed `113720.360`. These are deterministic hook barriers plus real SQL
state observations, not sleep-only assumptions.

The candidate's **first run** failed at the exact HTTP status assertion.
The independently repeated RED execution in
`logs/ca-rr-mfa-confirmed-audit-tests.txt` preserved the same strict
assertion and recorded the sanitized event
`responseStatus=200 containsSyntheticKeySlot=true` after canonical factor
retirement committed. Thus the original protected projection, not merely a
status mismatch, was reproduced. **Both RED logs remain immutable.**

Private PostgreSQL 17.11 at `127.0.0.1`, port `56393`, cluster owned by
`issue315_owner`. `logs/ca-rr-mfa-candidate-audit-identity.txt` verifies its
data directory and version. Cleanup confirms **zero child databases, zero
child connections and OWNED_CLUSTER_DIRECTORY_REMOVED=True**.

## Root-cause hypothesis and boundary

`physical-resource-overview-transaction.ts:72-85` starts RR and creates a
snapshot before CA authorization. `physical-resource-authorization.ts:53-72`
uses the pre-MFA CA eligibility SELECT, then enters the normal Management
authorization path. `auth/mfa/mfa-assurance-policy.ts:113-126,153-175` looks
up factor.state from the same older MVCC snapshot, while canonical
`auth/mfa/mfa-recovery.service.ts:68-105` retires the factor without changing
the referenced Staff session assurance timestamp/id. The newly committed
RETIRED state may therefore remain invisible to the already-started RR
request, even though MFA assurance is checked later. Existing LM pre-BEGIN
grant advisory avoids stale LM snapshots but has **no authority to fix CA MFA**.

The independent W4 read-only reviewer provisionally classifies this as P2,
with 0 confirmed P0/P1 in the exercised scope. Scope: an existing properly
MFA-assured Company Admin whose current factor is invalidated while a
specific RR Overview request is in flight. It does not prove fresh-session
MFA bypass, cross-tenant BOLA or retrospective invalidation of delivered
bytes. An accepted initial authorization fence for this factor retirement was
**not** established before the actual commit.

## Owner-approved narrow fix and exact RED-to-GREEN result

`apps/api/src/modules/dashboard/physical-resource-overview-transaction.ts`
now preserves the Location Manager's pre-RR Organization SHARED fence and
the Company Admin's original RR/exclusive Management path. On the CA branch
it performs a fresh autocommit, **non-authoritative** eligibility/MFA preflight
before `BEGIN` and still runs the complete canonical CA authorization in RR.
After the exact Staff session/User are `FOR UPDATE`-locked, it `FOR SHARE`-locks
the **persisted exact ACTIVE MFA factor** through the protected projection and
`COMMIT`. If recovery retired the factor after the RR snapshot, PostgreSQL
detects a conflicting updated factor row (`40001`); at most five full fresh
transaction attempts redo all authorization, never reuse stale projection data.
Existing rollback, ambiguous-lease quarantine and session advisory release
remain. There is no CA LM-SHARED-to-EXCLUSIVE upgrade, database privilege
change or UI change. The exact isolated source patch was committed as
`6660ee8117edae1baccedcd1404da7822be5d5c5` after targeted and broad
tests confirmed the same source bytes.

Same unchanged reproduction command, now with `-RunTag ca-rr-mfa-fixed`:
**1 PASS / 0 FAIL / 0 SKIP**, `logs/ca-rr-mfa-fixed-audit-tests.txt`.
Its real HTTP trace preserved the RR snapshot and canonical MFA recovery order;
after retirement it observed **`responseStatus=403`
`containsSyntheticKeySlot=false`**, plus fresh 403. Private PostgreSQL 17.11
port 57597, runtime child role non-superuser, 0 child databases and
connections, owned cluster directory removed.

Companion command, `-RunTag ca-rr-mfa-concurrency -TestFile
test/dashboard-issue319-ca-mfa-rr-regression.integration.test.ts`:
**2 PASS / 0 FAIL / 0 SKIP**, `logs/ca-rr-mfa-concurrency-audit-tests.txt`.
Reader-first held the factor fence through the real 200 overview and
`pg_blocking_pids` identified recovery HTTP blocked on reader PID 29436;
recovery then committed and a fresh reader was denied. Revoker-first observed
actual recovery PID 37140 waiting behind controlled factor-row gate PID 40128,
then a queued RR reader behind the writer; recovery committed before the
HTTP **403 with no synthetic Key Slot**. Both use distinct synthetic Staff
sessions for the same CA, one MFA-assured and one not, and assert original
assurance IDs/timestamps were not silently rewritten. The second test proves
the queue and safe HTTP result; it does **not** instrument the internal
SQLSTATE `40001` itself. Port 57709; same isolated cleanup verified.

This is targeted F319-05 GREEN evidence only. Final full #319, #315,
performance, build, independent review and the overall closure decision are
recorded in `FINAL_REMEDIATION_ACCEPTANCE.md`; other RR Company Admin read
families cannot be inferred safe from this endpoint-specific fix.
