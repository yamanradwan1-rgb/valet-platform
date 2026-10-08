# T3 — Guest anti-abuse and PostgreSQL resilience

Task authority: the Project Owner's T3 implementation brief and accepted U-07 /
U-09 in `GUEST_APP_PRODUCTION_READINESS_IMPLEMENTATION_PLAN.md`. Human owner:
the invoking Project Owner. No dedicated T3 GitHub issue was found in the live
repository search; historical #70 is context, not this task's issue identity.
Base: `95b515e7094145eaafa2f70ac583b2a63b68bec0`.
Branch: `fix/guest-anti-abuse-postgres-resilience-t3`.

## Contract ledger

LOCKED: PostgreSQL exact 900-second rolling windows, shared HMAC secret/full-key
predicates, advisory serialization, fail closed, generic 429/503, no-store;
DEC-025 verified TLS/non-owner runtime; DEC-064 generation/current exact visit
authority; DEC-040/042/043/044/057/070/091 business effects and atomic history.
U-07 authorizes derived request-class parameters, authenticated/hostile
separation, same-NAT burst handling, bounded maintenance and measured headroom.

Transport carry-over refinement: authorized events retain the original credential
HMAC key for N-1 visibility and also carry a server-derived visit HMAC group.
Class and aggregate budgets bind that group, so bootstrap consumption, cookie
replacement or staff credential reissue cannot reset a visit's protected window.
Existing ungrouped presentations for the credential are bound under both locks
without changing their key, timestamp, class or state. No client-supplied visit
identity or raw identifier is persisted in limiter storage.

Production defaults to `GUEST_T3_RATE_POLICY=COMPATIBILITY`: the original 180
per-credential aggregate remains an additional floor during N/N-1 coexistence.
`ACTIVE` removes only that legacy floor after T4 verifies all replicas are T3,
all in-flight N-1 requests have drained, and a full protected window has passed.
Local tests default ACTIVE. Invalid policy values fail startup. This task does
not enable ACTIVE policy in production. The 2x promise applies to ACTIVE.

DERIVED: one classified event can enforce both a visit aggregate and its
request-class sub-budget; NULL historical classes conservatively consume every
sub-budget. An internal persisted-authority probe discloses no result and grants
no domain authority. Authorized admission must commit before any public result;
every downstream protected command still reauthorizes under its own parent lock.
Only unknown/invalid traffic needs a durable source-failure PENDING reservation.
A credential invalidated after admission must obtain/count a source-failure slot
before returning an invalid-access result. A crashed authorized request remains
charged; a crashed unknown request remains PENDING until the exact window expires.

FORBIDDEN: Customer production/UI changes, T2 polling, new lifecycle transitions,
staff/proof threshold changes, memory fallback, broad DELETE/TRUNCATE, replay,
production/staging load, enrollment enablement, PR/merge/deploy/issue closure.

No domain entity, business audit event, role, permission, Company/Location policy,
ValetSession transition or Task/Dispatch transition is added. Ephemeral limiter
events and runtime resource boundaries are the affected persistence. The
credential verifier is never a persisted limiter identity: only domain-separated
HMAC output is retained. No new dependency is required.

## Deterministic supported envelope and derived engineering parameters

All counts below are per exact rolling 900 seconds. One visible legacy tab polls
180 times; two tabs poll 360 times. The supported maximum adds two initial loads,
six manual refreshes, six synchronized foreground/wake reads, six reconnection
reads, and twelve approved payment/receipt projections: **392 reads**. Browser
restore uses the canonical session GET and belongs in this same allowance.

Lifecycle envelope: two prepares, two enrollment attempts, four exchange/recovery
attempts, six switch/reconciliation attempts and two end-access attempts: **16**.
Operational envelope: four retrieval requests, four pre-start cancellations, six
absolute tip attempts and two rating attempts (including exact retries): **16**.
Proof envelope: one issue and one deliberate rotation: **2**. These are offered
presentations, not permission for an otherwise disallowed business mutation.

