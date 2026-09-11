# Staff Push Worker Operations

This runbook covers the MOB-020D Android Staff Push delivery worker. Push is a
best-effort attention hint only. The Task queue remains canonical and operator
recovery must never mutate RetrievalRequest, Task, ValetSession, DispatchEvent,
or AuditEvent rows to compensate for push delivery.

## Deployment boundary

Run the worker from the existing API artifact with
`pnpm --filter @valet/api start:push-worker`. It uses the ordinary least-
privileged runtime database role. It is a separate process entrypoint, not a
separate service or authority boundary.

Every DEC-075 policy variable in `.env.example` is mandatory and must retain
its accepted value. There are no code defaults. These independent switches
support rollback without disabling Retrieval:

- `STAFF_PUSH_RETRIEVAL_CREATION_ENABLED=false` stops new intent creation.
- `STAFF_PUSH_WORKER_SENDING_ENABLED=false` stops claims and provider sends.

During a push incident, disable creation first and sending second. Disabling
creation intentionally does not make the guest Retrieval command fail. When
creation is enabled, a real intent/delivery write failure still rolls back the
canonical Retrieval transaction.

Sending also requires an explicit non-secret `STAFF_PUSH_FCM_PROJECT_ID`.
Each environment must name its own Firebase project. Credentials use Google
Application Default Credentials outside application configuration and Git;
the deployment identity needs `cloudmessaging.messages.create`. Never put a
service-account document, private key, or access token in dotenv, logs, the
database, Native configuration, or support output.

## Recovery model

Claims are short database transactions. Provider I/O occurs only after commit
and after eligibility is revalidated. A 30-second lease fences finalization;
expired leases can be reclaimed. If a provider accepts and the process dies
before finalization, a replacement worker can send the same generic attention
hint again. This bounded duplicate is expected and is not exactly-once
delivery.

Transport timeouts and interrupted connections are UNKNOWN results. They use
the same four-attempt, five-minute intent bounds as transient, rate-limited,
and configuration outcomes. Do not manually advance delivery states or extend
TTL. Correct the environment or provider incident and allow durable due rows
and expired leases to recover normally.

The process evaluates cleanup every 24 hours through
`cleanup_staff_push_v1()`. The runtime role has EXECUTE only and retains no
generic table DELETE privilege. Each invocation uses a fixed 1,000-row
transaction-safety ceiling; this is not a capacity choice or throughput SLO.
Every loop also performs provider-independent expiry/exhaustion recovery and
DEC-076 stale-registration reconciliation, including while provider sending is
disabled. Those passes use a fixed 10-candidate transaction-safety guard and do
not claim or increment provider attempts.
U-004/MOB-025 still owns process count, concurrency, batch size, rate limits,
resources, backlog, and latency objectives.

## Observability and stale lifecycle

The worker observer accepts only bounded operational concepts such as event,
result class, attempt, retry bucket, and cleanup counts. Tokens, hashes,
credentials, row IDs, tenant IDs, domain IDs, payloads, and provider bodies are
not permitted. Observer failures are ignored by correctness paths. This seam is
not a production metrics exporter or alerting system; MOB-024A owns that system.

Thirty days without `last_confirmed_at` makes an ACTIVE registration stale,
but does not prove provider invalidity. Send-time eligibility rejects the row
using database time. Bounded DEC-076 maintenance rechecks under row lock, then
uses DISABLED with `STALE_CONFIRMATION_TIMEOUT`, clears the raw token, and
suppresses its PENDING/RETRY_WAIT deliveries. A currently LEASED delivery is
not rewritten. Later authenticated desired-state registration creates a fresh
ACTIVE row and never reactivates the terminal stale row.

Provider TTL is derived from the database-authoritative remaining intent
lifetime and reduced using monotonic elapsed time through credential acquisition
immediately before the HTTP request. Application wall-clock skew cannot extend
the provider lifetime, and retries never restart the five-minute TTL.
