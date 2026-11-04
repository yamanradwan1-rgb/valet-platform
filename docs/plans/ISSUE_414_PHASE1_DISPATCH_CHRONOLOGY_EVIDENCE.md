# Issue #414 Phase-1 Dispatch current-episode source evidence

**Scope:** ALT-02 (initially uncovered queue), ALT-03 (decline/requeue); P1 only.
**Source baseline:** `4c4d142039a2d97d75ee256c39cf71ec794b8ea5`.
**Decision:** Owner-delegated Prime chose current-source **Option A** after
genuine PostgreSQL 17 source proof (chronology 5/5, original reader 5/5).
No schema marker or migration is authorized by this choice. This evidence
does not activate Management alerts.

## Relevant persisted identity and event contracts

- `Task` is the authoritative current projection: `status`,
  `current_assignee_membership_id`, `version`, Organization, Location,
  ValetSession, Task type. Its successful current-projection transitions
  increment `version` exactly once under lock/optimistic version check.
- Initial Parking Task creation in
  `apps/api/src/modules/dispatch/queue-parking-task-command.ts` inserts Task
  version 1 in QUEUED and one immutable `DispatchEvent(QUEUED)` in one
  transaction. Retrieval initial queue follows the analogous atomic source in
  `apps/api/src/modules/retrieval/guest-retrieval-request-command.ts`.
- `decline-task-command.ts` is the currently authorized transition from
  ASSIGNED back to QUEUED. `record-task-mutation.ts` atomically commits:
  `tasks.version=prior+1`, `DispatchEvent(DECLINED)`, and
  `AuditEvent(TASK_DECLINED)` with numeric
  `metadata_json.{fromVersion,toVersion,fromStatus,toStatus,sessionId}`.
  The Dispatch and Audit rows receive the same operation timestamp.
- Other inspected Task writers (assign, accept, reassign, emergency takeover,
  parking/retrieval starts/completions/cancellations) do not return Task to
  QUEUED. Physical ValetSession custody and Task assignment remain separate.
- `dispatch_events.id` and `audit_events.id` are random UUIDs.
  `occurred_at` is `timestamptz(3)`. Even events with different timestamps
  may invert relative to Task commits because the existing helper uses
  `transaction_timestamp()` after potentially waiting on locks. Neither
  `(occurred_at, id)` nor `(created_at, id)` is a proven transition order.

## Option A: only current QUEUED episode, no total historical ordering

Reader input must be an exact Organization/Location scope authorized for the
current CA/LM and the authenticated Staff Session; P1 alert source eligibility
must be established by the caller before the source query. SQL independently
checks active persisted User+Membership+role+exact Location grant and bounds
every Task by Organization and Location. It never returns guest/private vehicle,
key-slot, GPS, payment, or free-text decline details.

To qualify, the current Task must be QUEUED, unassigned, and compatible with
the current ValetSession stage. Exactly one of these mutually exclusive cases
applies:

1. **ALT-02**: `Task.version=1`; exactly one matching `DispatchEvent`, of
   type `QUEUED`, with the same Operation/Task creation timestamp. Episode
   identity `Task.id:1`.
2. **ALT-03**: `Task.version>1`; exactly one same-scope `TASK_DECLINED`
   Audit row whose metadata has
   `fromVersion=Task.version-1`, `toVersion=Task.version`,
   `fromStatus=ASSIGNED`, `toStatus=QUEUED`, the exact Session ID,
   and a numeric current version, plus exactly one matching immutable
   `DispatchEvent(DECLINED)` with the same Task/Organization/Location,
   operation time, actor, and prior assignee, with null new assignee.
   Episode identity `Task.id:Task.version`.

An absent, duplicate, malformed, cross-scope, or inconsistent qualifying
history record yields no alert. Matching same-millisecond Dispatch records
that cannot be uniquely tied to the versioned Audit row also yield no alert.
No UUID tie-breaker is trusted as chronological evidence. Current Task
assignment or Task termination immediately retires the uncovered case.
The reader applies proof and the user-specific delay **before** the final
bounded result limit; a source is never truncated before eligibility. For
current Important uncovered Tasks it sorts the entire proven eligible set
by `occurred_at DESC, Task.id DESC` and takes at most the newest 21; UUID
breaks only display ties and never establishes historical mutation order.

An exact Task navigation lookup must repeat current source authorization,
require the current episode identity as well as Task ID, and return null for
a stale episode. A remembered source UUID cannot authorize a later episode.
P1 contains no Seen receipts and does not implement ALT-04.

## Clock defect and narrow correction

On the pinned source, `loadDispatchOperationTime` reads
`transaction_timestamp()::timestamptz(3)`. Its value is fixed at transaction
start, **before** possible Task/session/Shift row lock waits. The current
Task version/Audit correlation proves episode identity but does not make that
timestamp a safe start of queue/requeue elapsed time.