| Class | Routes | Budget | Identity / semantics |
| --- | --- | ---: | --- |
| A | GET `/v1/guest/session`; GET `/v1/guest/valet-sessions/:sessionId/payment` | 784 | Server-authorized visit HMAC group; original credential HMAC retained; count all attempts; 2x 392 |
| B | POST `/v1/guest/browser-session/{enroll,exchange,prepare,switch,switch/reconcile,end}` | 32 | Same visit aggregate when currently authorized, including NONE reconciliation and rejected re-enrollment; count all attempts; 2x 16 |
| C | POST `/v1/guest/session/{request-retrieval,cancel-retrieval,rating}`; PATCH `/v1/guest/payment/tip` | 32 | Same visit aggregate; count all attempts; 2x 16 |
| D | POST `/v1/guest/session/handoff-verification/{issue,rotate}` | 16 | Same aggregate; independent session issuance 5/900s and proof failure 10/900s remain binding; five attempts per proof unchanged |
| E | Missing, malformed, duplicate, unknown, expired, revoked or stale credentials on every Guest route | 60 source failures/pending; 180 unknown credential presentations | Existing `v1:guest-client-address` and `v1:guest-token`; conservative reservation before disclosure; no new event on exhausted quota |
| Anonymous allocation | POST `/v1/guest/browser-session/enroll`; POST `/v1/guest/browser-session/switch/reconcile` returning clean NONE without current authority | 4000 anonymous admissions per source | Separate `v1:guest-enrollment-address`, 2x maximum 1000-person arrival cohort (one clean reconciliation and one enrollment per person); does not authorize exchange or bypass E |

Authorized A/B/C/D share `v1:guest-token` with the visit aggregate cap **864**
(784+32+32+16). Alternating routes cannot multiply it. Bearer consumption prevents
simultaneously valid legacy and Browser Session business transport; transition
proofs remain the sole DEC-064 exception. Server-authorized recovery may use the
current browser identity only through its existing independent authority check.
No cookie's mere presence enables an authenticated quota. Failed transition
proofs still consume the shared source failure quota before invalid disclosure.

Every blocking scope computes Retry-After using DB wall time and the event whose
expiry brings its count below threshold; take the greatest applicable blocker,
clamped to integer 1..900. No scope/key/validity detail is public. T2 consumes this
contract without requiring any T2 client deployment for legacy five-second polls.

## Runtime / maintenance contract

Measured index selection (owned local DB, 100,000 current unrelated events):
the group-window lookup without an index visited 3483 shared blocks and took
84.47ms. The scoped partial group/window index used an Index Only Scan, seven
shared blocks (3 hit / 4 read), and 0.104ms at its scan node. Steady read p95
fell from 105.79ms before that index to 24.27ms after it in the same run.
Forward migration 077 adds that measured index; it excludes NULL groups and
IGNORED events. No clock-dependent or speculative partial predicate is used.

Connection acquisition 2s; bounded admission queue; lock 2s; statement 3s;
idle-in-transaction 2s; transaction 5s; Guest API operation 6s. PostgreSQL 17 is
the repository-supported runtime and provides server-side `transaction_timeout`;
startup must verify version/settings rather than assume support. Server deadlines
terminate work; a JS Promise race alone is not cancellation proof. Failed rollback
or a terminated client requires destruction, never recycling. Commit-response loss
remains ambiguous and never triggers automatic POST replay.

