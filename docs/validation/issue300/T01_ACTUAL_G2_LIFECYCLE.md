# Issue #300 — T01 full operational lifecycle G2 follow-up

**Date:** 2026-10-18 (Asia/Amman). **Scope:** local G2 proof only; **not**
production acceptance, not release approval and not a substitute for other
T01–T70 or U05-R01–R09 gates.
**Local committed test candidate:** `f01b43da9f7d5ca7fd535b4a17306a5f2bd835ae`.

## Exact owned runtime

- Dedicated PostgreSQL 17.10 `issue300_g2_pg17` at loopback
  `127.0.0.1:55480/issue300_g2`, migration **94/94** already applied.
- Existing ordinary API `3161`, guarded U05 API `3162` and Dashboard
  `3113` were not stopped or altered.
- A **temporary task-owned API 3163** was started from the same compiled
  Prime backend with `NODE_ENV=test`, the exact guarded G2 DATABASE_URL,
  the existing local MFA/anti-abuse secrets, explicit staff Origin
  `http://127.0.0.1:3113`, and a newly generated 32-byte
  `HANDOFF_VERIFIER_HMAC_SECRET_B64URL` in the gitignored
  `tmp/issue300-g2-owned/api-auth-secrets.env`. No test key or Guest bearer
  is displayed or committed. MFA bypass, payment bypass and handoff
  verification bypass were **not** enabled.
- After the final successful full-chain run, the **verified exact
  task-only API3163 process was stopped**. Its PID matched its isolated
  `u05-api3163.pid` and the 3163 listener; original APIs
  `3161/3162` and Dashboard `3113` all remained HTTP 200,
  while G2 PostgreSQL remained up. No unrelated process was stopped.
- The proof script checks the exact task-owned G2 destination and only
  local API ports 3162/3163. The reusable `seedIssue300Http` setup writes
  **other, separate** tenant/users, Vehicle, pre-parked Session, Parking/
  Retrieval Task, Custody, Dispatch, Audit and Incident oracle fixture rows
  using SQL. These are not real operational-domain writer coverage. After
  seeding, the **new actual T01 Session UUID** is created and transitioned
  only by HTTP. Its subsequent SQL-only prerequisites are Location
  `accepting_intake`, active Supervisor Shift, three Key Slots, Parking
  Zone and Spot. Every asserted T01 custody/Audit/Dispatch source row is
  scoped to that fresh actual HTTP Session UUID, not the seed's SQL
  Session. No prerequisite setup is falsely counted as a domain writer.
- Runtime/API destination assurance remains bounded: the proof first
  authenticates with a newly seeded unique G2 Supervisor password before
  attempting any real Check-in mutation, providing a data-route canary.
  It does **not** independently attest the listener's binary SHA/process
  environment or its complete DB configuration. A separate process/DB
  attestation is required before any production-grade gate; test tools
  must not be repointed outside task-only ports and G2.
- The generated synthetic task-only organization/domain history intentionally
  remains inside disposable G2 for review, like the earlier G2 HTTP fixture
  family. There is no production data or production DDL. Repeated runs add
  isolated evidence rather than rewriting prior history.

## Executed writer and independent source assertions — exit 0

`apps/api/test/issue300-pg/issue300-operational-checkin-key-writer.mjs`
with `ISSUE300_FULL_LIFECYCLE_PROOF=1` and
`ISSUE300_LOCAL_G2_API_PORT=3163` executes the independently contained
`issue300-operational-retrieval-handoff.mjs` extension.

1. Real Supervisor Argon2 login; **real Intake**, Condition Completion,
   Complete Check-in, then Slot **A→B→C**, chaining actual optimistic
   Session versions. DB independently finds five persisted `KEY_CUSTODY`
   Slot Assigned/Cleared records (with correct actor, exact slot and born
   XID) and three source Audit rows. Real Company Admin TOTP MFA Search
   finds the historic Slot A witness while current slot is C; the
   C-only query in A's interval returns no Session. Actual Timeline IDs
   equal the persisted custody event IDs.