The accepted narrow correction is a new server-time read
`clock_timestamp()::timestamptz(3)` **after the existing authorization/row
locks** and before creating the initial queued Task or mutating a declined
Task. The identical captured Date must be written to Task timestamp,
DispatchEvent and, for declines, AuditEvent in the same transaction. Both
initial QUEUED writers are in scope: Parking queue and guest Retrieval
request. DEC-040 requires the guest request to share one database-authored
instant among `RetrievalRequest.requested_at`,
`ValetSession.retrieval_requested_at`, queued Task, DispatchEvent,
`RETRIEVAL_REQUESTED` custody Audit and optional staff push intent.
The same captured post-lock instant is retained for **all** of those records
after the Session and Management-settings locks; no version, state transition,
SLA target snapshot, custody identity or retry semantics change.
Other Task/ValetSession/custody/handoff operations still use their existing
clocks.

For a source whose timestamp is proven, eligibility is strictly
`clock_timestamp() > episode_time + personal_delay_seconds * 1 second`.
Equality does not trigger. ALT-02 and ALT-03 use their own bounded delays,
and no Task emits both in the same current episode.

**Mandatory legacy cutover:** previously committed episodes used the old
transaction-start clock and can have skew. Task.version/Audit identity does
not distinguish their clock provenance. Both the list and exact source
readers therefore require `postLockClockCutover: Date`, passed solely from
trusted server-side configuration after an operational rollout gate. They
throw for missing/invalid configuration. They fail closed on every episode
where `occurred_at <= cutover`; comparison is **strict `> cutover`** so
millisecond ties cannot admit a legacy event. Before activating alerts,
Operators must quiesce every old writer and in-flight transaction, deploy
the post-lock fix, capture `clock_timestamp()` on the database server
**after** quiescence, configure the resulting trusted cutover, and then
enable P1. If that gate cannot be proved, P1 ALT-02/03 must remain disabled.
No schema marker, persistence rewrite, automatic cutover guess or
unstated release-time value is introduced.

## Verification and residual limits

Genuine PostgreSQL 17 fixture runs use fresh disposable DBs, actual
migrations and provisioned least-privileged runtime roles. The original
source-proof run:

- `issue414-dispatch-source-chronology.integration.test.ts` **5/5 passed**
  on rerun, after correcting a synthetic duplicate-Audit test seed for the
  existing actor-provenance constraint. This proves versioned current
  decline, committed same-ms collisions, rollback, competing declines and
  the pre-fix transaction-start clock skew under a held row lock.
- `issue414-dispatch-uncovered-reader.integration.test.ts` **5/5 passed**
  before the cutover guard addition, demonstrating current-case folding,
  role/Location denial, legacy ambiguity suppression and evidence before
  the bounded result.

The first complete post-fix focused run completed on actual PG17:
**13/13 passed** across six isolated suites. This included Parking initial
queue and decline row-lock waits, guest Retrieval queue blocked Session lock,
matching RetrievalRequest/Session/Task/Dispatch/Custody-Audit timestamps,
strict cutover equality suppression, current source CA/LM authority, stale
episode rejection, absent/duplicate legacy evidence and pre-limit proof.

Existing adjacent regression suites also completed **24/24 passed** across
`dispatch-queue`, `dispatch-assignment`, `guest-retrieval-request`,
`guest-t3-domain-rollback`, and
`management-sla-retrieval-concurrency`. These verify the guest retry,
custody/Audit rollback, Task assignment versions and SLA-settings
serialization after the narrow clock source change.

A subsequent combined PG17 rerun checked the new 23-eligible-Task
exercise for **newest** global 21 selection and direct ALT-02 Retrieval
reader projection. It passed **13/14** (standard 10/11, race 3/3);
the only failed test was the pre-existing 22-sequential-Task limit fixture
exceeding Vitest's default 5-second test timeout during a heavily loaded
Windows run (reported elapsed 5,467 ms); there was no failed SQL/source
assertion. The two >20-Task limit tests were given explicit 30-second
timeouts, with unchanged assertions, and the isolated genuine PG17 limit
suite rerun **passed 2/2**, exit 0, including the previously timed-out
case and globally newest 21-of-23 proof. The combined run's nonzero exit
is retained in the evidence as an actual timing failure; the targeted
fix/rerun is separately recorded rather than retroactively claiming
the combined run passed.

No deployment, CI, pilot-scale query-plan check or product runtime was
verified.

Index note: Dispatch history has `(task_id, occurred_at, id)`; Audit history
has a Session-time lookup index rather than a Task-version index. The reader
only examines current QUEUED tasks and verifies the current version before
the bound. Real pilot-scale query plans and bounded latency remain required
before any activation. No index migration is inferred from a test-scale
success.