Failure-discovered correction: changing `transaction_timeout` after BEGIN does
not rearm an already-running native timer. The real multi-transaction test
exposed a still-active `pg_sleep` after the outer deadline despite rollback of
the earlier write. The common Guest transaction boundary now sets a shortened
remaining budget in a separate autocommit statement **before BEGIN**, restores
the startup setting before release, and destroys the lease if restoration fails.
The test verifies both the actual native remaining budget and termination;
successful shortened transactions must also pass the startup-setting check on
reuse. This behavior follows PostgreSQL 17's
[timer assignment hook](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/tcop/postgres.c#L3467).
Socket-close detection alone is insufficient on every supported test platform;
[PostgreSQL documents the platform limits](https://www.postgresql.org/docs/17/runtime-config-connection.html#GUC-CLIENT-CONNECTION-CHECK-INTERVAL).

Production pool maximum is a validated input derived from `(allowed connections
- reserved admin/maintenance/other consumers) / maximum simultaneous API instances`,
including rollout surge. Missing capacity inputs fail startup closed. Local caps
are test/development parameters, not deployed capacity evidence; T4 verifies real
capacity and proxy 7s/T2 8s read/12s mutation integration budgets.

Measured refinement of the proposed 500ms acquisition ceiling: a synchronized
100-visit/two-instance burst on local PostgreSQL 17 returned 31 finite 503s with
six connections per instance. T3 tests a 2s acquisition ceiling instead, within
the unchanged 6s operation deadline. This changes resource scheduling, not any
security quota; production capacity still requires T4 evidence.

Maintenance uses a parameterless migration-owner SECURITY DEFINER function,
fixed safe search_path, PUBLIC denied, runtime EXECUTE only; at most 1000 expired
events per call, server cutoff one hour, ordered locked candidates with SKIP LOCKED.
No current-window event or business/audit history is eligible. One bounded worker
per API may request a batch on a fixed interval; failure cannot change enforcement
or an already committed response. Distributed advisory try-lock prevents redundant
maintenance contention. Backlog/oldest age and cost are internal bounded metrics.

## Compatibility / rollback

Forward migration preserves every existing row, scope, key and exact protected
window. Historical NULL classes count against aggregate and all sub-budgets.
N-1 still enforces its tighter 180 credential budget; N in COMPATIBILITY also
enforces exactly 180 against the original credential key, honors historical NULL
events, and serializes on that same advisory lock. New class/group columns are
nullable and do not invalidate N-1 SQL or existing privileges. Thus coexistence
is conservative and cannot create additional quota. Mixed-version tests execute
the immutable baseline limiter at the pinned base, not a hand-written simulation.
The headroom promise starts only after every API enforces T3 and the overlap
window drains; enrollment stays disabled throughout this task and until T4.
Rollback retains the classified schema, bounded cleanup and a T1 cookie-compatible
server enforcing T3 budgets; never truncate events, change HMAC secret, resurrect
consumed links, or independently restore old quotas with legacy polling.

## Evidence

Pre-change baseline: repository-owned PostgreSQL harness, real Nest applications,
Guest enrollment shared-state test: 1 file / 1 test passed. This is runtime proof
of the original 60-allocation floor, not evidence for the new T3 thresholds.
Final focused local evidence uses two real Nest applications with independent
runtime pools and an owned shared PostgreSQL 17.11 database. A synchronized
100-visit cohort behind one source, despite 60 live crashed PENDING reservations,
returned 100 successes, zero legitimate 429 and zero 503. Seventy hostile
presentations produced 60 invalid-access responses and 10 bounded 429 responses.
The 784th read was admitted exactly once across concurrent replicas; the next
presentation and a restarted replica remained blocked. Lifecycle/operational
class boundaries admitted exactly 32 and proof class exactly 16; independent
handoff issuance and attempt caps still apply. These prove admission headroom,
not permission to complete repeated business effects.

The final 100,000-current-unrelated-event read fixture compared the immutable
base implementation with T3 (20 reads per sample). Baseline/T3 respectively:
23/7 SQL statements and round trips; 5/1 acquisitions; 3/1 transactions;
2/1 event inserts; 1/0 actual updates; 2/0 request cleanup calls. Twenty reads
created 40/20 events, including 20/0 IGNORED reservations. Indexed T3 p50/p95/p99
were 6.920/8.934/17.649ms; baseline 70.276/85.830/175.811ms. Acquisition p50/p95/p99
were 0.072/0.153/0.274ms for T3 and 0.035/0.076/50.085ms for baseline, including
its cold connection. This small local comparison has no production SLO claim.
The final redacted EXPLAIN reproduction used 3479 shared hits without the group
index (35.712ms execution) and 3 hits/3 reads with it (0.095ms execution).

Maintenance preserved three current events while converging 2501 old events
across two workers and one locked old row; each batch stayed <=1000. Seven small
local samples had p50 2.739ms and observed upper-tail/max 8.997ms. Runtime DELETE,
TRUNCATE, public execution and caller-selected cutoff were denied. Real statement,
advisory-lock, native transaction, overall operation, database connection
exhaustion and socket-loss tests proved rollback, no hanging SQL, safe disposal
and healthy pool reuse. Actual startup settings and successful shortened
transaction reset are verified.

Retained, redacted measurements: [cost](evidence/guest-t3/cost.json),
[two instances](evidence/guest-t3/two-instance.json),
[maintenance](evidence/guest-t3/maintenance.json). Exact commands, final counts,
failure classifications and the changed-file manifest are in the
[delivery report](GUEST_T3_DELIVERY_REPORT.md).

Local evidence never certifies T4 HA, actual production capacity/TLS topology,
T6 100/500/1000 staging ladder, an 8h shift or 26h continuity qualification.
No attributable WAL/dead-tuple/soak measurement was produced; inserted/updated
rows and query plans are measured instead. Do not infer those missing results.
