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
U-004/MOB-025 still owns process count, concurrency, batch size, rate limits,
resources, backlog, and latency objectives.

## Observability and unresolved lifecycle

The worker observer accepts only bounded operational concepts such as event,
result class, attempt, retry bucket, and cleanup counts. Tokens, hashes,
credentials, row IDs, tenant IDs, domain IDs, payloads, and provider bodies are
not permitted.

Thirty days without `last_confirmed_at` makes an ACTIVE registration stale,
but does not prove provider invalidity. The accepted state machine has no
truthful stale-maintenance terminal state. Cleanup therefore retains these
registrations pending a focused lifecycle decision; it does not abuse
DISABLED, PROVIDER_INVALID, or SUPERSEDED.