2. Real Parking Task **Queue→Assign→Accept→Start→Confirm** with the
   task-owned Zone/Spot and key C. DB verifies
   `RETURNED_TO_SLOT(C)`, a separate Dispatch `COMPLETED`, and
   `VALET_SESSION_PARKED` Audit, all born-XID; CA/MFA Timeline
   returns the exact three persisted source event keys.
3. Staff HTTP issues the real opaque Guest access credential; the Guest
   requests Retrieval through its own bearer token (never displayed).
   Session becomes `REQUESTED`, Retrieval Task `QUEUED`;
   the independently persisted Dispatch `QUEUED` has **NULL actor**,
   non-null birth XID, and is not falsely attributed to Supervisor.
4. Real task **Assign→Accept→Start Retrieval→Mark READY→Initiate Handoff**.
   Snapshot of actual persisted source proves the Retrieval
   `CHECKED_OUT(C)` occurred at the exact server-reported
   `retrievalStartedAt`. The **earlier Parking checkout remains a
   distinct historical source row**; there are two source `CHECKED_OUT`
   events, not a fabricated single transition.
5. Guest HTTP issues `PICKUP_CODE` material only after
   `HANDOFF_PENDING`; authorized Supervisor validates it using the
   separate real verification command. The final real
   `complete-handoff` command succeeds **without overriding the
   financial-release or verification guards**. Persisted Session is
   `COMPLETED`, current Slot is NULL and completion actor is the
   Supervisor; Retrieval Task and Retrieval Request are both
   `COMPLETED`; one verification row has non-null `verified_at`
   and `consumed_at`. No secret hash, raw Guest token or pickup code
   is read into diagnostics. The test's malformed-secret assertions
   use fixed non-secret error text instead of dumping credential values.
6. Distinct born-XID `KEY_CUSTODY RELEASED(C)`, Retrieval Dispatch
   `COMPLETED`, and seven lifecycle source Audit types are asserted:
   `RETRIEVAL_REQUESTED`, `VALET_SESSION_RETRIEVAL_STARTED`,
   `VALET_SESSION_HANDOFF_INITIATED`,
   `HANDOFF_VERIFICATION_ISSUED`, `HANDOFF_VERIFIED`,
   `VALET_SESSION_VEHICLE_RELEASED`,
   `VALET_SESSION_COMPLETED`. Release and Session completion
   have **the same occurredAt but distinct Audit UUIDs**.
   CA's independent MFA-authorized Timeline shows both Parking and
   Retrieval `CHECKED_OUT`, the final Release, Dispatch completion,
   and every exact persisted Audit ID as separate source-qualified facts.

The strengthened test completed with **exit 0** after the initial
expected precondition discoveries: existing proof API lacked handoff HMAC,
the fresh test API initially lacked required Staff Push configuration and
an explicit staff Origin, then all requirements were configured securely
for task-owned API 3163. The first Retrieval assertion also corrected an
incorrect assumption that Parking and Retrieval shared one checkout.
Those earlier aborted test-only Session attempts were not erased or
misrepresented as completed history.

## What this does NOT prove

- T01's **actual single G2 A→B→C lifecycle**, downstream source fidelity
  and CA/MFA evidence readback now have strong executed coverage. Full
  70-row acceptance still depends on distinct adversarial, concurrency,
  role-matrix, UI and performance criteria; no blanket Issue acceptance.
- The full U05 snapshot guarantee is **still blocked** by the reproduced
  old Audit→Task/Incident indirect parent race. Its production/unrestricted
  paging must remain fail-closed.
- The run is one sequential task-only operational lane, not 100k/1m skew,
  five concurrent readers plus writers, full cold/hot latency SLA, crashed
  writer recovery or all identity/policy mutation races.
- The final Timeline check verifies exact inclusion of separately persisted
  source keys for targeted lifecycle events, not that every possible source
  row has been exhaustively fetched or that duplicate/omission detection
  across every signed page was re-proven by this test. Separate R06 signed
  pagination coverage remains necessary.
- Genuine browser 200% zoom, native screen-reader parity, all T70 recovery
  and independent human G0 five-file exception review remain GAP.
- No Push, PR, merge to main, production migration, deployment or Issue
  closure was authorized or performed.
